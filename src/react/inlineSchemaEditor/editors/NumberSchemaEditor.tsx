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

export function NumberSchemaEditor(props: {
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
  const numeric = (key: string, value: string) =>
    props.update({
      [key]: parseOptionalNumber(value),
    } as Partial<OpenApiSchema>);

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
          <Field.Label>Multiple of</Field.Label>
          <Input
            size="sm"
            type="number"
            disabled={props.disabled}
            value={toInputValue(props.schema.multipleOf)}
            onChange={(e) => numeric("multipleOf", e.target.value)}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label>Minimum</Field.Label>
          <Input
            size="sm"
            type="number"
            disabled={props.disabled}
            value={toInputValue(props.schema.minimum)}
            onChange={(e) => numeric("minimum", e.target.value)}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label>Maximum</Field.Label>
          <Input
            size="sm"
            type="number"
            disabled={props.disabled}
            value={toInputValue(props.schema.maximum)}
            onChange={(e) => numeric("maximum", e.target.value)}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label>Exclusive minimum</Field.Label>
          <Input
            size="sm"
            type="number"
            disabled={props.disabled}
            value={toInputValue(props.schema.exclusiveMinimum)}
            onChange={(e) => numeric("exclusiveMinimum", e.target.value)}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label>Exclusive maximum</Field.Label>
          <Input
            size="sm"
            type="number"
            disabled={props.disabled}
            value={toInputValue(props.schema.exclusiveMaximum)}
            onChange={(e) => numeric("exclusiveMaximum", e.target.value)}
          />
        </Field.Root>
      </Grid>
    </Stack>
  );
}
