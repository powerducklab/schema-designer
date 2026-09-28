import { createListCollection, Select, Portal } from "@chakra-ui/react";
import { useMemo } from "react";
import type { InlineSchemaType } from "../types";
import { useInlineSchemaLabels } from "../labels";

export function SchemaTypeSelector(props: {
  value: InlineSchemaType;
  disabled?: boolean;
  onChange: (value: InlineSchemaType) => void;
}) {
  const labels = useInlineSchemaLabels();
  const options = useMemo(
    () =>
      createListCollection({
        items: [
          { value: "any", label: labels.typeAny },
          { value: "string", label: labels.typeString },
          { value: "number", label: labels.typeNumber },
          { value: "integer", label: labels.typeInteger },
          { value: "boolean", label: labels.typeBoolean },
          { value: "array", label: labels.typeArray },
          { value: "object", label: labels.typeObject },
          { value: "null", label: labels.typeNull },
        ],
      }),
    [
      labels.typeAny,
      labels.typeString,
      labels.typeNumber,
      labels.typeInteger,
      labels.typeBoolean,
      labels.typeArray,
      labels.typeObject,
      labels.typeNull,
    ],
  );
  return (
    <Select.Root
      collection={options}
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
          <Select.ValueText placeholder={labels.selectTypePlaceholder} />
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
            {options.items.map((item) => (
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
