import { Box, Button, Stack, Switch, Tabs, Text } from "@chakra-ui/react";
import { useCallback, useMemo } from "react";
import type {
  InlineSchemaEditorProps,
  InlineSchemaType,
  OpenApiSchema,
} from "./types";
import {
  createSchemaForType,
  toSchemaRecord,
  mergeSchema as applyPatch,
} from "./schemaUtils";
import { useSchemaEditor } from "./hooks/useSchemaEditor";
import { useSchemaPatch } from "./hooks/useSchemaPatch";
import { SchemaHeader } from "./components/SchemaHeader";
import { SchemaReferenceEditor } from "./components/SchemaReferenceEditor";
import { SchemaAdvancedEditor } from "./components/SchemaAdvancedEditor";
import { SchemaEnumEditor } from "./components/SchemaEnumEditor";
import { SchemaCompositionEditor } from "./components/SchemaCompositionEditor";
import { SchemaPreview } from "./components/SchemaPreview";
import { StringSchemaEditor } from "./editors/StringSchemaEditor";
import { NumberSchemaEditor } from "./editors/NumberSchemaEditor";
import { ArraySchemaEditor } from "./editors/ArraySchemaEditor";
import { ObjectSchemaEditor } from "./editors/ObjectSchemaEditor";
import { BooleanSchemaEditor } from "./editors/BooleanSchemaEditor";
import styles from "./InlineSchemaEditor.module.css";

const STRING_FORMATS = [
  "date",
  "date-time",
  "time",
  "duration",
  "email",
  "idn-email",
  "hostname",
  "idn-hostname",
  "ipv4",
  "ipv6",
  "uri",
  "uri-reference",
  "iri",
  "iri-reference",
  "uuid",
  "regex",
  "json-pointer",
  "relative-json-pointer",
] as const;
const NUMBER_FORMATS = ["float", "double"] as const;
const INTEGER_FORMATS = ["int32", "int64"] as const;

export function InlineSchemaEditor(props: InlineSchemaEditorProps) {
  const current = props.value !== undefined ? props.value : props.schema;
  const update = (patch: Partial<OpenApiSchema>) => {
    if (props.disabled) return;
    props.onChange?.(applyPatch(current, patch));
    props.update?.(patch);
    if (Object.hasOwn(patch, "example")) props.onExampleChange?.(patch.example);
    if (Object.hasOwn(patch, "default")) props.onDefaultChange?.(patch.default);
  };
  if (typeof current === "boolean")
    return (
      <Box className={styles.root}>
        <Stack gap="3">
          <Text fontWeight="600">
            {current ? "Any value is allowed" : "No values are allowed"}
          </Text>
          <Text fontSize="sm">This is a boolean JSON Schema.</Text>
          {props.onRequiredChange && (
            <Switch.Root
              checked={!!props.required}
              disabled={props.disabled}
              onCheckedChange={(event) =>
                props.onRequiredChange?.(event.checked)
              }
            >
              <Switch.HiddenInput />
              <Switch.Control />
              <Switch.Label>Required</Switch.Label>
            </Switch.Root>
          )}
          <Button
            size="sm"
            disabled={props.disabled || !props.onChange}
            onClick={() => props.onChange?.(!current)}
          >
            {current ? "Disallow all values" : "Allow all values"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={props.disabled}
            onClick={() => update({})}
          >
            Configure constraints
          </Button>
        </Stack>
      </Box>
    );
  return <ObjectSchemaEditorView {...props} schema={current} update={update} />;
}

function ObjectSchemaEditorView(
  props: InlineSchemaEditorProps & {
    schema: OpenApiSchema | undefined;
    update: (patch: Partial<OpenApiSchema>) => void;
  },
) {
  const { schema, type } = useSchemaEditor(props.schema, props.schemaType);
  const { patch, replace } = useSchemaPatch(props.schema, props.update);
  const record = toSchemaRecord(schema);
  const isRefMode = typeof record.$ref === "string" && record.$ref.length > 0;

  const onTypeChange = useCallback(
    (nextType: InlineSchemaType) => {
      const next = createSchemaForType(nextType, schema);
      replace(next);
      props.onTypeChange?.(nextType);
    },
    [props, replace, schema],
  );

  const formatOptions = useMemo(
    () =>
      props.formatOptions ??
      (type === "string"
        ? STRING_FORMATS
        : type === "number"
          ? NUMBER_FORMATS
          : type === "integer"
            ? INTEGER_FORMATS
            : []),
    [props.formatOptions, type],
  );

  const mergeSchema = useCallback(
    (next: OpenApiSchema) => replace(next),
    [replace],
  );
  const previewVisible = props.showLiveJson !== false && !props.nested;

  const handleRefUpdate = useCallback(
    (nextPatch: Partial<OpenApiSchema>) => {
      // Reference siblings are valid schema constraints and must survive switching.
      patch(nextPatch);
    },
    [isRefMode, patch, replace, schema],
  );

  const showBasicEnum = !["object", "array", "null", "any"].includes(type);

  const content = (
    <Stack gap="2" minW="0" flex="1">
      <SchemaHeader
        name={props.schemaName}
        description={
          typeof schema.description === "string" ? schema.description : ""
        }
        type={type}
        required={props.required}
        disabled={props.disabled}
        onTypeChange={onTypeChange}
        onRequiredChange={props.onRequiredChange}
        onNameChange={props.onNameChange}
        hideName={!!props.nested}
        onDescriptionChange={(value) =>
          patch({ description: value || undefined })
        }
      />

      <details className={styles.reference} open={isRefMode || undefined}>
        <summary>Reference{isRefMode ? " linked" : " (optional)"}</summary>
        <SchemaReferenceEditor
          schema={schema}
          fullSchema={props.fullSchema}
          disabled={props.disabled}
          onClearReference={() => handleRefUpdate({ $ref: undefined })}
          update={handleRefUpdate}
        />
      </details>

      {!isRefMode && (
        <Tabs.Root
          size={"sm"}
          defaultValue="core"
          variant="plain"
          lazyMount
          unmountOnExit
        >
          <Tabs.List className={styles.tabsList}>
            <Tabs.Trigger value="core">Core</Tabs.Trigger>
            <Tabs.Trigger value="validation">Validation</Tabs.Trigger>
            {props.showAdvanced !== false && (
              <Tabs.Trigger value="advanced">Advanced</Tabs.Trigger>
            )}
          </Tabs.List>

          <Tabs.Content value="core" pt="2">
            <Stack gap="2">
              {type === "string" && (
                <StringSchemaEditor
                  schema={schema}
                  disabled={props.disabled}
                  formatOptions={formatOptions}
                  update={patch}
                />
              )}
              {(type === "number" || type === "integer") && (
                <NumberSchemaEditor
                  schema={schema}
                  disabled={props.disabled}
                  formatOptions={formatOptions}
                  update={patch}
                />
              )}
              {type === "boolean" && <BooleanSchemaEditor />}
              {type === "array" && (
                <ArraySchemaEditor
                  schema={schema}
                  fullSchema={props.fullSchema}
                  disabled={props.disabled}
                  onChange={mergeSchema}
                />
              )}
              {type === "object" && (
                <ObjectSchemaEditor
                  schema={schema}
                  fullSchema={props.fullSchema}
                  disabled={props.disabled}
                  onChange={mergeSchema}
                />
              )}
            </Stack>
          </Tabs.Content>

          <Tabs.Content value="validation" pt="2">
            <Stack gap="2">
              {showBasicEnum ? (
                <SchemaEnumEditor
                  schema={schema}
                  type={type}
                  disabled={props.disabled}
                  update={patch}
                />
              ) : null}
              {props.showComposition !== false && (
                <details className={styles.reference}>
                  <summary>Composition rules (allOf / anyOf / oneOf)</summary>
                  <SchemaCompositionEditor
                    schema={schema}
                    fullSchema={props.fullSchema}
                    disabled={props.disabled}
                    onChange={mergeSchema}
                  />
                </details>
              )}
            </Stack>
          </Tabs.Content>

          <Tabs.Content value="advanced" pt="2">
            <SchemaAdvancedEditor
              schema={schema}
              disabled={props.disabled}
              update={patch}
            />
          </Tabs.Content>
        </Tabs.Root>
      )}
    </Stack>
  );

  if (props.nested) {
    return <Box className={styles.root}>{content}</Box>;
  }

  return (
    <Box className={styles.root}>
      <Box className={styles.shell}>
        <Box className={styles.editorPane}>{content}</Box>
        {previewVisible && (
          <Box className={styles.previewPane}>
            <SchemaPreview schema={schema} path={props.path} />
          </Box>
        )}
      </Box>
    </Box>
  );
}
