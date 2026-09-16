import { Field, HStack, Input, Stack, Switch, VStack } from "@chakra-ui/react";
import { memo } from "react";
import type { InlineSchemaType } from "../types";
import { SchemaTypeSelector } from "./SchemaTypeSelector";

export const SchemaHeader = memo(function SchemaHeader(props: {
  name?: string;
  description?: string;
  type: InlineSchemaType;
  required?: boolean;
  disabled?: boolean;
  hideName?: boolean;
  onTypeChange: (type: InlineSchemaType) => void;
  onRequiredChange?: (value: boolean) => void;
  onNameChange?: (value: string) => void;
  onDescriptionChange?: (value: string) => void;
}) {
  return (
    <Stack gap="2" className="pdDesignerSchemaSection">
      <HStack justify="space-between" gap="2" align="start" flexWrap="wrap">
        {!props.hideName && (
          <VStack flex="1">
            {!props.hideName ? (
              <Field.Root>
                <Field.Label>Field name</Field.Label>
                <Input
                  size="sm"
                  value={props.name ?? ""}
                  disabled={props.disabled}
                  placeholder="customerEmail"
                  onChange={(e) => props.onNameChange?.(e.target.value)}
                />
              </Field.Root>
            ) : null}
          </VStack>
        )}

        <HStack gap="4" flexShrink={0} align="end">
          <Field.Root>
            <Field.Label>Type</Field.Label>
            <SchemaTypeSelector
              value={props.type}
              disabled={props.disabled}
              onChange={props.onTypeChange}
            />
          </Field.Root>
          <HStack gap="2" align="center" flexWrap="wrap">
            {props.onRequiredChange ? (
              <Switch.Root
                checked={!!props.required}
                disabled={props.disabled}
                onCheckedChange={(e) => props.onRequiredChange?.(!!e.checked)}
              >
                <Switch.HiddenInput />
                <Switch.Control />
                <Switch.Label>Required</Switch.Label>
              </Switch.Root>
            ) : null}
          </HStack>
        </HStack>
      </HStack>

      <Field.Root>
        <Field.Label>Description</Field.Label>
        <Input
          size="sm"
          value={props.description ?? ""}
          disabled={props.disabled}
          placeholder="Helpful summary for API consumers"
          onChange={(e) => props.onDescriptionChange?.(e.target.value)}
        />
      </Field.Root>
    </Stack>
  );
});
