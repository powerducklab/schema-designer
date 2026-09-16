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

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function getValueError(type: InlineSchemaType, text: string): string {
  if (!text.trim()) return "";
  if (type === "boolean")
    return text === "true" || text === "false" ? "" : "Pick true or false.";
  if (type === "integer")
    return Number.isInteger(Number(text)) ? "" : "Enter a valid integer.";
  if (type === "number")
    return Number.isFinite(Number(text)) ? "" : "Enter a valid number.";
  if (type === "null") return text.trim() === "null" ? "" : 'Use "null".';
  if (["array", "object"].includes(type))
    return canParseSchemaValue(text, type) ? "" : "Enter valid JSON.";
  return "";
}

export const SchemaAdvancedEditor = memo(function SchemaAdvancedEditor(props: {
  schema: OpenApiSchema;
  disabled?: boolean;
  update: (patch: Partial<OpenApiSchema>) => void;
}) {
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
  const exampleError = getValueError(schemaType, exampleDraft);
  const defaultError = getValueError(schemaType, defaultDraft);

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
        Advanced options
      </Text>

      <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap="3">
        <Field.Root>
          <Field.Label>Title</Field.Label>
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
          <Field.Label>Const</Field.Label>
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
        <Field.Label>Description</Field.Label>
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
          <Field.Label>Example</Field.Label>
          <SchemaValueEditor
            value={s.example}
            type={schemaType}
            disabled={props.disabled}
            placeholder={
              schemaType === "object" || schemaType === "array"
                ? "Enter valid JSON"
                : undefined
            }
            error={exampleError}
            onTextChange={setExampleDraft}
            onChange={(value) => props.update({ example: value })}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label>Default</Field.Label>
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
            Examples
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
            Add example
          </Button>
        </HStack>

        {examples.length === 0 ? (
          <Text fontSize="xs" color="var(--color-text-secondary)">
            No examples.
          </Text>
        ) : null}

        {examples.map((value, index) => {
          const text = exampleDrafts[index] ?? stringifySchemaValue(value);
          const error = getValueError(schemaType, text);
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
                  <Field.Label>Example {index + 1}</Field.Label>
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
                  aria-label="Remove example"
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
            Show less common options
          </Button>
        </Collapsible.Trigger>
        <Collapsible.Content>
          <Stack gap="4" pt="3">
            <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap="3">
              <Field.Root>
                <Field.Label>Content encoding</Field.Label>
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
                <Field.Label>Content media type</Field.Label>
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
              <Switch.Label>Deprecated</Switch.Label>
            </Switch.Root>

            <Field.Root>
              <Field.Label>Write only</Field.Label>
              <Switch.Root
                checked={s.writeOnly === true}
                disabled={props.disabled}
                onCheckedChange={(e) =>
                  props.update({ writeOnly: e.checked ? true : undefined })
                }
              >
                <Switch.HiddenInput />
                <Switch.Control />
                <Switch.Label>Hidden from responses</Switch.Label>
              </Switch.Root>
            </Field.Root>

            <Field.Root>
              <Field.Label>Read only</Field.Label>
              <Switch.Root
                checked={s.readOnly === true}
                disabled={props.disabled}
                onCheckedChange={(e) =>
                  props.update({ readOnly: e.checked ? true : undefined })
                }
              >
                <Switch.HiddenInput />
                <Switch.Control />
                <Switch.Label>Hidden from requests</Switch.Label>
              </Switch.Root>
            </Field.Root>

            <Field.Root>
              <Field.Label>External docs URL</Field.Label>
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
