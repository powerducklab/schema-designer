import { useCallback } from "react";
import type { OpenApiSchema } from "../types";

export function useSchemaPatch(
  schema: OpenApiSchema | undefined,
  update: (patch: Partial<OpenApiSchema>) => void,
) {
  const patch = useCallback(
    (next: Partial<OpenApiSchema>) => update(next),
    [update],
  );
  const replace = useCallback(
    (next: OpenApiSchema) => {
      const current = schema ?? ({} as OpenApiSchema);
      const patchValue: Record<string, unknown> = { ...next };
      Object.keys(current).forEach((key) => {
        if (!Object.hasOwn(next, key))
          Object.defineProperty(patchValue, key, {
            value: undefined,
            enumerable: true,
            configurable: true,
            writable: true,
          });
      });
      update(patchValue as Partial<OpenApiSchema>);
    },
    [schema, update],
  );

  return { patch, replace };
}
