import { VscSettingsCompact } from "react-icons/vsc";
import { SettingsPanel } from "../shared/SettingsPanel";
import inlineStyles from "../inlineSchemaEditor/InlineSchemaEditor.module.css";
import {
  Button,
  Field,
  Input,
  NativeSelect,
  Popover,
  Portal,
  Stack,
  Switch,
  Tabs,
} from "@chakra-ui/react";
import { InlineSchemaEditor } from "../inlineSchemaEditor/InlineSchemaEditor";
import type { OpenApiParameter } from "./libs/types";

export function ParameterSettings({
  parameter,
  document,
  disabled,
  onChange,
}: {
  parameter: OpenApiParameter;
  document?: Record<string, unknown>;
  disabled?: boolean;
  onChange: (parameter: OpenApiParameter) => void;
}) {
  const patch = (value: Partial<OpenApiParameter>) => {
    if (!disabled) onChange({ ...parameter, ...value });
  };
  return (
    <Popover.Root
      lazyMount
      unmountOnExit
      positioning={{
        placement: "bottom-start",
        strategy: "fixed",
        overflowPadding: 12,
      }}
    >
      <Popover.Trigger asChild>
        <Button
          width="24px"
          minWidth="24px"
          height="24px"
          padding="0"
          size="xs"
          variant="ghost"
          aria-label={`Configure ${parameter.name}`}
          title={`Configure ${parameter.name}`}
        >
          <VscSettingsCompact size={16} />
        </Button>
      </Popover.Trigger>
      <Portal>
        <Popover.Positioner>
          <SettingsPanel title={parameter.name || "Parameter"}>
            <div className={inlineStyles.root}>
              <Tabs.Root
                variant="plain"
                defaultValue="schema"
                lazyMount
                unmountOnExit
              >
                <Tabs.List>
                  <Tabs.Trigger value="schema">Schema</Tabs.Trigger>
                  <Tabs.Trigger value="parameter">Parameter</Tabs.Trigger>
                </Tabs.List>
                <Tabs.Content value="parameter" pt="2">
                  <Stack gap="2">
                    <Field.Root>
                      <Field.Label>Location</Field.Label>
                      <NativeSelect.Root disabled={disabled}>
                        <NativeSelect.Field
                          value={parameter.in}
                          onChange={(event) => {
                            const location = event.target
                              .value as OpenApiParameter["in"];
                            patch({
                              in: location,
                              required:
                                location === "path" ? true : parameter.required,
                            });
                          }}
                        >
                          {[
                            "query",
                            "header",
                            "path",
                            "cookie",
                            "querystring",
                          ].map((value) => (
                            <option key={value}>{value}</option>
                          ))}
                        </NativeSelect.Field>
                      </NativeSelect.Root>
                    </Field.Root>
                    <Switch.Root
                      checked={parameter.in === "path" || !!parameter.required}
                      disabled={disabled || parameter.in === "path"}
                      onCheckedChange={(event) =>
                        patch({ required: event.checked })
                      }
                    >
                      <Switch.HiddenInput />
                      <Switch.Control />
                      <Switch.Label>Required</Switch.Label>
                    </Switch.Root>
                    <Field.Root>
                      <Field.Label>Description</Field.Label>
                      <Input
                        value={parameter.description ?? ""}
                        disabled={disabled}
                        onChange={(event) =>
                          patch({ description: event.target.value })
                        }
                      />
                    </Field.Root>
                    <details className={inlineStyles.reference}>
                      <summary>Serialization</summary>
                      <Stack gap="2" pt="2">
                        <Field.Root>
                          <Field.Label>Serialization style</Field.Label>
                          <Input
                            value={parameter.style ?? ""}
                            disabled={disabled}
                            placeholder="Default for location"
                            onChange={(event) =>
                              patch({ style: event.target.value || undefined })
                            }
                          />
                        </Field.Root>
                        <Switch.Root
                          checked={!!parameter.explode}
                          disabled={disabled}
                          onCheckedChange={(event) =>
                            patch({ explode: event.checked })
                          }
                        >
                          <Switch.HiddenInput />
                          <Switch.Control />
                          <Switch.Label>Explode</Switch.Label>
                        </Switch.Root>
                        <Switch.Root
                          checked={!!parameter.allowReserved}
                          disabled={disabled}
                          onCheckedChange={(event) =>
                            patch({ allowReserved: event.checked })
                          }
                        >
                          <Switch.HiddenInput />
                          <Switch.Control />
                          <Switch.Label>Allow reserved characters</Switch.Label>
                        </Switch.Root>
                      </Stack>
                    </details>
                  </Stack>
                </Tabs.Content>
                <Tabs.Content value="schema" pt="2">
                  {parameter.content ? (
                    <p>
                      This parameter uses content. Its media type schema is
                      preserved.
                    </p>
                  ) : (
                    <InlineSchemaEditor
                      schema={parameter.schema ?? {}}
                      fullSchema={document}
                      nested
                      disabled={disabled}
                      onChange={(value) => patch({ schema: value })}
                    />
                  )}
                </Tabs.Content>
              </Tabs.Root>
            </div>
          </SettingsPanel>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
