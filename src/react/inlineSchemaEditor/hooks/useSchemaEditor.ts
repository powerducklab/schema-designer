import { useMemo } from "react";
import type { InlineSchemaType, OpenApiSchema } from "../types";
import { getSchemaType, toSchemaRecord } from "../schemaUtils";

export function useSchemaEditor(
  schema: OpenApiSchema | undefined,
  externalType?: InlineSchemaType,
) {
  return useMemo(
    () => ({
      schema: toSchemaRecord(schema) as OpenApiSchema,
      type: externalType ?? getSchemaType(schema),
    }),
    [schema, externalType],
  );
}
