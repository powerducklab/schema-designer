import { Button, Field, HStack, NativeSelect, Stack } from "@chakra-ui/react";
import type { OpenApiSchema } from "../types";
import { getReferenceOptions, toSchemaRecord } from "../schemaUtils";

export function SchemaReferenceEditor(props: {
  schema: OpenApiSchema;
  fullSchema?: OpenApiSchema;
  disabled?: boolean;
  hasDraft?: boolean;
  onRestoreDraft?: () => void;
  onClearReference?: () => void;
  update: (patch: Partial<OpenApiSchema>) => void;
}) {
  const record = toSchemaRecord(props.schema);
  const ref = typeof record.$ref === "string" ? record.$ref : "";
  const options = getReferenceOptions(props.fullSchema);
  if (ref && !options.includes(ref)) options.unshift(ref);

  return (
    <Stack gap="2" className="pdDesignerSchemaSection">
      <HStack justify="space-between" align="center" flexWrap="wrap">
        <HStack gap="2">
          {ref ? (
            <Button
              size="xs"
              variant="ghost"
              onClick={props.onClearReference}
              disabled={props.disabled}
            >
              Use inline schema
            </Button>
          ) : null}
          {props.hasDraft && !ref ? (
            <Button
              size="xs"
              variant="ghost"
              onClick={props.onRestoreDraft}
              disabled={props.disabled}
            >
              Restore draft
            </Button>
          ) : null}
        </HStack>
      </HStack>

      <Field.Root>
        <Field.Label>$ref</Field.Label>
        <NativeSelect.Root size="sm" disabled={props.disabled}>
          <NativeSelect.Field
            value={ref}
            onChange={(event) => {
              const value = event.target.value;
              props.update({ $ref: value || undefined });
            }}
          >
            <option value="">No reference</option>
            {options.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Field.Root>
    </Stack>
  );
}
