import { nanoid } from "nanoid";
import { resolveParameterValue } from "./parameterValue";
import { OpenApiParameter, ParameterRow } from "./types";

export function createRows(parameters: OpenApiParameter[]): ParameterRow[] {
  return parameters.map((parameter) => ({
    id: nanoid(),
    parameter,
  }));
}

export function getDisplayValue(
  row: ParameterRow,
  document?: Record<string, unknown>,
) {
  const resolved = resolveParameterValue(row.parameter, document);
  if (Object.prototype.hasOwnProperty.call(row, "generatedValue")) {
    return { value: row.generatedValue, source: "generated" as const };
  }

  return resolved;
}

/**
 * Parameter equality used only for controlled-value synchronization.
 *
 * Object identity is checked first because this is the cheapest path.
 * JSON serialization is deliberately isolated here so that normal
 * rendering does not perform deep comparisons.
 */
export function areParametersEqual(
  a: OpenApiParameter,
  b: OpenApiParameter,
): boolean {
  if (Object.is(a, b)) {
    return true;
  }

  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function areParameterArraysEqual(
  a: readonly OpenApiParameter[],
  b: readonly OpenApiParameter[],
): boolean {
  if (a === b) {
    return true;
  }

  if (a.length !== b.length) {
    return false;
  }

  for (let i = 0; i < a.length; i += 1) {
    if (!areParametersEqual(a[i], b[i])) {
      return false;
    }
  }

  return true;
}

/**
 * Best-effort external reconciliation.
 *
 * Name + "in" is used as a stable OpenAPI identity when available.
 * Fallback is index-based matching.
 *
 * Local edits do not go through this path when the parent simply echoes
 * the value emitted by this component.
 */
export function reconcileRows(
  previous: ParameterRow[],
  parameters: OpenApiParameter[],
): ParameterRow[] {
  if (
    parameters.length === previous.length &&
    parameters.every(
      (parameter, index) => parameter === previous[index].parameter,
    )
  )
    return previous;
  if (parameters.length === 0) {
    return [];
  }

  const previousByKey = new Map<string, ParameterRow[]>();

  for (const row of previous) {
    const name = String(row.parameter.name ?? "");
    const location = String(
      (row.parameter as OpenApiParameter & { in?: string }).in ?? "",
    );

    const key = `${location}\u0000${name}`;

    const bucket = previousByKey.get(key);

    if (bucket) {
      bucket.push(row);
    } else {
      previousByKey.set(key, [row]);
    }
  }

  const used = new Set<string>();

  return parameters.map((parameter, index) => {
    const name = String(parameter.name ?? "");
    const location = String(
      (parameter as OpenApiParameter & { in?: string }).in ?? "",
    );

    const key = `${location}\u0000${name}`;
    const bucket = previousByKey.get(key);

    if (bucket) {
      while (bucket.length > 0) {
        const candidate = bucket.shift();

        if (candidate && !used.has(candidate.id)) {
          used.add(candidate.id);

          return candidate.parameter === parameter
            ? candidate
            : { ...candidate, parameter };
        }
      }
    }

    // Positional fallback. Editing the name changes the name+in key on every
    // keystroke, so key matching would mint a fresh row id and remount the
    // editor (dropping focus and closing the variable menu). When the parent
    // echoes rows back in order, reuse the row already rendered at this index.
    const positional = previous[index];
    if (positional && !used.has(positional.id)) {
      used.add(positional.id);
      return positional.parameter === parameter
        ? positional
        : { ...positional, parameter };
    }

    return {
      id: nanoid(),
      parameter,
    };
  });
}
