/**
 * Rivulet's AG Grid theme.
 *
 * One theme shared by every grid so they look like part of the product rather
 * than stock Quartz. Built with `withParams` on the Community Quartz theme; the
 * colors are the app's palette (see globals.css).
 */

import { themeQuartz } from "ag-grid-community";

const INK = "#15133d";
const ULTRA = "#3d3df5";
const PAPER = "#f6f4ff";
const CORAL = "#ff6b57";

export const rivuletTheme = themeQuartz.withParams({
  // Core palette
  accentColor: ULTRA,
  backgroundColor: "#ffffff",
  foregroundColor: INK,
  invalidColor: CORAL,

  // Type: inherit the page's font (Sora) instead of the grid's own.
  fontFamily: "inherit",
  fontSize: 13,
  headerFontSize: 12,
  headerFontWeight: 700,

  // Chrome: the surrounding card already provides the border and rounding.
  wrapperBorder: false,
  wrapperBorderRadius: 0,
  columnBorder: false,
  borderColor: "rgba(21, 19, 61, 0.08)",

  // Header
  headerBackgroundColor: PAPER,
  headerTextColor: "rgba(21, 19, 61, 0.65)",
  headerColumnResizeHandleColor: "rgba(21, 19, 61, 0.18)",

  // Rows
  rowHoverColor: "rgba(61, 61, 245, 0.05)",
  selectedRowBackgroundColor: "rgba(61, 61, 245, 0.10)",

  // Pinned totals row
  pinnedRowBackgroundColor: PAPER,
  pinnedRowFontWeight: 800,
  pinnedRowBorder: { style: "solid", width: 2, color: "rgba(61, 61, 245, 0.35)" },

  // Inline editing
  cellEditingBorder: { style: "solid", width: 2, color: ULTRA },
  cellEditingShadow: "0 8px 24px rgba(21, 19, 61, 0.18)",

  // Live updates: a changed cell glows mint for a moment.
  valueChangeValueHighlightBackgroundColor: "rgba(46, 230, 166, 0.35)",
  valueChangeDeltaUpColor: "#0f9d6b",
  valueChangeDeltaDownColor: CORAL,
});

/**
 * Options shared by every grid that refreshes from the server on a timer.
 * With a stable `getRowId`, new data updates rows IN PLACE (keeping scroll,
 * selection and sort) and only cells whose value actually changed flash.
 */
export const LIVE_GRID_OPTIONS = {
  animateRows: true,
  cellFlashDuration: 1200,
  cellFadeDuration: 800,
} as const;

