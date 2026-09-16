import {
  Field,
  Grid,
  Input,
  Portal,
  Select,
  Stack,
  createListCollection,
} from "@chakra-ui/react";
import type { OpenApiSchema, SchemaFormatOptions } from "../types";
import {
  normalizeFormatOptions,
  parseOptionalNumber,
  toInputValue,
} from "../schemaUtils";

export function StringSchemaEditor(props: {
  schema: OpenApiSchema;
  disabled?: boolean;
  formatOptions?: SchemaFormatOptions;
  update: (patch: Partial<OpenApiSchema>) => void;
}) {
  const formats = normalizeFormatOptions(props.formatOptions);
  const collection = createListCollection({
    items: [
      { value: "", label: "None" },
      ...formats.map((value) => ({ value, label: value })),
    ],
  });

  return (
    <Stack gap="3">
      <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap="3">
        <Field.Root>
          <Field.Label>Format</Field.Label>
          <Select.Root
            collection={collection}
            size="sm"
            disabled={props.disabled}
            value={[
              typeof props.schema.format === "string"
                ? props.schema.format
                : "",
            ]}
            onValueChange={(e) =>
              props.update({ format: e.value?.[0] || undefined })
            }
          >
            <Select.HiddenSelect />
            <Select.Control>
              <Select.Trigger>
                <Select.ValueText placeholder="None" />
              </Select.Trigger>
              <Select.IndicatorGroup>
                <Select.Indicator />
              </Select.IndicatorGroup>
            </Select.Control>
            <Portal>
              <Select.Positioner>
                <Select.Content className="pdDesignerSelectMenu">
                  {collection.items.map((item) => (
                    <Select.Item item={item} key={item.value}>
                      {item.label}
                      <Select.ItemIndicator />
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Positioner>
            </Portal>
          </Select.Root>
        </Field.Root>
        <Field.Root>
          <Field.Label>Pattern</Field.Label>
          <Input
            size="sm"
            disabled={props.disabled}
            value={toInputValue(props.schema.pattern)}
            onChange={(e) =>
              props.update({ pattern: e.target.value || undefined })
            }
          />
        </Field.Root>
        <Field.Root>
          <Field.Label>Min length</Field.Label>
          <Input
            size="sm"
            type="number"
            disabled={props.disabled}
            value={toInputValue(props.schema.minLength)}
            onChange={(e) =>
              props.update({ minLength: parseOptionalNumber(e.target.value) })
            }
          />
        </Field.Root>
        <Field.Root>
          <Field.Label>Max length</Field.Label>
          <Input
            size="sm"
            type="number"
            disabled={props.disabled}
            value={toInputValue(props.schema.maxLength)}
            onChange={(e) =>
              props.update({ maxLength: parseOptionalNumber(e.target.value) })
            }
          />
        </Field.Root>
      </Grid>
    </Stack>
  );
}
