import type { ApplyAdjacentSplitterResizeOptions, ColumnId } from "./types";

const EPSILON = 0.001;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function normalizeBounds(min: number, max: number): readonly [number, number] {
  const safeMin = Math.max(0, finiteOr(min, 0));

  const safeMax = Number.isFinite(max)
    ? Math.max(safeMin, max)
    : Number.POSITIVE_INFINITY;

  return [safeMin, safeMax];
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }

  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

/**
 * Resize two adjacent columns while preserving their total width.
 *
 * Invariant:
 *
 *   nextLeft + nextRight === startLeft + startRight
 *
 * subject to both columns' min/max constraints.
 *
 * The algorithm calculates the feasible interval of the left column:
 *
 *   left >= leftMin
 *   left <= leftMax
 *   total - left >= rightMin
 *   total - left <= rightMax
 *
 * therefore:
 *
 *   max(leftMin, total - rightMax)
 *      <= left
 *      <=
 *   min(leftMax, total - rightMin)
 *
 * This avoids the unstable "clamp both sides and then repair" approach.
 */
export function applyAdjacentSplitterResize({
  session,
  clientX,
  widths,
}: ApplyAdjacentSplitterResizeOptions): Record<ColumnId, number> {
  if (!Number.isFinite(clientX)) {
    return widths;
  }

  const { leftId, rightId, startClientX } = session;

  if (!Number.isFinite(startClientX)) {
    return widths;
  }

  const startLeftWidth = Math.max(
    0,
    finiteOr(session.startLeftWidth, widths[leftId] ?? 0),
  );

  const startRightWidth = Math.max(
    0,
    finiteOr(session.startRightWidth, widths[rightId] ?? 0),
  );

  const totalWidth = startLeftWidth + startRightWidth;

  if (!Number.isFinite(totalWidth) || totalWidth <= 0) {
    return widths;
  }

  const [leftMin, leftMax] = normalizeBounds(
    session.leftMinWidth,
    session.leftMaxWidth,
  );

  const [rightMin, rightMax] = normalizeBounds(
    session.rightMinWidth,
    session.rightMaxWidth,
  );

  /**
   * If the constraints themselves cannot represent the
   * current total width, do not mutate anything.
   */
  const feasibleLeftMin = Math.max(
    leftMin,
    Number.isFinite(rightMax) ? totalWidth - rightMax : 0,
  );

  const feasibleLeftMax = Math.min(leftMax, totalWidth - rightMin);

  if (feasibleLeftMin > feasibleLeftMax + EPSILON) {
    return widths;
  }

  const delta = clientX - startClientX;

  const requestedLeft = startLeftWidth + delta;

  /**
   * One-dimensional constrained solution.
   */
  const nextLeft = clamp(requestedLeft, feasibleLeftMin, feasibleLeftMax);

  const nextRight = totalWidth - nextLeft;

  if (
    nextLeft < leftMin - EPSILON ||
    nextLeft > leftMax + EPSILON ||
    nextRight < rightMin - EPSILON ||
    nextRight > rightMax + EPSILON
  ) {
    return widths;
  }

  /**
   * Avoid generating React state updates for sub-pixel
   * pointer noise.
   */
  const currentLeft = widths[leftId];

  const currentRight = widths[rightId];

  if (
    Number.isFinite(currentLeft) &&
    Number.isFinite(currentRight) &&
    Math.abs(currentLeft - nextLeft) < EPSILON &&
    Math.abs(currentRight - nextRight) < EPSILON
  ) {
    return widths;
  }

  return {
    ...widths,
    [leftId]: nextLeft,
    [rightId]: nextRight,
  };
}
