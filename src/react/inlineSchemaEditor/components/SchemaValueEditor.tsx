import {
  Field,
  Input,
  Textarea,
  Select,
  Portal,
  createListCollection,
} from "@chakra-ui/react";
import { useEffect, useMemo, useState } from "react";
import type { InlineSchemaType } from "../types";
import {
  canParseSchemaValue,
  parseSchemaValue,
  stringifySchemaValue,
} from "../schemaUtils";

export function SchemaValueEditor(props: {
  value: unknown;
  type: InlineSchemaType;
  disabled?: boolean;
  placeholder?: string;
  error?: string;
  onChange: (value: unknown) => void;
  onTextChange?: (value: string) => void;
}) {
  const externalText = stringifySchemaValue(props.value);
  const [draft, setDraft] = useState(externalText);
  useEffect(() => {
    setDraft(externalText);
  }, [externalText, props.type]);
  const booleanCollection = useMemo(
    () =>
      createListCollection({
        items: [
          { label: "Unset", value: "" },
          { label: "True", value: "true" },
          { label: "False", value: "false" },
        ],
      }),
    [],
  );

  const change = (text: string) => {
    setDraft(text);
    props.onTextChange?.(text);
    if (canParseSchemaValue(text, props.type)) {
      props.onChange(parseSchemaValue(text, props.type));
    }
  };

  if (props.type === "boolean") {
    return (
      <Field.Root invalid={!!props.error}>
        <Select.Root
          collection={booleanCollection}
          size="sm"
          disabled={props.disabled}
          value={[String(props.value ?? "")]}
          onValueChange={(e) => change(e.value?.[0] ?? "")}
        >
          <Select.HiddenSelect />
          <Select.Control>
            <Select.Trigger>
              <Select.ValueText placeholder="Unset" />
            </Select.Trigger>
            <Select.IndicatorGroup>
              <Select.Indicator />
            </Select.IndicatorGroup>
          </Select.Control>
          <Portal>
            <Select.Positioner>
              <Select.Content className="pdDesignerSelectMenu">
                {booleanCollection.items.map((item) => (
                  <Select.Item item={item} key={item.value}>
                    {item.label}
                    <Select.ItemIndicator />
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Positioner>
          </Portal>
        </Select.Root>
        {props.error && <Field.ErrorText>{props.error}</Field.ErrorText>}
      </Field.Root>
    );
  }

  const multiline = ["array", "object", "any"].includes(props.type);
  const value = draft;

  return (
    <Field.Root invalid={!!props.error}>
      {multiline ? (
        <Textarea
          value={value}
          disabled={props.disabled}
          placeholder={props.placeholder}
          minH="96px"
          fontFamily="mono"
          fontSize="xs"
          onChange={(e) => change(e.target.value)}
        />
      ) : (
        <Input
          size="sm"
          value={value}
          disabled={props.disabled}
          placeholder={props.placeholder}
          onChange={(e) => change(e.target.value)}
        />
      )}
      {props.error && <Field.ErrorText>{props.error}</Field.ErrorText>}
    </Field.Root>
  );
}
