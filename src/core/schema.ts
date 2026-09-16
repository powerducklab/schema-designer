import type { SchemaValue } from "./types";
import { cloneSchema as cloneValue } from "./tree";
import type {
  CompositionKey,
  InlineSchemaType,
  OpenApiSchema,
  SchemaFormatOptions,
  SchemaRecord,
} from "../react/inlineSchemaEditor/types";

export function isRecord(value: unknown): value is SchemaRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSchema(value: unknown): value is OpenApiSchema {
  return isRecord(value);
}

export function toSchemaRecord(
  schema: SchemaValue | undefined | unknown,
): SchemaRecord {
  if (!isRecord(schema)) return {};
  return { ...schema };
}

export const cloneSchema = cloneValue;

export function asOpenApiSchema(value: SchemaRecord): OpenApiSchema {
  return value as OpenApiSchema;
}

export function compactSchema(value: SchemaRecord): OpenApiSchema {
  const result: SchemaRecord = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined)
      Object.defineProperty(result, key, {
        value: item,
        enumerable: true,
        configurable: true,
        writable: true,
      });
  }
  return result as OpenApiSchema;
}

export function mergeSchema(
  schema: SchemaValue | undefined,
  patch: Partial<OpenApiSchema>,
): OpenApiSchema {
  return compactSchema({ ...toSchemaRecord(schema), ...toSchemaRecord(patch) });
}

const INLINE_SCHEMA_TYPES = new Set<InlineSchemaType>([
  "string",
  "number",
  "integer",
  "boolean",
  "array",
  "object",
  "null",
  "any",
]);

export function normalizeSchemaType(value: unknown): InlineSchemaType {
  if (
    typeof value === "string" &&
    INLINE_SCHEMA_TYPES.has(value as InlineSchemaType)
  ) {
    return value as InlineSchemaType;
  }
  return "any";
}

export function getSchemaType(
  schema: SchemaValue | undefined,
): InlineSchemaType {
  const record = toSchemaRecord(schema);
  const type = record.type;
  if (Array.isArray(type))
    return type.length === 1 ? normalizeSchemaType(type[0]) : "any";
  if (typeof type === "string") return normalizeSchemaType(type);
  if (
    "properties" in record ||
    "additionalProperties" in record ||
    "patternProperties" in record ||
    "required" in record
  )
    return "object";
  if ("items" in record || "prefixItems" in record || "contains" in record)
    return "array";
  if (typeof record.const === "boolean") return "boolean";
  if (typeof record.const === "number")
    return Number.isInteger(record.const) ? "integer" : "number";
  if (record.const === null) return "null";
  if (Array.isArray(record.enum) && record.enum.length > 0) {
    const first = record.enum[0];
    if (typeof first === "boolean") return "boolean";
    if (typeof first === "number")
      return Number.isInteger(first) ? "integer" : "number";
    if (first === null) return "null";
    if (Array.isArray(first)) return "array";
    if (isRecord(first)) return "object";
    if (typeof first === "string") return "string";
  }
  return "any";
}

const TYPE_FIELDS = [
  "format",
  "minLength",
  "maxLength",
  "pattern",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
  "uniqueItems",
  "contains",
  "minContains",
  "maxContains",
  "unevaluatedItems",
  "properties",
  "required",
  "additionalProperties",
  "minProperties",
  "maxProperties",
  "patternProperties",
  "propertyNames",
  "dependentRequired",
  "dependentSchemas",
  "unevaluatedProperties",
  "contentEncoding",
  "contentMediaType",
  "discriminator",
];

export function createSchemaForType(
  type: InlineSchemaType,
  previous?: OpenApiSchema,
): OpenApiSchema {
  if (previous && getSchemaType(previous) === type) return previous;
  const base = cloneSchema(previous ?? ({} as OpenApiSchema));
  for (const key of TYPE_FIELDS) delete (base as Record<string, unknown>)[key];
  if (type === "any") {
    delete (base as Record<string, unknown>).type;
    return compactSchema(base as SchemaRecord);
  }
  (base as Record<string, unknown>).type = type;
  if (type === "object") {
    (base as Record<string, unknown>).properties = {};
    (base as Record<string, unknown>).required = undefined;
  }
  if (type === "array") {
    (base as Record<string, unknown>).items = {
      type: "string",
    } as OpenApiSchema;
  }
  if (type === "boolean") {
    delete (base as Record<string, unknown>).format;
  }
  if (type === "null") {
    delete (base as Record<string, unknown>).default;
    delete (base as Record<string, unknown>).example;
    delete (base as Record<string, unknown>).examples;
    delete (base as Record<string, unknown>).enum;
    delete (base as Record<string, unknown>).const;
  }
  return compactSchema(base as SchemaRecord);
}

export function normalizeFormatOptions(
  options?: SchemaFormatOptions,
): string[] {
  return Array.from(new Set((options ?? []).filter(Boolean)));
}

export function parseOptionalNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

export function toInputValue(value: unknown): string {
  return value === undefined || value === null ? "" : String(value);
}

export function stringifySchemaValue(value: unknown): string {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  if (value === null) return "null";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

export function canParseSchemaValue(
  value: string,
  type: InlineSchemaType,
): boolean {
  if (!value.trim()) return true;
  if (type === "null") return value.trim() === "null";
  if (type === "array") {
    try {
      return Array.isArray(JSON.parse(value));
    } catch {
      return false;
    }
  }
  if (type === "object") {
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed);
    } catch {
      return false;
    }
  }
  if (type === "any") {
    try {
      JSON.parse(value);
      return true;
    } catch {
      return true;
    }
  }
  if (type === "number") return Number.isFinite(Number(value));
  if (type === "integer") return Number.isInteger(Number(value));
  if (type === "boolean") return value === "true" || value === "false";
  return true;
}

export function parseSchemaValue(
  value: string,
  type: InlineSchemaType,
): unknown {
  if (type === "string") return value;
  if (value.trim() === "") return undefined;
  if (type === "number")
    return Number.isFinite(Number(value)) ? Number(value) : undefined;
  if (type === "integer") {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : undefined;
  }
  if (type === "boolean") {
    if (value === "true") return true;
    if (value === "false") return false;
    return undefined;
  }
  if (type === "null") return value.trim() === "null" ? null : undefined;
  if (type === "array") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  if (type === "object") {
    try {
      const parsed = JSON.parse(value);
      return isRecord(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  if (type === "any") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

export function getEnumValues(schema: SchemaValue | undefined): unknown[] {
  const value = toSchemaRecord(schema).enum;
  return Array.isArray(value) ? [...value] : [];
}

export function getProperties(
  schema: SchemaValue | undefined,
): Record<string, SchemaValue> {
  const properties = toSchemaRecord(schema).properties;
  if (!isRecord(properties)) return {};
  const result: Record<string, SchemaValue> = {};
  Object.entries(properties).forEach(([key, value]) => {
    Object.defineProperty(result, key, {
      value: typeof value === "boolean" || isRecord(value) ? value : {},
      enumerable: true,
      configurable: true,
      writable: true,
    });
  });
  return result;
}

export function getRequiredProperties(
  schema: SchemaValue | undefined,
): Set<string> {
  const required = toSchemaRecord(schema).required;
  return new Set(
    Array.isArray(required)
      ? required.filter((item): item is string => typeof item === "string")
      : [],
  );
}

export function updateProperty(
  schema: OpenApiSchema,
  name: string,
  propertySchema: SchemaValue,
): OpenApiSchema {
  const nextProperties = getProperties(schema);
  Object.defineProperty(nextProperties, name, {
    value: propertySchema,
    enumerable: true,
    writable: true,
    configurable: true,
  });
  return compactSchema({
    ...toSchemaRecord(schema),
    type: "object",
    properties: nextProperties,
  });
}

export function removeProperty(
  schema: OpenApiSchema,
  name: string,
): OpenApiSchema {
  const nextProperties = getProperties(schema);
  delete nextProperties[name];
  const required = Array.from(getRequiredProperties(schema)).filter(
    (item) => item !== name,
  );
  return compactSchema({
    ...toSchemaRecord(schema),
    properties: nextProperties,
    required: required.length ? required : undefined,
  });
}

export function renameProperty(
  schema: OpenApiSchema,
  oldName: string,
  newName: string,
): OpenApiSchema {
  if (oldName === newName) return schema;
  const nextProperties = getProperties(schema);
  if (
    !Object.hasOwn(nextProperties, oldName) ||
    Object.hasOwn(nextProperties, newName)
  )
    return schema;
  const renamedProperties = Object.fromEntries(
    Object.entries(nextProperties).map(([key, value]) => [
      key === oldName ? newName : key,
      value,
    ]),
  );
  const required = Array.from(getRequiredProperties(schema)).map((item) =>
    item === oldName ? newName : item,
  );
  return compactSchema({
    ...toSchemaRecord(schema),
    properties: renamedProperties,
    required: required.length ? required : undefined,
  });
}

export function setPropertyRequired(
  schema: OpenApiSchema,
  name: string,
  required: boolean,
): OpenApiSchema {
  const next = getRequiredProperties(schema);
  if (required) next.add(name);
  else next.delete(name);
  return compactSchema({
    ...toSchemaRecord(schema),
    required: next.size ? Array.from(next) : undefined,
  });
}

export function getArrayItems(
  schema: SchemaValue | undefined,
): SchemaValue | undefined {
  const items = toSchemaRecord(schema).items;
  return typeof items === "boolean" || isRecord(items) ? items : undefined;
}

export function getPrefixItems(schema: SchemaValue | undefined): SchemaValue[] {
  const value = toSchemaRecord(schema).prefixItems;
  return Array.isArray(value)
    ? value.filter(
        (item): item is SchemaValue =>
          typeof item === "boolean" || isRecord(item),
      )
    : [];
}

export function getComposition(
  schema: SchemaValue | undefined,
  key: CompositionKey,
): SchemaValue[] {
  const value = toSchemaRecord(schema)[key];
  return Array.isArray(value)
    ? value.filter(
        (item): item is SchemaValue =>
          typeof item === "boolean" || isRecord(item),
      )
    : [];
}

export function setComposition(
  schema: OpenApiSchema,
  key: CompositionKey,
  values: SchemaValue[],
): OpenApiSchema {
  return compactSchema({
    ...toSchemaRecord(schema),
    [key]: values.length ? values : undefined,
  });
}

export function getReferenceOptions(schema: SchemaValue | undefined): string[] {
  const record = toSchemaRecord(schema);
  const refs: string[] = [];
  const components = toSchemaRecord(record.components);
  const schemas = toSchemaRecord(components.schemas);
  Object.keys(schemas).forEach((key) =>
    refs.push(
      `#/components/schemas/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`,
    ),
  );
  const defs = toSchemaRecord((record as Record<string, unknown>).$defs);
  Object.keys(defs).forEach((key) =>
    refs.push(`#/$defs/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`),
  );
  const legacyDefs = toSchemaRecord(record.definitions);
  Object.keys(legacyDefs).forEach((key) =>
    refs.push(`#/definitions/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`),
  );
  return refs;
}

export function getSchemaSummary(schema: SchemaValue | undefined): string {
  if (typeof schema === "boolean")
    return schema ? "Any value" : "No values allowed";
  const record = toSchemaRecord(schema);
  if (typeof record.$ref === "string" && record.$ref)
    return `Reference: ${record.$ref}`;
  const type = getSchemaType(schema);
  if (type === "object") {
    const count = Object.keys(getProperties(schema)).length;
    return `${type} · ${count} propert${count === 1 ? "y" : "ies"}`;
  }
  if (type === "array") {
    return Object.hasOwn(record, "items") ? "array · typed items" : "array";
  }
  if (Array.isArray(record.enum) && record.enum.length)
    return `${type} · enum (${record.enum.length})`;
  if (typeof record.description === "string" && record.description.trim())
    return `${type} · ${record.description.trim()}`;
  return type;
}

export type DiffLine = { kind: "same" | "added" | "removed"; value: string };

export function diffSchemaLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  if (before === after) return a.map((value) => ({ kind: "same", value }));
  // Bound memory for large previews instead of allocating a quadratic matrix.
  if (a.length * b.length > 250_000) {
    let prefix = 0;
    while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix])
      prefix++;
    let suffix = 0;
    while (
      suffix < a.length - prefix &&
      suffix < b.length - prefix &&
      a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
    )
      suffix++;
    return [
      ...a.slice(0, prefix).map((value) => ({ kind: "same" as const, value })),
      ...a
        .slice(prefix, a.length - suffix)
        .map((value) => ({ kind: "removed" as const, value })),
      ...b
        .slice(prefix, b.length - suffix)
        .map((value) => ({ kind: "added" as const, value })),
      ...a
        .slice(a.length - suffix)
        .map((value) => ({ kind: "same" as const, value })),
    ];
  }
  const dp = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const result: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      result.push({ kind: "same", value: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ kind: "removed", value: a[i] });
      i += 1;
    } else {
      result.push({ kind: "added", value: b[j] });
      j += 1;
    }
  }
  while (i < a.length) result.push({ kind: "removed", value: a[i++] });
  while (j < b.length) result.push({ kind: "added", value: b[j++] });
  return result;
}

export function setEnumValues(
  schema: OpenApiSchema,
  values: unknown[],
): OpenApiSchema {
  return mergeSchema(schema, { enum: values.length ? values : undefined });
}
