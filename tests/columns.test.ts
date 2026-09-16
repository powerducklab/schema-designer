import { describe, expect, it } from "vitest";
import {
  DEFAULT_COLUMNS,
  fitColumnWidths,
} from "../src/react/parametersTable/libs/columns";
import type { ColumnId } from "../src/react/parametersTable/libs/types";
const initial = () =>
  Object.fromEntries(
    DEFAULT_COLUMNS.map((column) => [column.id, column.defaultWidth]),
  ) as Record<ColumnId, number>;

describe("column layout stability", () => {
  it("fills available space without violating column bounds", () => {
    const widths = fitColumnWidths(initial(), DEFAULT_COLUMNS, 1000);
    expect(
      DEFAULT_COLUMNS.reduce((sum, column) => sum + widths[column.id], 0),
    ).toBeCloseTo(1000, 5);
    for (const column of DEFAULT_COLUMNS) {
      expect(widths[column.id]).toBeGreaterThanOrEqual(column.minWidth);
      expect(widths[column.id]).toBeLessThanOrEqual(
        column.maxWidth ?? Infinity,
      );
    }
    expect(fitColumnWidths(widths, DEFAULT_COLUMNS, 1000)).toBe(widths);
  });

  it("settles immediately after repeated compact/full column switches", () => {
    const compact = DEFAULT_COLUMNS.slice(0, 2);
    let widths = initial();
    for (let index = 0; index < 20; index += 1) {
      const visible = index % 2 ? compact : DEFAULT_COLUMNS;
      widths = fitColumnWidths(widths, visible, 960);
      for (let notification = 0; notification < 5; notification += 1) {
        expect(fitColumnWidths(widths, visible, 960)).toBe(widths);
      }
    }
  });

  it("keeps narrow layouts stable at their minimum widths", () => {
    const widths = fitColumnWidths(initial(), DEFAULT_COLUMNS, 300);
    for (const column of DEFAULT_COLUMNS)
      expect(widths[column.id]).toBeCloseTo(column.minWidth, 5);
    expect(fitColumnWidths(widths, DEFAULT_COLUMNS, 300)).toBe(widths);
  });
});
