import { SettingsPanel } from "../../shared/SettingsPanel";
import { VscSettingsCompact } from "react-icons/vsc";
import type { SchemaValue } from "../../../core/types";
import {
  Box,
  Button,
  Field,
  Grid,
  HStack,
  IconButton,
  Input,
  Popover,
  Portal,
  Stack,
  Switch,
  Text,
} from "@chakra-ui/react";
import { memo, useRef } from "react";
import type { OpenApiSchema } from "../types";
import {
  getArrayItems,
  getPrefixItems,
  getSchemaSummary,
  parseOptionalNumber,
  toInputValue,
} from "../schemaUtils";
import { InlineSchemaEditor } from "../InlineSchemaEditor";

const NestedSchemaCard = memo(function NestedSchemaCard(props: {
  title: string;
  onRemove?: () => void;
  description: string;
  schema: SchemaValue;
  path: string[];
  fullSchema?: OpenApiSchema;
  disabled?: boolean;
  onChange: (schema: SchemaValue) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  return (
    <Box className="pdDesignerSchemaNestedCard">
      <HStack justify="space-between" align="center" gap="3">
        <Box flex="1" minW="0">
          <Text fontWeight="600" fontSize="sm">
            {props.title}
          </Text>
          <Text fontSize="xs" color="var(--color-text-secondary)" mb="1">
            {props.description}
          </Text>
          <Text fontSize="xs" color="var(--color-text-secondary)" lineClamp={2}>
            {getSchemaSummary(props.schema)}
          </Text>
        </Box>

        {props.onRemove && (
          <Button
            size="xs"
            variant="ghost"
            disabled={props.disabled}
            onClick={props.onRemove}
            aria-label={`Remove ${props.title.toLowerCase()}`}
          >
            Remove
          </Button>
        )}
        <Popover.Root
          lazyMount
          unmountOnExit
          positioning={{ placement: "left-start", strategy: "fixed" }}
          onOpenChange={(details) => {
            if (!details.open && triggerRef.current) {
              window.requestAnimationFrame(() => triggerRef.current?.focus());
            }
          }}
        >
          <Popover.Trigger asChild>
            <IconButton
              ref={triggerRef}
              size="xs"
              variant="outline"
              aria-label={`Configure ${props.title.toLowerCase()}`}
              className="pdDesignerSchemaIconButton"
            >
              <VscSettingsCompact size={16} />
            </IconButton>
          </Popover.Trigger>
          <Portal>
            <Popover.Positioner>
              <SettingsPanel title={props.title}>
                <InlineSchemaEditor
                  schema={props.schema}
                  onChange={props.onChange}
                  fullSchema={props.fullSchema}
                  disabled={props.disabled}
                  nested
                  path={props.path}
                />
              </SettingsPanel>
            </Popover.Positioner>
          </Portal>
        </Popover.Root>
      </HStack>
    </Box>
  );
});

export const ArraySchemaEditor = memo(function ArraySchemaEditor(props: {
  schema: OpenApiSchema;
  fullSchema?: OpenApiSchema;
  disabled?: boolean;
  onChange: (schema: OpenApiSchema) => void;
}) {
  const items =
    getArrayItems(props.schema) ?? ({ type: "string" } as OpenApiSchema);
  const prefixItems = getPrefixItems(props.schema);
  const contains = (
    typeof props.schema.contains === "boolean" ||
    (typeof props.schema.contains === "object" && props.schema.contains)
      ? props.schema.contains
      : { type: "string" }
  ) as SchemaValue;

  return (
    <Stack gap="4">
      <NestedSchemaCard
        title="Items schema"
        description="Define the schema used by each array item."
        schema={items}
        fullSchema={props.fullSchema}
        disabled={props.disabled}
        path={["items"]}
        onChange={(next) =>
          props.onChange({
            ...props.schema,
            type: "array",
            items: next,
          } as OpenApiSchema)
        }
      />

      <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap="3">
        {["minItems", "maxItems", "minContains", "maxContains"].map((key) => (
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

      <Switch.Root
        checked={props.schema.uniqueItems === true}
        disabled={props.disabled}
        onCheckedChange={(e) =>
          props.onChange({
            ...props.schema,
            uniqueItems: e.checked ? true : undefined,
          } as OpenApiSchema)
        }
      >
        <Switch.HiddenInput />
        <Switch.Control />
        <Switch.Label>Unique items</Switch.Label>
      </Switch.Root>

      <NestedSchemaCard
        title="Contains schema"
        description="Require at least one array item to match this schema."
        schema={contains}
        fullSchema={props.fullSchema}
        disabled={props.disabled}
        path={["contains"]}
        onChange={(next) =>
          props.onChange({ ...props.schema, contains: next } as OpenApiSchema)
        }
      />

      <Stack gap="2" className="pdDesignerSchemaSection">
        <HStack justify="space-between" align="center">
          <Text fontSize="sm" fontWeight="700">
            Tuple prefix items
          </Text>
          <Button
            size="xs"
            variant="outline"
            disabled={props.disabled}
            onClick={() =>
              props.onChange({
                ...props.schema,
                prefixItems: [...prefixItems, { type: "string" }],
              } as OpenApiSchema)
            }
          >
            Add prefix item
          </Button>
        </HStack>

        {prefixItems.length === 0 ? (
          <Text fontSize="xs" color="var(--color-text-secondary)">
            No tuple prefix items.
          </Text>
        ) : null}

        {prefixItems.map((item, index) => (
          <NestedSchemaCard
            key={`prefix-${index}`}
            title={`Prefix item ${index + 1}`}
            description="Schema for the positional tuple item."
            schema={item}
            fullSchema={props.fullSchema}
            disabled={props.disabled}
            path={["prefixItems", String(index)]}
            onRemove={() =>
              props.onChange({
                ...props.schema,
                prefixItems: prefixItems.filter(
                  (_, position) => position !== index,
                ),
              })
            }
            onChange={(next) => {
              const values = [...prefixItems];
              values[index] = next;
              props.onChange({
                ...props.schema,
                prefixItems: values,
              } as OpenApiSchema);
            }}
          />
        ))}
      </Stack>
    </Stack>
  );
});
