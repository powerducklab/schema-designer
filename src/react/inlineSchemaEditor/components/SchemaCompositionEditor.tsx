import { VscSettingsCompact } from "react-icons/vsc";
import { LuX } from "react-icons/lu";
import { SettingsPanel } from "../../shared/SettingsPanel";
import type { SchemaValue } from "../../../core/types";
import {
  Box,
  Button,
  HStack,
  IconButton,
  Popover,
  Portal,
  Stack,
  Tabs,
  Text,
} from "@chakra-ui/react";
import { memo } from "react";
import type { CompositionKey, OpenApiSchema } from "../types";
import {
  getComposition,
  getSchemaSummary,
  setComposition,
} from "../schemaUtils";
import { InlineSchemaEditor } from "../InlineSchemaEditor";

const KEYS: CompositionKey[] = ["allOf", "anyOf", "oneOf"];

const CompositionList = memo(function CompositionList(props: {
  schema: OpenApiSchema;
  fullSchema?: OpenApiSchema;
  keyName: CompositionKey;
  disabled?: boolean;
  onChange: (schema: OpenApiSchema) => void;
}) {
  const { schema, fullSchema, keyName, disabled, onChange } = props;
  const values = getComposition(schema, keyName);

  const commit = (nextValues: SchemaValue[]) =>
    onChange(setComposition(schema, keyName, nextValues));

  return (
    <Stack gap="3" className="pdDesignerSchemaSection">
      <Button
        size="xs"
        alignSelf="flex-start"
        variant="outline"
        disabled={disabled}
        onClick={() =>
          commit([
            ...values,
            { type: "object", properties: {} } as OpenApiSchema,
          ])
        }
      >
        Add {keyName} item
      </Button>

      {values.length === 0 ? (
        <Text fontSize="xs" color="var(--color-text-secondary)">
          No {keyName} rules.
        </Text>
      ) : null}

      {values.map((item, index) => {
        return (
          <Box
            key={`${keyName}-${index}`}
            className="pdDesignerSchemaNestedCard"
          >
            <HStack justify="space-between" align="center" gap="3">
              <Box flex="1" minW="0">
                <Text fontSize="sm" fontWeight="600">
                  {keyName}[{index}]
                </Text>
                <Text
                  fontSize="xs"
                  color="var(--color-text-secondary)"
                  lineClamp={2}
                >
                  {getSchemaSummary(item)}
                </Text>
              </Box>

              <HStack gap="1" flexShrink={0}>
                <Popover.Root
                  lazyMount
                  unmountOnExit
                  positioning={{ placement: "left-start", strategy: "fixed" }}
                >
                  <Popover.Trigger asChild>
                    <IconButton
                      size="xs"
                      variant="outline"
                      aria-label={`Configure ${keyName} item ${index + 1}`}
                      className="pdDesignerSchemaIconButton"
                    >
                      <VscSettingsCompact size={16} />
                    </IconButton>
                  </Popover.Trigger>
                  <Portal>
                    <Popover.Positioner>
                      <SettingsPanel title={`${keyName} · ${index + 1}`}>
                        <InlineSchemaEditor
                          schema={item}
                          fullSchema={fullSchema}
                          disabled={disabled}
                          nested
                          path={[keyName, String(index)]}
                          onChange={(value) => {
                            const next = [...values];
                            next[index] = value;
                            commit(next);
                          }}
                        />
                      </SettingsPanel>
                    </Popover.Positioner>
                  </Portal>
                </Popover.Root>

                <IconButton
                  size="xs"
                  variant="plain"
                  aria-label={`Remove ${keyName} item ${index + 1}`}
                  className="pdDesignerSchemaIconButton"
                  disabled={disabled}
                  onClick={() =>
                    commit(values.filter((_, itemIndex) => itemIndex !== index))
                  }
                >
                  <LuX size={14} strokeWidth={1.5} />
                </IconButton>
              </HStack>
            </HStack>
          </Box>
        );
      })}
    </Stack>
  );
});

export const SchemaCompositionEditor = memo(
  function SchemaCompositionEditor(props: {
    schema: OpenApiSchema;
    fullSchema?: OpenApiSchema;
    disabled?: boolean;
    onChange: (schema: OpenApiSchema) => void;
  }) {
    return (
      <Tabs.Root size={"sm"} defaultValue="allOf" variant="plain" lazyMount>
        <Tabs.List className="pdDesignerSchemaTabsList">
          {KEYS.map((key) => (
            <Tabs.Trigger key={key} value={key}>
              {key}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {KEYS.map((key) => (
          <Tabs.Content key={key} value={key} pt="3">
            <CompositionList
              schema={props.schema}
              fullSchema={props.fullSchema}
              keyName={key}
              disabled={props.disabled}
              onChange={props.onChange}
            />
          </Tabs.Content>
        ))}
      </Tabs.Root>
    );
  },
);
