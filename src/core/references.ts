import type { SchemaValue } from "./types";

const maps = new Set([
  "properties",
  "patternProperties",
  "$defs",
  "definitions",
  "dependentSchemas",
]);
const arrays = new Set(["allOf", "anyOf", "oneOf", "prefixItems"]);
const singles = new Set([
  "items",
  "contains",
  "not",
  "if",
  "then",
  "else",
  "additionalProperties",
  "unevaluatedProperties",
  "unevaluatedItems",
  "propertyNames",
]);

/** Resolve only local document pointers. This function never performs network I/O. */
export function resolveLocalReference(
  reference: string,
  document: unknown,
): unknown {
  if (reference === "#") return document;
  if (!reference.startsWith("#/")) return undefined;
  let tokens: string[];
  try {
    tokens = decodeURIComponent(reference.slice(2))
      .split("/")
      .map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));
  } catch {
    return undefined;
  }
  let value = document;
  for (const token of tokens) {
    if (
      value === null ||
      typeof value !== "object" ||
      !Object.hasOwn(value, token)
    )
      return undefined;
    value = (value as Record<string, unknown>)[token];
  }
  return value;
}

/** Resolve a bounded local graph for generation without mutating its source. */
export function dereferenceLocalSchema(
  schema: SchemaValue,
  document: unknown = schema,
  maxDepth = 64,
): SchemaValue {
  const depthLimit = Number.isFinite(maxDepth)
    ? Math.max(0, Math.min(128, Math.floor(maxDepth)))
    : 64;
  let visitedNodes = 0;
  const visit = (value: unknown, depth: number, refs: Set<string>): unknown => {
    if (++visitedNodes > 20_000)
      throw new RangeError("Schema reference node budget exceeded");
    if (depth > depthLimit)
      throw new RangeError("Schema reference depth exceeded");
    if (Array.isArray(value))
      return value.map((item) => visit(item, depth + 1, refs));
    if (value === null || typeof value !== "object") return value;
    const record = value as Record<string, unknown>;
    if (typeof record.$ref === "string") {
      if (refs.has(record.$ref))
        throw new Error(
          `Recursive reference cannot be generated: ${record.$ref}`,
        );
      const target = resolveLocalReference(record.$ref, document);
      if (target === undefined)
        throw new Error(`Unresolved local reference: ${record.$ref}`);
      const nextRefs = new Set(refs).add(record.$ref);
      const resolved = visit(target, depth + 1, nextRefs);
      const { $ref, ...siblings } = record;
      if (!Object.keys(siblings).length) return resolved;
      return { allOf: [resolved, visit(siblings, depth + 1, refs)] };
    }
    return Object.fromEntries(
      Object.entries(record).map(([key, item]) => {
        if (
          maps.has(key) &&
          item &&
          typeof item === "object" &&
          !Array.isArray(item)
        ) {
          return [
            key,
            Object.fromEntries(
              Object.entries(item).map(([name, child]) => [
                name,
                visit(child, depth + 1, refs),
              ]),
            ),
          ];
        }
        return [
          key,
          arrays.has(key) || singles.has(key)
            ? visit(item, depth + 1, refs)
            : item,
        ];
      }),
    );
  };
  return visit(schema, 0, new Set()) as SchemaValue;
}
