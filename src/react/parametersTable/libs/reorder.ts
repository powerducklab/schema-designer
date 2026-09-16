// libs/reorder.ts
export function reorder<T>(
  list: T[],
  startIndex: number,
  endIndex: number,
): T[] {
  if (
    !Number.isInteger(startIndex) ||
    !Number.isInteger(endIndex) ||
    startIndex < 0 ||
    endIndex < 0 ||
    startIndex >= list.length ||
    endIndex >= list.length ||
    startIndex === endIndex
  )
    return list;
  const result = [...list];
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
}
