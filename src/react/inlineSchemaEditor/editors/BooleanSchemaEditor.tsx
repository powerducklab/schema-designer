import { Text } from "@chakra-ui/react";
import { useInlineSchemaLabels } from "../labels";

export function BooleanSchemaEditor() {
  const labels = useInlineSchemaLabels();
  return (
    <Text fontSize="sm" color="var(--color-text-secondary)">
      {labels.booleanConstraintsNote}
    </Text>
  );
}
