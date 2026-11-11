/**
 * Small helpers shared by Rivulet's AG Grid tables.
 */

import type { GridApi } from "ag-grid-community";

/**
 * Pin a totals row to the bottom of the grid, computed from the rows that
 * currently pass the filters (all pages, not just the visible one). Call it
 * whenever the data or the filters change. Passing `null` from `build` (e.g.
 * when there are no rows) clears the totals row.
 */
export function setPinnedTotals<T>(api: GridApi<T>, build: (rows: T[]) => T | null): void {
  const rows: T[] = [];
  api.forEachNodeAfterFilter((node) => {
    if (node.data) rows.push(node.data);
  });
  const totals = rows.length > 0 ? build(rows) : null;
  api.setGridOption("pinnedBottomRowData", totals ? [totals] : []);
}

/** Round to cents so repeated float addition can't leave a trailing 0.0000001. */
export const sumMoney = (values: number[]): number =>
  Math.round(values.reduce((s, v) => s + v, 0) * 100) / 100;

/* ── dates ───────────────────────────────────────────────────────────────
 * The API hands dates over as display strings ("Nov 10, 2026", "Nov 2026").
 * Left alone, the grid sorts those alphabetically ("Nov 10" < "Nov 9") and its
 * date filter can't read them. These parse them back for sorting and filtering.
 */

const parseDisplayDate = (s: string | undefined | null): number =>
  s ? Date.parse(s) : Number.NaN;

/** Sort comparator for display-date strings. Unparseable values sort first. */
export function compareDisplayDates(a?: string | null, b?: string | null): number {
  const x = parseDisplayDate(a);
  const y = parseDisplayDate(b);
  if (Number.isNaN(x) && Number.isNaN(y)) return 0;
  if (Number.isNaN(x)) return -1;
  if (Number.isNaN(y)) return 1;
  return x - y;
}

/** `filterParams.comparator` for AG Grid's date filter over display-date strings. */
export function dateFilterComparator(filterLocalMidnight: Date, cellValue: string): number {
  const t = parseDisplayDate(cellValue);
  if (Number.isNaN(t)) return -1;
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  const cell = d.getTime();
  const filter = filterLocalMidnight.getTime();
  return cell < filter ? -1 : cell > filter ? 1 : 0;
}
