import { Box, Button, HStack, Portal, Stack, Text } from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { OpenApiSchema } from "../types";
import { diffSchemaLines } from "../schemaUtils";

function previewText(schema: OpenApiSchema): string {
  try {
    return JSON.stringify(schema, null, 2);
  } catch {
    return "Schema preview unavailable: input contains a cyclic or non-JSON value.";
  }
}

export function SchemaPreview(props: {
  schema: OpenApiSchema;
  path?: string[];
}) {
  const [copied, setCopied] = useState(false);
  const [baselineText, setBaselineText] = useState(() =>
    previewText(props.schema),
  );
  const [lastStableText, setLastStableText] = useState(() =>
    previewText(props.schema),
  );
  const currentText = useMemo(() => previewText(props.schema), [props.schema]);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(copyTimerRef.current), []);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (currentText === lastStableText) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setBaselineText(lastStableText);
      setLastStableText(currentText);
      timerRef.current = null;
    }, 1400);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [currentText, lastStableText]);

  const lines = useMemo(
    () => diffSchemaLines(baselineText, currentText),
    [baselineText, currentText],
  );
  const pathText = (
    props.path?.length ? props.path.join(" / ") : "root"
  ).replace(/\./g, " / ");

  return (
    <Stack gap="3" h="100%">
      <HStack justify="space-between" align="start">
        <Box minW="0">
          <Text
            fontSize="sm"
            fontWeight="700"
            color="var(--color-text-primary)"
          >
            Generated schema
          </Text>
          <Text
            fontSize="xs"
            color="var(--color-text-secondary)"
            whiteSpace="nowrap"
            overflow="hidden"
            textOverflow="ellipsis"
          >
            {pathText}
          </Text>
        </Box>
        <Button
          size="xs"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(currentText);
              setCopied(true);
              clearTimeout(copyTimerRef.current);
              copyTimerRef.current = setTimeout(() => setCopied(false), 1400);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </HStack>

      <Box
        flex="1"
        minH="0"
        overflow="auto"
        border="1px solid var(--color-border-subtle)"
        borderRadius="var(--radius-xl)"
        bg="var(--color-surface-subtle)"
        p="3"
        fontFamily="mono"
        fontSize="12px"
      >
        {lines.map((line, index) => (
          <Box
            key={`${index}-${line.kind}-${line.value}`}
            px="2"
            py="0.5"
            borderRadius="var(--radius-sm)"
            bg={
              line.kind === "added"
                ? "var(--color-success-soft)"
                : line.kind === "removed"
                  ? "var(--color-danger-soft)"
                  : "transparent"
            }
            color={
              line.kind === "added"
                ? "var(--color-success)"
                : line.kind === "removed"
                  ? "var(--color-danger)"
                  : "var(--color-text-primary)"
            }
            textDecoration={line.kind === "removed" ? "line-through" : "none"}
            whiteSpace="pre"
          >
            {line.value || " "}
          </Box>
        ))}
      </Box>

      {copied ? (
        <Portal>
          <Box
            position="fixed"
            top="20px"
            right="20px"
            zIndex={2000}
            bg="var(--color-surface)"
            color="var(--color-text-primary)"
            border="1px solid var(--color-border-default)"
            borderRadius="var(--radius-lg)"
            boxShadow="var(--shadow-md)"
            px="3"
            py="2"
          >
            Copied schema JSON
          </Box>
        </Portal>
      ) : null}
    </Stack>
  );
}
