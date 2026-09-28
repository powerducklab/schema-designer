import {
  Box,
  Button,
  Field,
  Grid,
  HStack,
  IconButton,
  Input,
  Stack,
  Switch,
  Text,
  Textarea,
  Collapsible,
} from "@chakra-ui/react";
import { memo, useEffect, useMemo, useState } from "react";
import type { InlineSchemaType, OpenApiSchema } from "../types";
import {
  canParseSchemaValue,
  getSchemaType,
  parseSchemaValue,
  stringifySchemaValue,
} from "../schemaUtils";
import { SchemaValueEditor } from "./SchemaValueEditor";
import {
  fillLabel,
  useInlineSchemaLabels,
  type InlineSchemaEditorLabels,
} from "../labels";

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getValueError(
  type: InlineSchemaType,
  text: string,
  labels: InlineSchemaEditorLabels,
): string {
  if (!text.trim()) return "";
  if (type === "boolean")
    return text === "true" || text === "false" ? "" : labels.validTrueFalse;
  if (type === "integer")
    return Number.isInteger(Number(text)) ? "" : labels.validInteger;
  if (type === "number")
    return Number.isFinite(Number(text)) ? "" : labels.validNumber;
  if (type === "null") return text.trim() === "null" ? "" : labels.validUseNull;
  if (["array", "object"].includes(type))
    return canParseSchemaValue(text, type) ? "" : labels.validJson;
  return "";
}

export const SchemaAdvancedEditor = memo(function SchemaAdvancedEditor(props: {
  schema: OpenApiSchema;
  disabled?: boolean;
  update: (patch: Partial<OpenApiSchema>) => void;
}) {
  const labels = useInlineSchemaLabels();
  const s = props.schema;
  const schemaType = getSchemaType(s);
  const examples = useMemo(
    () => (Array.isArray(s.examples) ? [...s.examples] : []),
    [s.examples],
  );
  const [exampleDrafts, setExampleDrafts] = useState<string[]>(() =>
    examples.map((item) => stringifySchemaValue(item)),
  );
  const [exampleDraft, setExampleDraft] = useState(() =>
    stringifySchemaValue(s.example),
  );
  const [defaultDraft, setDefaultDraft] = useState(() =>
    stringifySchemaValue(s.default),
  );
  const exampleError = getValueError(schemaType, exampleDraft, labels);
  const defaultError = getValueError(schemaType, defaultDraft, labels);

  useEffect(() => {
    setExampleDrafts(examples.map((item) => stringifySchemaValue(item)));
  }, [examples]);

  useEffect(() => {
    setExampleDraft(stringifySchemaValue(s.example));
  }, [s.example]);

  useEffect(() => {
    setDefaultDraft(stringifySchemaValue(s.default));
  }, [s.default]);

  const updateExamples = (next: unknown[], drafts?: string[]) => {
    if (drafts) setExampleDrafts(drafts);
    props.update({ examples: next.length ? next : undefined });
  };

  return (
    <Stack gap="4" className="pdDesignerSchemaSection">
      <Text fontSize="sm" fontWeight="600">
        {labels.advancedOptions}
      </Text>

      <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap="3">
        <Field.Root>
          <Field.Label>{labels.title}</Field.Label>
          <Input
            size="sm"
            value={typeof s.title === "string" ? s.title : ""}
            disabled={props.disabled}
            onChange={(e) =>
              props.update({ title: e.target.value || undefined })
            }
          />
        </Field.Root>
        <Field.Root>
          <Field.Label>{labels.const}</Field.Label>
          <Input
            size="sm"
            value={
              typeof s.const === "string"
                ? s.const
                : s.const === undefined
                  ? ""
                  : JSON.stringify(s.const)
            }
            disabled={props.disabled}
            onChange={(e) => {
              const raw = e.target.value;
              if (!raw) props.update({ const: undefined });
              else {
                try {
                  props.update({ const: JSON.parse(raw) });
                } catch {
                  props.update({ const: raw });
                }
              }
            }}
          />
        </Field.Root>
      </Grid>

      <Field.Root>
        <Field.Label>{labels.description}</Field.Label>
        <Textarea
          size="sm"
          minH="80px"
          value={typeof s.description === "string" ? s.description : ""}
          disabled={props.disabled}
          onChange={(e) =>
            props.update({ description: e.target.value || undefined })
          }
        />
      </Field.Root>

      <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap="3">
        <Field.Root>
          <Field.Label>{labels.example}</Field.Label>
          <SchemaValueEditor
            value={s.example}
            type={schemaType}
            disabled={props.disabled}
            placeholder={
              schemaType === "object" || schemaType === "array"
                ? labels.validJson
                : undefined
            }
            error={exampleError}
            onTextChange={setExampleDraft}
            onChange={(value) => props.update({ example: value })}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label>{labels.defaultValue}</Field.Label>
          <SchemaValueEditor
            value={s.default}
            type={schemaType}
            disabled={props.disabled}
            error={defaultError}
            onTextChange={setDefaultDraft}
            onChange={(value) => props.update({ default: value })}
          />
        </Field.Root>
      </Grid>

      <Stack gap="3">
        <HStack justify="space-between" align="center">
          <Text fontSize="sm" fontWeight="600">
            {labels.examples}
          </Text>
          <Button
            size="xs"
            variant="outline"
            disabled={props.disabled}
            onClick={() => {
              const seed =
                schemaType === "boolean"
                  ? true
                  : schemaType === "integer" || schemaType === "number"
                    ? 0
                    : schemaType === "null"
                      ? null
                      : schemaType === "array"
                        ? []
                        : schemaType === "object"
                          ? {}
                          : "";
              const next = [...examples, seed];
              updateExamples(
                next,
                next.map((item) => stringifySchemaValue(item)),
              );
            }}
          >
            {labels.addExample}
          </Button>
        </HStack>

        {examples.length === 0 ? (
          <Text fontSize="xs" color="var(--color-text-secondary)">
            {labels.noExamples}
          </Text>
        ) : null}

        {examples.map((value, index) => {
          const text = exampleDrafts[index] ?? stringifySchemaValue(value);
          const error = getValueError(schemaType, text, labels);
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
                    {fillLabel(labels.exampleN, { index: index + 1 })}
                  </Field.Label>
                  <Input
                    size="sm"
                    value={text}
                    disabled={props.disabled}
                    onChange={(e) => {
                      const nextDrafts = [...exampleDrafts];
                      nextDrafts[index] = e.target.value;
                      setExampleDrafts(nextDrafts);
                      if (canParseSchemaValue(e.target.value, schemaType)) {
                        const next = [...examples];
                        next[index] = parseSchemaValue(
                          e.target.value,
                          schemaType,
                        );
                        updateExamples(next);
                      }
                    }}
                  />
                  {error ? <Field.ErrorText>{error}</Field.ErrorText> : null}
                </Field.Root>
                <IconButton
                  mt="6"
                  size="xs"
                  variant="plain"
                  aria-label={labels.removeExample}
                  disabled={props.disabled}
                  onClick={() => {
                    const next = [...examples];
                    next.splice(index, 1);
                    const nextDrafts = [...exampleDrafts];
                    nextDrafts.splice(index, 1);
                    updateExamples(next, nextDrafts);
                  }}
                >
                  ×
                </IconButton>
              </HStack>
            </Box>
          );
        })}
      </Stack>

      <Collapsible.Root defaultOpen={false}>
        <Collapsible.Trigger asChild>
          <Button size="xs" variant="ghost" alignSelf="flex-start">
            {labels.showLessCommonOptions}
          </Button>
        </Collapsible.Trigger>
        <Collapsible.Content>
          <Stack gap="4" pt="3">
            <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap="3">
              <Field.Root>
                <Field.Label>{labels.contentEncoding}</Field.Label>
                <Input
                  size="sm"
                  value={
                    typeof s.contentEncoding === "string"
                      ? s.contentEncoding
                      : ""
                  }
                  disabled={props.disabled}
                  onChange={(e) =>
                    props.update({
                      contentEncoding: e.target.value || undefined,
                    })
                  }
                />
              </Field.Root>
              <Field.Root>
                <Field.Label>{labels.contentMediaType}</Field.Label>
                <Input
                  size="sm"
                  value={
                    typeof s.contentMediaType === "string"
                      ? s.contentMediaType
                      : ""
                  }
                  disabled={props.disabled}
                  onChange={(e) =>
                    props.update({
                      contentMediaType: e.target.value || undefined,
                    })
                  }
                />
              </Field.Root>
            </Grid>

            <Switch.Root
              checked={s.deprecated === true}
              disabled={props.disabled}
              onCheckedChange={(e) =>
                props.update({ deprecated: e.checked ? true : undefined })
              }
            >
              <Switch.HiddenInput />
              <Switch.Control />
              <Switch.Label>{labels.deprecated}</Switch.Label>
            </Switch.Root>

            <Field.Root>
              <Field.Label>{labels.writeOnly}</Field.Label>
              <Switch.Root
                checked={s.writeOnly === true}
                disabled={props.disabled}
                onCheckedChange={(e) =>
                  props.update({ writeOnly: e.checked ? true : undefined })
                }
              >
                <Switch.HiddenInput />
                <Switch.Control />
                <Switch.Label>{labels.hiddenFromResponses}</Switch.Label>
              </Switch.Root>
            </Field.Root>

            <Field.Root>
              <Field.Label>{labels.readOnly}</Field.Label>
              <Switch.Root
                checked={s.readOnly === true}
                disabled={props.disabled}
                onCheckedChange={(e) =>
                  props.update({ readOnly: e.checked ? true : undefined })
                }
              >
                <Switch.HiddenInput />
                <Switch.Control />
                <Switch.Label>{labels.hiddenFromRequests}</Switch.Label>
              </Switch.Root>
            </Field.Root>

            <Field.Root>
              <Field.Label>{labels.externalDocsUrl}</Field.Label>
              <Input
                size="sm"
                value={
                  typeof readRecord(s.externalDocs).url === "string"
                    ? String(readRecord(s.externalDocs).url)
                    : ""
                }
                disabled={props.disabled}
                onChange={(e) =>
                  props.update({
                    externalDocs: e.target.value
                      ? { ...readRecord(s.externalDocs), url: e.target.value }
                      : undefined,
                  })
                }
              />
            </Field.Root>
          </Stack>
        </Collapsible.Content>
      </Collapsible.Root>
    </Stack>
  );
});
