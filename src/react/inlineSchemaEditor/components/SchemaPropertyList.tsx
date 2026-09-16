import { Button, HStack, Stack, Text } from "@chakra-ui/react";
import { memo, useCallback, useMemo } from "react";
import type { OpenApiSchema } from "../types";
import {
  cloneSchema,
  getProperties,
  getRequiredProperties,
  removeProperty,
  renameProperty,
  setPropertyRequired,
  updateProperty,
} from "../schemaUtils";
import { SchemaPropertyRow } from "./SchemaPropertyRow";

export const SchemaPropertyList = memo(function SchemaPropertyList(props: {
  schema: OpenApiSchema;
  fullSchema?: OpenApiSchema;
  disabled?: boolean;
  onChange: (schema: OpenApiSchema) => void;
}) {
  const properties = useMemo(() => getProperties(props.schema), [props.schema]);
  const required = useMemo(
    () => getRequiredProperties(props.schema),
    [props.schema],
  );
  const names = useMemo(() => Object.keys(properties), [properties]);

  const add = useCallback(() => {
    let index = names.length + 1;
    let name = `property${index}`;
    while (name in properties) name = `property${++index}`;
    props.onChange(
      updateProperty(props.schema, name, { type: "string" } as OpenApiSchema),
    );
  }, [names, properties, props]);

  const duplicate = useCallback(
    (name: string) => {
      let index = 2;
      let nextName = `${name}Copy`;
      while (nextName in properties) nextName = `${name}Copy${index++}`;
      props.onChange(
        updateProperty(props.schema, nextName, cloneSchema(properties[name])),
      );
    },
    [properties, props],
  );

  return (
    <Stack gap="3" className="pdDesignerSchemaSection">
      <HStack justify="space-between" align="center">
        <Text fontWeight="700" fontSize="sm">
          Properties
        </Text>
        <Button
          size="xs"
          variant="outline"
          disabled={props.disabled}
          onClick={add}
        >
          Add property
        </Button>
      </HStack>

      {names.map((name) => (
        <SchemaPropertyRow
          key={name}
          name={name}
          schema={properties[name]}
          required={required.has(name)}
          siblingNames={names}
          fullSchema={props.fullSchema}
          disabled={props.disabled}
          onRename={(next) =>
            props.onChange(renameProperty(props.schema, name, next))
          }
          onDuplicate={() => duplicate(name)}
          onRequiredChange={(value) =>
            props.onChange(setPropertyRequired(props.schema, name, value))
          }
          onChange={(schema) =>
            props.onChange(updateProperty(props.schema, name, schema))
          }
          onRemove={() => props.onChange(removeProperty(props.schema, name))}
        />
      ))}

      {!names.length ? (
        <Text fontSize="xs" color="var(--color-text-secondary)">
          No properties defined.
        </Text>
      ) : null}
    </Stack>
  );
});
