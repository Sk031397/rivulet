"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useState,
} from "react";
import type {
  IFloatingFilter,
  IFloatingFilterParams,
} from "ag-grid-community";

/**
 * Extra params attached via colDef.floatingFilterComponentParams.
 * `numeric` applies an "equals" number filter instead of a "contains" text one.
 * `field` names the row-data property to pull distinct suggestions from.
 */
interface AutocompleteParams extends IFloatingFilterParams {
  numeric?: boolean;
  field?: string;
}

/**
 * A floating filter whose text input is backed by a <datalist> of the distinct
 * values currently present in that column. The browser shows those as
 * autocomplete suggestions, and typing narrows the grid through the column's
 * own (text/number) parent filter — so e.g. typing "spl" in Flow name surfaces
 * every flow whose name contains "spl".
 */
const AutocompleteFloatingFilter = forwardRef<IFloatingFilter, AutocompleteParams>(
  function AutocompleteFloatingFilter(props, ref) {
    const { api, column, numeric, field, parentFilterInstance } = props;
    const [value, setValue] = useState("");
    const [options, setOptions] = useState<string[]>([]);
    const listId = useId();

    // Sync our input whenever the parent filter model changes (e.g. cleared).
    useImperativeHandle(ref, () => ({
      onParentModelChanged(parentModel: { filter?: unknown } | null) {
        if (parentModel && parentModel.filter != null) {
          setValue(String(parentModel.filter));
        } else {
          setValue("");
        }
      },
    }));

    // Gather distinct, non-empty values currently in this column for suggestions.
    const refreshOptions = useCallback(() => {
      const colId = field ?? column.getColId();
      const seen = new Set<string>();
      api.forEachNode((node) => {
        const data = node.data as Record<string, unknown> | undefined;
        const v = data?.[colId];
        if (v === null || v === undefined || v === "") return;
        seen.add(String(v));
      });
      setOptions(
        Array.from(seen).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
      );
    }, [api, column, field]);

    useEffect(() => {
      refreshOptions();
      const handler = () => refreshOptions();
      // Rebuild suggestions as data loads / changes.
      api.addEventListener("modelUpdated", handler);
      api.addEventListener("rowDataUpdated", handler);
      return () => {
        api.removeEventListener("modelUpdated", handler);
        api.removeEventListener("rowDataUpdated", handler);
      };
    }, [api, refreshOptions]);

    const apply = (next: string) => {
      setValue(next);
      parentFilterInstance((parent) => {
        if (!next) {
          parent.onFloatingFilterChanged(null, null);
        } else if (numeric) {
          const num = Number(next);
          parent.onFloatingFilterChanged("equals", Number.isNaN(num) ? next : num);
        } else {
          parent.onFloatingFilterChanged("contains", next);
        }
      });
    };

    return (
      <div className="w-full">
        <input
          type={numeric ? "number" : "text"}
          list={listId}
          value={value}
          onChange={(e) => apply(e.target.value)}
          placeholder="Filter…"
          aria-label={`Filter ${column.getColDef().headerName ?? column.getColId()}`}
          className="h-7 w-full rounded-md border border-ink/15 bg-white px-2 text-xs text-ink outline-none focus:border-ultra focus:ring-1 focus:ring-ultra"
        />
        <datalist id={listId}>
          {options.map((opt) => (
            <option key={opt} value={opt} />
          ))}
        </datalist>
      </div>
    );
  },
);

export default AutocompleteFloatingFilter;
