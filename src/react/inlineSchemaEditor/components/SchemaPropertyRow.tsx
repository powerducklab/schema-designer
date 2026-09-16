import { SettingsPanel } from "../../shared/SettingsPanel";
import { VscSettingsCompact } from "react-icons/vsc";
import type { SchemaValue } from "../../../core/types";
import {
  Box,
  Field,
  HStack,
  IconButton,
  Input,
  Popover,
  Portal,
  Stack,
  Switch,
  Text,
} from "@chakra-ui/react";
import { memo, useEffect, useRef, useState } from "react";
import type { OpenApiSchema } from "../types";
import { getSchemaSummary, getSchemaType } from "../schemaUtils";
import { InlineSchemaEditor } from "../InlineSchemaEditor";

export const SchemaPropertyRow = memo(function SchemaPropertyRow(props: {
  name: string;
  schema: SchemaValue;
  required: boolean;
  fullSchema?: OpenApiSchema;
  disabled?: boolean;
  siblingNames: string[];
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onRequiredChange: (required: boolean) => void;
  onChange: (schema: SchemaValue) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(props.name);
  const [error, setError] = useState("");
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setName(props.name);
    setError("");
  }, [props.name]);

  const validate = (next: string) => {
    const trimmed = next.trim();
    if (!trimmed) return "Property name is required.";
    if (trimmed !== props.name && props.siblingNames.includes(trimmed)) {
      return "Property name already exists.";
    }
    return "";
  };

  const commitRename = () => {
    const nextError = validate(name);
    setError(nextError);
    if (!nextError && name.trim() !== props.name) {
      props.onRename(name.trim());
    }
  };

  return (
    <Box className="pdDesignerSchemaNestedCard">
      <HStack align="start" gap="3" className="schemaPropertyRow">
        <Field.Root invalid={!!error} flex="1" minW="0">
          <Field.Label>Property</Field.Label>
          <Input
            size="sm"
            value={name}
            disabled={props.disabled}
            onChange={(e) => {
              setName(e.target.value);
              setError(validate(e.target.value));
            }}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitRename();
              }
              if (e.key === "Escape") {
                setName(props.name);
                setError("");
              }
              if (
                (e.metaKey || e.ctrlKey) &&
                e.shiftKey &&
                e.key.toLowerCase() === "d"
              ) {
                e.preventDefault();
                props.onDuplicate();
              }
              if ((e.metaKey || e.ctrlKey) && e.key === "Backspace") {
                e.preventDefault();
                props.onRemove();
              }
            }}
            placeholder="Property name"
          />
          {error ? <Field.ErrorText>{error}</Field.ErrorText> : null}
          <Text fontSize="xs" color="var(--color-text-secondary)" mt="1">
            {getSchemaSummary(props.schema)}
          </Text>
        </Field.Root>

        <Stack gap="2" pt="6" minW="88px" flexShrink={0}>
          <Text fontSize="xs" color="var(--color-text-secondary)">
            {getSchemaType(props.schema)}
          </Text>
          <Switch.Root
            checked={props.required}
            disabled={props.disabled}
            onCheckedChange={(e) => props.onRequiredChange(!!e.checked)}
          >
            <Switch.HiddenInput />
            <Switch.Control />
            <Switch.Label fontSize="xs">Required</Switch.Label>
          </Switch.Root>
        </Stack>

        <HStack pt="6" gap="1" flexShrink={0}>
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
                aria-label="Configure property"
                className="pdDesignerSchemaIconButton"
              >
                <VscSettingsCompact size={16} />
              </IconButton>
            </Popover.Trigger>
            <Portal>
              <Popover.Positioner>
                <SettingsPanel title={props.name}>
                  <InlineSchemaEditor
                    schema={props.schema}
                    onChange={props.onChange}
                    fullSchema={props.fullSchema}
                    disabled={props.disabled}
                    nested
                    path={[props.name]}
                  />
                </SettingsPanel>
              </Popover.Positioner>
            </Portal>
          </Popover.Root>

          <IconButton
            pt="0"
            size="xs"
            variant="plain"
            aria-label="Duplicate property"
            className="pdDesignerSchemaIconButton"
            disabled={props.disabled}
            onClick={props.onDuplicate}
          >
            ⧉
          </IconButton>

          <IconButton
            pt="0"
            size="xs"
            variant="plain"
            aria-label="Remove property"
            className="pdDesignerSchemaIconButton"
            disabled={props.disabled}
            onClick={props.onRemove}
          >
            ×
          </IconButton>
        </HStack>
      </HStack>
    </Box>
  );
});
