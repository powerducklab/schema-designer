import type { ColumnDefinition, ColumnId } from "./types";

export const DEFAULT_COLUMNS: ColumnDefinition[] = [
  { id: "name", label: "Name", defaultWidth: 180, minWidth: 160 },
  { id: "value", label: "Value", defaultWidth: 220, minWidth: 120 },
  { id: "type", label: "Type", defaultWidth: 140, minWidth: 120 },
  {
    id: "required",
    label: "Required",
    defaultWidth: 100,
    minWidth: 100,
    maxWidth: 140,
  },
  { id: "description", label: "Description", defaultWidth: 360, minWidth: 180 },
];

export function getVisibleColumns(args: {
  showRequired: boolean;
  showType: boolean;
  showDescription: boolean;
}) {
  const { showRequired, showType, showDescription } = args;

  return DEFAULT_COLUMNS.filter((c) => {
    if (c.id === "required" && !showRequired) return false;
    if (c.id === "type" && !showType) return false;
    if (c.id === "description" && !showDescription) return false;
    return true;
  });
}

export function getRightNeighborId(
  visibleColumns: ColumnDefinition[],
  columnId: ColumnId,
): ColumnId | null {
  const idx = visibleColumns.findIndex((c) => c.id === columnId);
  if (idx < 0) return null;
  return visibleColumns[idx + 1]?.id ?? null;
}

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function buildColumnDefsById(columns: ColumnDefinition[]) {
  return columns.reduce(
    (acc, c) => {
      acc[c.id] = c;
      return acc;
    },
    {} as Record<ColumnId, ColumnDefinition>,
  );
}

/** Fit visible columns once, respecting bounds and preserving no-op identity. */
export function fitColumnWidths(
  previous: Record<ColumnId, number>,
  columns: readonly ColumnDefinition[],
  available: number,
): Record<ColumnId, number> {
  if (!columns.length || !Number.isFinite(available) || available <= 0)
    return previous;
  const minimum = columns.reduce((sum, column) => sum + column.minWidth, 0);
  const maximum = columns.reduce(
    (sum, column) => sum + (column.maxWidth ?? Infinity),
    0,
  );
  const target = Math.max(minimum, Math.min(maximum, available));
  const currentTotal = columns.reduce(
    (sum, column) => sum + previous[column.id],
    0,
  );
  const valid = columns.every(
    (column) =>
      Number.isFinite(previous[column.id]) &&
      previous[column.id] >= column.minWidth &&
      previous[column.id] <= (column.maxWidth ?? Infinity),
  );
  if (valid && Math.abs(currentTotal - target) < 0.01) return previous;

  const weights = columns.map((column) =>
    Math.max(
      1,
      Number.isFinite(previous[column.id])
        ? previous[column.id]
        : column.defaultWidth,
    ),
  );
  const widthAt = (index: number, scale: number) =>
    Math.max(
      columns[index].minWidth,
      Math.min(columns[index].maxWidth ?? Infinity, weights[index] * scale),
    );
  let low = 0;
  let high = Math.max(1, target / Math.min(...weights));
  // The clamped weighted sum is monotonic, including columns at either bound.
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const middle = (low + high) / 2;
    const total = columns.reduce(
      (sum, _, index) => sum + widthAt(index, middle),
      0,
    );
    if (total < target) low = middle;
    else high = middle;
  }
  const next = { ...previous };
  columns.forEach((column, index) => {
    next[column.id] = widthAt(index, (low + high) / 2);
  });
  return columns.every(
    (column) => Math.abs(previous[column.id] - next[column.id]) < 0.01,
  )
    ? previous
    : next;
}
