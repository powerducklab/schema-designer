import {
  Box,
  Button,
  Field,
  HStack,
  IconButton,
  Input,
  Stack,
  Text,
} from "@chakra-ui/react";
import { memo, useEffect, useMemo, useState } from "react";
import type { InlineSchemaType, OpenApiSchema } from "../types";
import {
  canParseSchemaValue,
  getEnumValues,
  parseSchemaValue,
  stringifySchemaValue,
} from "../schemaUtils";
import {
  fillLabel,
  useInlineSchemaLabels,
  type InlineSchemaEditorLabels,
} from "../labels";

function validateEnumText(
  type: InlineSchemaType,
  text: string,
  labels: InlineSchemaEditorLabels,
): string {
  if (!text.trim())
    return type === "string" ? "" : labels.enumEnterValueOrRemove;
  if (type === "integer") {
    return Number.isInteger(Number(text)) ? "" : labels.enumValidInteger;
  }
  if (type === "number") {
    return Number.isFinite(Number(text)) ? "" : labels.enumValidNumber;
  }
  if (type === "boolean") {
    return text === "true" || text === "false" ? "" : labels.enumUseTrueFalse;
  }
  if (type === "null") {
    return text.trim() === "null" ? "" : labels.enumUseNull;
  }
  if (["array", "object", "any"].includes(type)) {
    return canParseSchemaValue(text, type) ? "" : labels.enumValidJson;
  }
  return "";
}

export const SchemaEnumEditor = memo(function SchemaEnumEditor(props: {
  schema: OpenApiSchema;
  type: InlineSchemaType;
  disabled?: boolean;
  update: (patch: Partial<OpenApiSchema>) => void;
}) {
  const labels = useInlineSchemaLabels();
  const values = useMemo(
    () => getEnumValues(props.schema),
    [props.schema.enum],
  );
  const [drafts, setDrafts] = useState<string[]>(() =>
    values.map((value) => stringifySchemaValue(value)),
  );

  useEffect(() => {
    setDrafts(values.map((value) => stringifySchemaValue(value)));
  }, [values]);

  const commit = (next: unknown[]) => {
    props.update({ enum: next.length ? next : undefined });
  };

  const createSeedValue = () => {
    if (props.type === "integer" || props.type === "number") return 0;
    if (props.type === "boolean") return true;
    if (props.type === "null") return null;
    if (props.type === "array") return [];
    if (props.type === "object") return {};
    return "";
  };

  return (
    <Stack gap="3">
      <HStack justify="space-between" align="center">
        <Text fontSize="sm" fontWeight="600">
          {labels.enum}
        </Text>
        <Button
          size="xs"
          variant="outline"
          disabled={props.disabled}
          onClick={() => {
            const nextValues = [...values, createSeedValue()];
            setDrafts(nextValues.map((value) => stringifySchemaValue(value)));
            commit(nextValues);
          }}
        >
          {labels.addEnum}
        </Button>
      </HStack>

      {values.map((value, index) => {
        const text = drafts[index] ?? stringifySchemaValue(value);
        const error = validateEnumText(props.type, text, labels);

        return (
          <Box
            key={index}
            p="3"
            border="1px solid var(--color-border-subtle)"
            borderRadius="var(--radius-lg)"
            bg="var(--color-surface-subtle)"
          >
            <HStack align="start" gap="2">
              <Field.Root invalid={!!error} flex="1">
                <Field.Label>
                  {fillLabel(labels.enumValue, { index: index + 1 })}
                </Field.Label>
                <Input
                  size="sm"
                  value={text}
                  disabled={props.disabled}
                  onChange={(e) => {
                    const nextDrafts = [...drafts];
                    nextDrafts[index] = e.target.value;
                    setDrafts(nextDrafts);
                    if (!validateEnumText(props.type, e.target.value, labels)) {
                      const next = [...values];
                      next[index] = parseSchemaValue(
                        e.target.value,
                        props.type,
                      );
                      commit(next);
                    }
                  }}
                />
                {error ? <Field.ErrorText>{error}</Field.ErrorText> : null}
              </Field.Root>

              <IconButton
                mt="6"
                size="xs"
                variant="plain"
                className="pdDesignerSchemaIconButton"
                aria-label={labels.removeEnumValue}
                disabled={props.disabled}
                onClick={() => {
                  const next = [...values];
                  next.splice(index, 1);
                  const nextDrafts = [...drafts];
                  nextDrafts.splice(index, 1);
                  setDrafts(nextDrafts);
                  commit(next);
                }}
              >
                ×
              </IconButton>
            </HStack>
          </Box>
        );
      })}

      {values.length === 0 ? (
        <Text fontSize="xs" color="var(--color-text-secondary)">
          {labels.noEnumValues}
        </Text>
      ) : null}
    </Stack>
  );
});
