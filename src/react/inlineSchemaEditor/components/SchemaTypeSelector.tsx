import { createListCollection, Select, Portal } from "@chakra-ui/react";
import type { InlineSchemaType } from "../types";

const OPTIONS = createListCollection({
  items: [
    { value: "any", label: "Any" },
    { value: "string", label: "String" },
    { value: "number", label: "Number" },
    { value: "integer", label: "Integer" },
    { value: "boolean", label: "Boolean" },
    { value: "array", label: "Array" },
    { value: "object", label: "Object" },
    { value: "null", label: "Null" },
  ],
});

export function SchemaTypeSelector(props: {
  value: InlineSchemaType;
  disabled?: boolean;
  onChange: (value: InlineSchemaType) => void;
}) {
  return (
    <Select.Root
      collection={OPTIONS}
      size="sm"
      width="132px"
      value={[props.value]}
      disabled={props.disabled}
      onValueChange={(e) =>
        props.onChange((e.value?.[0] ?? "any") as InlineSchemaType)
      }
    >
      <Select.HiddenSelect />
      <Select.Control>
        <Select.Trigger>
          <Select.ValueText placeholder="Select type" />
        </Select.Trigger>
        <Select.IndicatorGroup>
          <Select.Indicator />
        </Select.IndicatorGroup>
      </Select.Control>
      <Portal>
        <Select.Positioner>
          <Select.Content
            className="pdDesignerSelectMenu"
            background="var(--color-surface)"
            color="var(--color-text-primary)"
            borderColor="var(--color-border-default)"
            fontSize="12px"
          >
            {OPTIONS.items.map((item) => (
              <Select.Item item={item} key={item.value}>
                {item.label}
                <Select.ItemIndicator />
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Positioner>
      </Portal>
    </Select.Root>
  );
}
