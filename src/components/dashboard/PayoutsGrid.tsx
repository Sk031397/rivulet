"use client";

/**
 * The payouts of one flow as an editable AG Grid.
 *
 * - Click a recipient to edit it. A custom cell editor suggests people from the
 *   user's address book; entries are validated (email / phone) before they stick.
 * - Edits are held locally and highlighted until saved, with Ctrl+Z / Ctrl+Y
 *   (and buttons) to undo and redo them.
 * - Payouts that have already been paid are locked.
 * - The panel this lives in polls the server; that never overwrites edits you
 *   haven't saved yet.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState, type MutableRefObject } from "react";
import { AgGridReact, type CustomCellEditorProps } from "ag-grid-react";
import {
  type ColDef,
  type GetRowIdParams,
  type GridApi,
  type GridReadyEvent,
  type ValueSetterParams,
  ModuleRegistry,
  AllCommunityModule,
  ValidationModule,
} from "ag-grid-community";
import { Check, Clock, Loader2, Lock, Pencil, Redo2, Undo2 } from "lucide-react";
import { useAddressBook } from "@/lib/addressBook";
import { rivuletTheme } from "@/lib/gridTheme";
import { checkRecipient, isBlankRecipient, type Contact } from "@/lib/flowRules";
import type { Payout, PayoutState } from "@/data/dashboard";

ModuleRegistry.registerModules([AllCommunityModule, ValidationModule]);

/** Shared with the parent panel so Escape can cancel a cell edit without closing the panel. */
export interface EditGuard {
  editing: boolean;
  endedAt: number;
}
export const newEditGuard = (): EditGuard => ({ editing: false, endedAt: 0 });
/** True while a cell is being edited, or for an instant after an edit ended. */
export const isEditGuardActive = (g: EditGuard) => g.editing || Date.now() - g.endedAt < 250;

interface PayoutRow {
  /** Stable key: the payout id, or its label for older flows. */
  key: string;
  id?: string;
  label: string;
  amount: number;
  state: PayoutState;
  note: string;
  condition?: string;
  recipient?: string;
}

const toRow = (p: Payout): PayoutRow => ({
  key: p.id ?? p.label,
  id: p.id,
  label: p.label,
  amount: p.amount,
  state: p.state,
  note: p.note,
  condition: p.condition,
  recipient: p.recipient,
});

const money = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const baselineOf = (payouts: Payout[]) => new Map(payouts.map((p) => [p.id ?? p.label, p.recipient ?? ""]));

/* ── cell renderers ──────────────────────────────────────────────────── */
const STATE_CHIP: Record<PayoutState, { label: string; cls: string; Icon: typeof Check }> = {
  paid: { label: "Paid", cls: "bg-mint/25 text-emerald-800", Icon: Check },
  pending: { label: "Pending", cls: "bg-saffron/30 text-amber-800", Icon: Clock },
  locked: { label: "On hold", cls: "bg-ink/10 text-ink", Icon: Lock },
};

function PayoutCell({ data }: { data?: PayoutRow }) {
  if (!data) return null;
  // "Pending" is the normal state, so only the exceptions get a chip — it saves a whole column.
  const chip = data.state !== "pending" ? STATE_CHIP[data.state] : null;
  return (
    <div className="flex h-full min-w-0 flex-col justify-center leading-tight">
      <span className="truncate text-sm font-bold text-ink" title={data.label}>{data.label}</span>
      {/* Status chip shares the second line with the note, so it never squeezes the label. */}
      <span className="flex min-w-0 items-center gap-1.5">
        {chip && (
          <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 text-[10px] font-bold leading-4 ${chip.cls}`}>
            <chip.Icon className="size-2.5" /> {chip.label}
          </span>
        )}
        <span className="truncate text-[11px] text-ink/55" title={data.note}>{data.note}</span>
      </span>
      {data.condition && data.state !== "paid" && (
        <span
          className="mt-0.5 w-fit max-w-full truncate rounded bg-saffron/25 px-1.5 text-[10px] font-semibold text-amber-900"
          title={`Release condition: ${data.condition}`}
        >
          Condition: {data.condition}
        </span>
      )}
    </div>
  );
}

function AmountCell({ value }: { value?: number }) {
  // Flex-centred: AG Grid's cell line-height would otherwise pin inline text to the top of a tall row.
  return (
    <span className="flex h-full items-center justify-end font-extrabold tabular-nums text-ink">{money(value ?? 0)}</span>
  );
}

function RecipientCell({ value, data }: { value?: string; data?: PayoutRow }) {
  const locked = data?.state === "paid";
  return (
    <span className="flex h-full min-w-0 items-center gap-1.5" title={value || undefined}>
      {value ? (
        <span className="truncate font-mono text-xs text-ultra">{value}</span>
      ) : (
        <span className="truncate text-xs italic text-ink/40">{locked ? "No recipient" : "Click to add a recipient"}</span>
      )}
      {locked ? <Lock className="size-3 shrink-0 text-ink/35" aria-label="Locked: already paid" /> : <Pencil className="size-3 shrink-0 text-ink/25" />}
    </span>
  );
}

/* ── custom cell editor ──────────────────────────────────────────────── */
interface RecipientEditorProps extends CustomCellEditorProps<PayoutRow, string> {
  contacts: Contact[];
}

/** Text input with native suggestions drawn from the user's address book. */
function RecipientEditor({ value, onValueChange, eventKey, contacts }: RecipientEditorProps) {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  // Typing a character on a focused cell starts the edit with that character.
  const startedByTyping = !!eventKey && eventKey.length === 1;
  const [text, setText] = useState(() => (startedByTyping ? (eventKey as string) : (value ?? "")));

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    if (startedByTyping) {
      onValueChange(eventKey as string);
      el.setSelectionRange(el.value.length, el.value.length);
    } else {
      el.select();
    }
    // Run once when the editor opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full w-full items-center px-1">
      <input
        ref={inputRef}
        value={text}
        list={listId}
        onChange={(e) => {
          setText(e.target.value);
          onValueChange(e.target.value);
        }}
        placeholder="email or phone number"
        aria-label="Recipient email or phone number"
        autoComplete="off"
        className="h-8 w-full rounded-md bg-white px-2 font-mono text-xs text-ink outline-none"
      />
      <datalist id={listId}>
        {contacts.map((c) => (
          <option key={c.address} value={c.address}>
            {c.name}
          </option>
        ))}
      </datalist>
    </div>
  );
}

/* ── the grid ────────────────────────────────────────────────────────── */
export default function PayoutsGrid({
  flowId,
  payouts,
  refreshFlows,
  editGuard,
}: {
  flowId: string;
  payouts: Payout[];
  refreshFlows: () => void;
  editGuard: MutableRefObject<EditGuard>;
}) {
  const { contacts } = useAddressBook();
  const contactsRef = useRef<Contact[]>(contacts);
  contactsRef.current = contacts;
  const apiRef = useRef<GridApi<PayoutRow> | null>(null);

  const [rows, setRows] = useState<PayoutRow[]>(() => payouts.map(toRow));
  const [gridKey, setGridKey] = useState(0);
  const [dirty, setDirty] = useState(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // What the server currently has, per payout — the reference for "unsaved".
  const baselineRef = useRef<Map<string, string>>(baselineOf(payouts));
  const dirtyRef = useRef(0);
  const onInvalidRef = useRef((msg: string) => setError(msg));
  onInvalidRef.current = (msg: string) => setError(msg);

  /** Recount unsaved edits and refresh the undo/redo buttons. */
  const sync = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    let n = 0;
    api.forEachNode((node) => {
      if (node.data && (node.data.recipient ?? "") !== (baselineRef.current.get(node.data.key) ?? "")) n++;
    });
    dirtyRef.current = n;
    setDirty(n);
    setCanUndo(api.getCurrentUndoSize() > 0);
    setCanRedo(api.getCurrentRedoSize() > 0);
  }, []);

  /* The parent re-renders with fresh server data on a timer. Adopt it, but never over unsaved edits. */
  const serverKey = useMemo(
    () => JSON.stringify(payouts.map((p) => [p.id ?? p.label, p.recipient ?? "", p.state, p.amount, p.condition ?? "", p.note])),
    [payouts],
  );
  const lastServerKey = useRef(serverKey);
  useEffect(() => {
    if (serverKey === lastServerKey.current) return;
    lastServerKey.current = serverKey;
    if (dirtyRef.current > 0) return;
    baselineRef.current = baselineOf(payouts);
    setRows(payouts.map(toRow));
  }, [serverKey, payouts]);

  const columnDefs = useMemo<ColDef<PayoutRow>[]>(
    () => [
      // Min widths must sum to less than the panel's inner width (~460px) or the grid scrolls sideways.
      { headerName: "Payout", field: "label", flex: 1.3, minWidth: 130, cellRenderer: PayoutCell },
      { headerName: "Amount", field: "amount", width: 92, type: "rightAligned", cellRenderer: AmountCell },
      {
        headerName: "Recipient",
        field: "recipient",
        flex: 1.3,
        minWidth: 170,
        editable: (p) => p.data?.state !== "paid",
        singleClickEdit: true,
        cellEditor: RecipientEditor,
        // A function (not an object) so the column definitions never depend on
        // `contacts`: new column definitions make AG Grid discard the undo history.
        cellEditorParams: () => ({ contacts: contactsRef.current }),
        cellRenderer: RecipientCell,
        // Unsaved edits are tinted until saved.
        cellClassRules: {
          "rv-pending": (p) =>
            !!p.data && (p.data.recipient ?? "") !== (baselineRef.current.get(p.data.key) ?? ""),
        },
        // Validate before the value is accepted; an invalid entry is rejected and explained.
        valueSetter: (p: ValueSetterParams<PayoutRow, string>) => {
          const raw = String(p.newValue ?? "");
          if (isBlankRecipient(raw)) {
            if (!p.data.recipient) return false;
            p.data.recipient = undefined;
            setError("");
            return true;
          }
          const check = checkRecipient(raw);
          if (!check.valid) {
            onInvalidRef.current(`“${raw.trim()}” isn't a valid email address or phone number — the previous value was kept.`);
            return false;
          }
          if (p.data.recipient === check.value) return false;
          p.data.recipient = check.value;
          setError("");
          return true;
        },
      },
    ],
    // Stable on purpose — see cellEditorParams.
    [],
  );

  const defaultColDef = useMemo<ColDef<PayoutRow>>(() => ({ sortable: false, suppressMovable: true, enableCellChangeFlash: true }), []);
  const getRowId = useCallback((p: GetRowIdParams<PayoutRow>) => p.data.key, []);

  const onGridReady = useCallback(
    (e: GridReadyEvent<PayoutRow>) => {
      apiRef.current = e.api;
      sync();
    },
    [sync],
  );

  /** Throw away unsaved edits (and the undo history). */
  const discard = () => {
    baselineRef.current = baselineOf(payouts);
    setRows(payouts.map(toRow));
    setGridKey((k) => k + 1);
    dirtyRef.current = 0;
    setDirty(0);
    setCanUndo(false);
    setCanRedo(false);
    setError("");
  };

  const save = async () => {
    const api = apiRef.current;
    if (!api || saving || dirtyRef.current === 0) return;
    const current: PayoutRow[] = [];
    api.forEachNode((n) => n.data && current.push({ ...n.data }));
    const changed = current.filter((r) => (r.recipient ?? "") !== (baselineRef.current.get(r.key) ?? ""));

    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/flows/${encodeURIComponent(flowId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payouts: changed.map((r) => ({ id: r.id, label: r.label, recipient: r.recipient ?? "" })) }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Could not save recipients");
      }
      // Saved: these values are the new baseline. Remount so undo can't reach back past the save.
      baselineRef.current = new Map(current.map((r) => [r.key, r.recipient ?? ""]));
      setRows(current);
      setGridKey((k) => k + 1);
      dirtyRef.current = 0;
      setDirty(0);
      setCanUndo(false);
      setCanRedo(false);
      refreshFlows();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const anyEditable = rows.some((r) => r.state !== "paid");

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-extrabold uppercase tracking-wider text-ink/50">Payouts</p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => apiRef.current?.undoCellEditing()}
            disabled={!canUndo}
            aria-label="Undo last edit"
            title="Undo (Ctrl+Z)"
            className="grid size-7 place-items-center rounded-full text-ink/60 transition hover:bg-ink/5 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Undo2 className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => apiRef.current?.redoCellEditing()}
            disabled={!canRedo}
            aria-label="Redo"
            title="Redo (Ctrl+Y)"
            className="grid size-7 place-items-center rounded-full text-ink/60 transition hover:bg-ink/5 hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <Redo2 className="size-4" />
          </button>
          {dirty > 0 && (
            <>
              <button
                type="button"
                onClick={discard}
                disabled={saving}
                className="rounded-full px-2.5 py-1 text-xs font-bold text-ink/55 hover:text-ink disabled:opacity-50"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-full bg-ultra px-3 py-1 text-xs font-bold text-white transition hover:bg-ink disabled:opacity-60"
              >
                {saving ? <><Loader2 className="size-3 animate-spin" /> Saving…</> : `Save ${dirty} change${dirty === 1 ? "" : "s"}`}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-2 rounded-xl bg-coral/10 px-3 py-2 text-xs font-semibold text-coral">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-2xl ring-1 ring-ink/5" data-testid="payouts-grid">
        <AgGridReact<PayoutRow>
          key={gridKey}
          rowData={rows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          theme={rivuletTheme}
          getRowId={getRowId}
          domLayout="autoHeight"
          rowHeight={64}
          headerHeight={36}
          undoRedoCellEditing
          undoRedoCellEditingLimit={20}
          stopEditingWhenCellsLoseFocus
          cellFlashDuration={1200}
          cellFadeDuration={800}
          onGridReady={onGridReady}
          onCellValueChanged={sync}
          onUndoEnded={sync}
          onRedoEnded={sync}
          onCellEditingStarted={() => {
            editGuard.current.editing = true;
          }}
          onCellEditingStopped={() => {
            editGuard.current.editing = false;
            editGuard.current.endedAt = Date.now();
          }}
        />
      </div>

      <p className="mt-2 text-[11px] text-ink/45">
        {anyEditable
          ? "Click a recipient to edit · Enter to confirm · Esc to cancel · Ctrl+Z to undo"
          : "Every payout has been paid, so recipients are locked."}
      </p>
    </div>
  );
}
