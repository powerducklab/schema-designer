import { SettingsPanel } from "../../shared/SettingsPanel";
import { VscSettingsCompact } from "react-icons/vsc";
import {
  Box,
  Field,
  Grid,
  HStack,
  IconButton,
  Input,
  NativeSelect,
  Popover,
  Portal,
  Stack,
  Text,
} from "@chakra-ui/react";
import { memo, useRef } from "react";
import type { OpenApiSchema } from "../types";
import {
  getSchemaSummary,
  parseOptionalNumber,
  toInputValue,
} from "../schemaUtils";
import { SchemaPropertyList } from "../components/SchemaPropertyList";
import { InlineSchemaEditor } from "../InlineSchemaEditor";

export const ObjectSchemaEditor = memo(function ObjectSchemaEditor(props: {
  schema: OpenApiSchema;
  fullSchema?: OpenApiSchema;
  disabled?: boolean;
  onChange: (schema: OpenApiSchema) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const mode =
    props.schema.additionalProperties === false
      ? "deny"
      : typeof props.schema.additionalProperties === "object"
        ? "schema"
        : "allow";

  const additional =
    typeof props.schema.additionalProperties === "object" &&
    props.schema.additionalProperties !== null
      ? (props.schema.additionalProperties as OpenApiSchema)
      : ({ type: "string" } as OpenApiSchema);

  return (
    <Stack gap="4">
      <SchemaPropertyList
        schema={props.schema}
        fullSchema={props.fullSchema}
        disabled={props.disabled}
        onChange={props.onChange}
      />

      <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap="3">
        {["minProperties", "maxProperties"].map((key) => (
          <Field.Root key={key}>
            <Field.Label>{key}</Field.Label>
            <Input
              size="sm"
              type="number"
              disabled={props.disabled}
              value={toInputValue(props.schema[key])}
              onChange={(e) =>
                props.onChange({
                  ...props.schema,
                  [key]: parseOptionalNumber(e.target.value),
                } as OpenApiSchema)
              }
            />
          </Field.Root>
        ))}
      </Grid>

      <Stack gap="2" className="pdDesignerSchemaSection">
        <Text fontSize="sm" fontWeight="700">
          Additional properties
        </Text>

        <Field.Root>
          <NativeSelect.Root size="sm" disabled={props.disabled}>
            <NativeSelect.Field
              value={mode}
              onChange={(e) => {
                const value = e.target.value;
                props.onChange({
                  ...props.schema,
                  additionalProperties:
                    value === "deny"
                      ? false
                      : value === "schema"
                        ? additional
                        : undefined,
                } as OpenApiSchema);
              }}
            >
              <option value="allow">Allow any property</option>
              <option value="deny">Disallow extra properties</option>
              <option value="schema">Validate with schema</option>
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Field.Root>

        {mode === "schema" ? (
          <Box className="pdDesignerSchemaNestedCard">
            <HStack justify="space-between" align="center" gap="3">
              <Box flex="1" minW="0">
                <Text fontSize="sm" fontWeight="600">
                  Additional property schema
                </Text>
                <Text
                  fontSize="xs"
                  color="var(--color-text-secondary)"
                  lineClamp={2}
                >
                  {getSchemaSummary(additional)}
                </Text>
              </Box>

              <Popover.Root
                lazyMount
                unmountOnExit
                positioning={{ placement: "left-start", strategy: "fixed" }}
                onOpenChange={(details) => {
                  if (!details.open && triggerRef.current) {
                    window.requestAnimationFrame(() =>
                      triggerRef.current?.focus(),
                    );
                  }
                }}
              >
                <Popover.Trigger asChild>
                  <IconButton
                    ref={triggerRef}
                    size="xs"
                    variant="outline"
                    aria-label="Configure additional property schema"
                    className="pdDesignerSchemaIconButton"
                  >
                    <VscSettingsCompact size={16} />
                  </IconButton>
                </Popover.Trigger>
                <Portal>
                  <Popover.Positioner>
                    <SettingsPanel title={"Additional properties"}>
                      <InlineSchemaEditor
                        schema={additional}
                        fullSchema={props.fullSchema}
                        disabled={props.disabled}
                        nested
                        path={["additionalProperties"]}
                        onChange={(value) =>
                          props.onChange({
                            ...props.schema,
                            additionalProperties: value,
                          } as OpenApiSchema)
                        }
                      />
                    </SettingsPanel>
                  </Popover.Positioner>
                </Portal>
              </Popover.Root>
            </HStack>
          </Box>
        ) : null}
      </Stack>
    </Stack>
  );
});
