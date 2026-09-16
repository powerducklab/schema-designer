import type {
  OpenApiParameter,
  ParameterValues,
} from "../react/parametersTable/libs/types";
import { resolveParameterValue } from "../react/parametersTable/libs/parameterValue";

/** Parameter locations are part of identity; header and query names may overlap. */
export function parameterKey(
  parameter: Pick<OpenApiParameter, "in" | "name">,
): string {
  return JSON.stringify([parameter.in, parameter.name]);
}
export function initializeParameterValues(
  parameters: readonly OpenApiParameter[],
): ParameterValues {
  return Object.fromEntries(
    parameters.map((parameter) => [
      parameterKey(parameter),
      {
        value: resolveParameterValue(parameter).value,
        enabled: true,
      },
    ]),
  );
}
export function parameterValueText(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}
