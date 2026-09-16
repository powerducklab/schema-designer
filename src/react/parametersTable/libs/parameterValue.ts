import { resolveLocalReference } from "../../../core/references";
import type {
  OpenApiExampleObject,
  OpenApiParameter,
  OpenApiReference,
  OpenApiSchema,
  OpenApiMediaType,
  ResolvedParameterValue,
} from "./types";

export function isReference(value: unknown): value is OpenApiReference {
  return (
    typeof value === "object" &&
    value !== null &&
    "$ref" in value &&
    typeof (value as { $ref?: unknown }).$ref === "string"
  );
}

function resolveObject(
  value: unknown,
  document?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const seen = new Set<string>();
  let result = value;
  while (isReference(result)) {
    if (!document || seen.has(result.$ref) || seen.size >= 64) return undefined;
    seen.add(result.$ref);
    const target = resolveLocalReference(result.$ref, document);
    if (!target || typeof target !== "object" || Array.isArray(target))
      return undefined;
    const { $ref, ...siblings } = result as Record<string, unknown>;
    result = { ...target, ...siblings };
  }
  return result && typeof result === "object" && !Array.isArray(result)
    ? (result as Record<string, unknown>)
    : undefined;
}

function resolveSchema(
  value: unknown,
  document?: Record<string, unknown>,
): OpenApiSchema | boolean | undefined {
  if (typeof value === "boolean") return value;
  if (isReference(value) && document) {
    const seen = new Set<string>();
    let current: unknown = value;
    while (isReference(current)) {
      if (seen.has(current.$ref) || seen.size >= 64) return undefined;
      seen.add(current.$ref);
      const target = resolveLocalReference(current.$ref, document);
      if (typeof target === "boolean") {
        if (!target) return false;
        const { $ref, ...siblings } = current as Record<string, unknown>;
        return Object.keys(siblings).length ? siblings : true;
      }
      if (!target || typeof target !== "object" || Array.isArray(target))
        return undefined;
      const { $ref, ...siblings } = current as Record<string, unknown>;
      current = { ...target, ...siblings };
    }
    return current as OpenApiSchema;
  }
  return resolveObject(value, document);
}

function resolveExamplesMap(
  examples: Record<string, OpenApiExampleObject | OpenApiReference> | undefined,
  document?: Record<string, unknown>,
): ResolvedParameterValue | undefined {
  if (!examples) {
    return undefined;
  }

  const entries = Object.entries(examples);

  for (const [name, rawExample] of entries) {
    const example = resolveObject(rawExample, document) as
      OpenApiExampleObject | undefined;
    if (!example) continue;

    if (Object.prototype.hasOwnProperty.call(example, "value")) {
      return {
        value: example.value,
        source: "examples",
        exampleName: name,
      };
    }

    if (Object.prototype.hasOwnProperty.call(example, "dataValue")) {
      return {
        value: example.dataValue,
        source: "examples",
        exampleName: name,
      };
    }

    if (example.serializedValue !== undefined) {
      return {
        value: example.serializedValue,
        source: "examples",
        exampleName: name,
      };
    }

    if (example.externalValue) {
      return {
        value: undefined,
        source: "external-example",
        exampleName: name,
        externalValue: example.externalValue,
      };
    }
  }

  return undefined;
}

function resolveContent(
  parameter: OpenApiParameter,
  document?: Record<string, unknown>,
): {
  schema?: OpenApiSchema | boolean;
  value?: ResolvedParameterValue;
} {
  if (!parameter.content) {
    return {};
  }

  const entries = Object.entries(parameter.content);

  if (entries.length === 0) {
    return {};
  }

  const mediaType = resolveObject(entries[0][1], document) as
    OpenApiMediaType | undefined;

  if (!mediaType) {
    return {};
  }

  const schema = resolveSchema(mediaType.schema, document);

  if (mediaType.example !== undefined) {
    return {
      schema,
      value: {
        value: mediaType.example,
        source: "example",
      },
    };
  }

  const examplesValue = resolveExamplesMap(mediaType.examples, document);

  return {
    schema,
    value: examplesValue,
  };
}

export function resolveParameterSchema(
  parameter: OpenApiParameter,
  document?: Record<string, unknown>,
): OpenApiSchema | boolean | undefined {
  if (parameter.schema !== undefined)
    return resolveSchema(parameter.schema, document);

  return resolveContent(parameter, document).schema;
}

export function resolveParameterValue(
  parameter: OpenApiParameter,
  document?: Record<string, unknown>,
): ResolvedParameterValue {
  /*
   * OAS defines example and examples as mutually exclusive.
   * If both are present in malformed input, example wins because it
   * represents the direct parameter-level example.
   */

  if (parameter.example !== undefined) {
    return {
      value: parameter.example,
      source: "example",
    };
  }

  const examplesValue = resolveExamplesMap(parameter.examples, document);

  if (examplesValue) {
    return examplesValue;
  }

  const content = resolveContent(parameter, document);

  if (content.value) {
    return content.value;
  }

  const schema = resolveParameterSchema(parameter, document);

  if (schema && typeof schema === "object") {
    if (schema.example !== undefined) {
      return {
        value: schema.example,
        source: "schema-example",
      };
    }

    if (Array.isArray(schema.examples) && schema.examples.length) {
      return { value: schema.examples[0], source: "schema-example" };
    }

    if (schema.default !== undefined) {
      return {
        value: schema.default,
        source: "schema-default",
      };
    }
  }

  return {
    value: undefined,
    source: "missing",
  };
}

export function resolveParameterType(
  parameter: OpenApiParameter,
  document?: Record<string, unknown>,
): string {
  const schema = resolveParameterSchema(parameter, document);

  if (typeof schema === "boolean") return schema ? "any" : "never";
  if (!schema) {
    return "unknown";
  }

  if (Array.isArray(schema.type)) {
    return schema.type.join(" | ");
  }

  if (schema.type) {
    if (schema.format) {
      return `${schema.type} (${schema.format})`;
    }

    return schema.type;
  }

  if (schema.oneOf) {
    return "oneOf";
  }

  if (schema.anyOf) {
    return "anyOf";
  }

  if (schema.allOf) {
    return "allOf";
  }

  if (schema.$ref) {
    return "reference";
  }

  return "unknown";
}
