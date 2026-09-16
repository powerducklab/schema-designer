import { faker, Faker, en } from "@faker-js/faker";
let generateSync: typeof import("json-schema-faker").generateSync;
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { dereferenceLocalSchema } from "../../../core/references";
import { resolveParameterSchema } from "./parameterValue";
import type { OpenApiSchema, ParameterTableGeneratorContext } from "./types";

export interface ParameterValueGeneratorOptions {
  fakerInstance?: typeof faker;
  humanize?: boolean;
  useDefault?: boolean;
  seed?: number;
  maxArrayItems?: number;
  maxDepth?: number;
  strictSchemaValidation?: boolean;
  validationRetryCount?: number;
}

const DEFAULT_OPTIONS: Required<
  Omit<ParameterValueGeneratorOptions, "fakerInstance">
> = {
  humanize: true,
  useDefault: true,
  seed: Date.now(),
  maxArrayItems: 3,
  maxDepth: 5,
  strictSchemaValidation: true,
  validationRetryCount: 5,
};

type JsonSchemaLike = {
  type?: unknown;
  enum?: unknown[];
  const?: unknown;
  format?: unknown;
  pattern?: unknown;
  faker?: string | Record<string, unknown>;
  minItems?: number;
  maxItems?: number;
  items?: unknown;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number | boolean;
  exclusiveMaximum?: number | boolean;
  multipleOf?: number;
  [key: string]: unknown;
};

type GenContext = ParameterTableGeneratorContext & { depth: number };
const ajv = new Ajv({ allErrors: true, strict: false, addUsedSchema: false });
addFormats(ajv);
const validators = new WeakMap<object, ReturnType<typeof ajv.compile>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReference(value: unknown): value is { $ref: string } {
  return (
    isRecord(value) && typeof (value as { $ref?: unknown }).$ref === "string"
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeTypes(schema: OpenApiSchema): string[] {
  const t = schema.type;
  if (typeof t === "string") return [t];
  if (Array.isArray(t))
    return t.filter((x): x is string => typeof x === "string");
  return [];
}

function getSchemaFormat(schema: OpenApiSchema): string | undefined {
  return typeof schema.format === "string" ? schema.format : undefined;
}

function getParameterName(context: ParameterTableGeneratorContext): string {
  return context.parameter.name.trim().toLowerCase();
}

function tokenizeParameterName(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-./:[\]{}]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.toLowerCase());
}

function hasToken(tokens: string[], candidates: string[]): boolean {
  return candidates.some((candidate) => tokens.includes(candidate));
}

function hasAnyToken(tokens: string[], candidates: string[]): boolean {
  return candidates.some((candidate) =>
    tokens.some((t) => t.includes(candidate)),
  );
}

function resolveEnumValue(
  schema: OpenApiSchema,
  fakerInstance: typeof faker,
  humanize: boolean,
): unknown | undefined {
  if (schema.const !== undefined) return schema.const;
  if (!Array.isArray(schema.enum) || schema.enum.length === 0) return undefined;
  return humanize
    ? fakerInstance.helpers.arrayElement(schema.enum)
    : schema.enum[0];
}

function getStringBounds(schema: OpenApiSchema): {
  min?: number;
  max?: number;
} {
  return {
    min: isFiniteNumber(schema.minLength)
      ? Math.max(0, schema.minLength)
      : undefined,
    max: isFiniteNumber(schema.maxLength)
      ? Math.max(0, schema.maxLength)
      : undefined,
  };
}

function constrainString(value: string, schema: OpenApiSchema): string {
  const { min, max } = getStringBounds(schema);
  let result = value;
  if (max !== undefined && result.length > max) result = result.slice(0, max);
  if (min !== undefined && result.length < min)
    result = result.padEnd(min, "x");
  return result;
}

function getNumberBounds(
  schema: OpenApiSchema,
  integer: boolean,
): { min: number; max: number } {
  const fallbackMin = 1;
  const fallbackMax = integer ? 100 : 100;
  let min = isFiniteNumber(schema.minimum) ? schema.minimum : fallbackMin;
  let max = isFiniteNumber(schema.maximum) ? schema.maximum : fallbackMax;

  if (typeof schema.exclusiveMinimum === "number") {
    min = integer
      ? Math.max(min, Math.floor(schema.exclusiveMinimum) + 1)
      : Math.max(min, schema.exclusiveMinimum + Number.EPSILON);
  }
  if (typeof schema.exclusiveMaximum === "number") {
    max = integer
      ? Math.min(max, Math.ceil(schema.exclusiveMaximum) - 1)
      : Math.min(max, schema.exclusiveMaximum - Number.EPSILON);
  }
  if (max < min) max = min;
  return { min, max };
}

function generateInteger(
  schema: OpenApiSchema,
  fakerInstance: typeof faker,
): number {
  const { min, max } = getNumberBounds(schema, true);
  const multipleOf =
    isFiniteNumber(schema.multipleOf) && schema.multipleOf > 0
      ? schema.multipleOf
      : undefined;
  if (multipleOf) {
    const minMultiple = Math.ceil(min / multipleOf);
    const maxMultiple = Math.floor(max / multipleOf);
    if (maxMultiple >= minMultiple) {
      return (
        fakerInstance.number.int({ min: minMultiple, max: maxMultiple }) *
        multipleOf
      );
    }
  }
  return fakerInstance.number.int({
    min: Math.ceil(min),
    max: Math.floor(max),
  });
}

function generateNumber(
  schema: OpenApiSchema,
  fakerInstance: typeof faker,
): number {
  const { min, max } = getNumberBounds(schema, false);
  const multipleOf =
    isFiniteNumber(schema.multipleOf) && schema.multipleOf > 0
      ? schema.multipleOf
      : undefined;
  if (multipleOf) {
    const minMultiple = Math.ceil(min / multipleOf);
    const maxMultiple = Math.floor(max / multipleOf);
    if (maxMultiple >= minMultiple) {
      return (
        fakerInstance.number.int({ min: minMultiple, max: maxMultiple }) *
        multipleOf
      );
    }
  }
  return fakerInstance.number.float({ min, max, fractionDigits: 2 });
}

function generateDate(
  schema: OpenApiSchema,
  fakerInstance: typeof faker,
): string {
  const date = fakerInstance.date.recent({ days: 30 });
  return getSchemaFormat(schema) === "date"
    ? date.toISOString().slice(0, 10)
    : date.toISOString();
}

function generateTime(fakerInstance: typeof faker): string {
  return fakerInstance.date.recent({ days: 1 }).toISOString().slice(11, 19);
}

function generateStringByParameterName(
  schema: OpenApiSchema,
  context: ParameterTableGeneratorContext,
  fakerInstance: typeof faker,
): string | undefined {
  const parameterName = getParameterName(context);
  const tokens = tokenizeParameterName(parameterName);
  const format = getSchemaFormat(schema);
  switch (format) {
    case "email":
      return fakerInstance.internet.email();
    case "uuid":
      return fakerInstance.string.uuid();
    case "uri":
    case "uri-reference":
      return fakerInstance.internet.url();
    case "hostname":
      return fakerInstance.internet.domainName();
    case "ipv4":
      return fakerInstance.internet.ip();
    case "ipv6":
      return fakerInstance.internet.ipv6();
    case "date":
    case "date-time":
      return generateDate(schema, fakerInstance);
    case "time":
      return generateTime(fakerInstance);
    case "password":
      return fakerInstance.internet.password({ length: 14, memorable: false });
    default:
      break;
  }
  if (hasAnyToken(tokens, ["uuid", "guid"])) return fakerInstance.string.uuid();
  if (hasToken(tokens, ["id", "identifier", "key"])) {
    return `usr_${fakerInstance.string.alphanumeric({ length: 10, casing: "lower" })}`;
  }
  if (hasAnyToken(tokens, ["firstname", "givenname"]))
    return fakerInstance.person.firstName();
  if (hasAnyToken(tokens, ["lastname", "surname", "familyname"]))
    return fakerInstance.person.lastName();
  if (hasAnyToken(tokens, ["fullname", "displayname", "username"]))
    return fakerInstance.person.fullName();
  if (hasAnyToken(tokens, ["email", "mail"]))
    return fakerInstance.internet.email();
  if (hasAnyToken(tokens, ["phone", "mobile", "telephone"]))
    return fakerInstance.phone.number();
  if (hasAnyToken(tokens, ["url", "uri", "website", "homepage", "link"]))
    return fakerInstance.internet.url();
  if (hasAnyToken(tokens, ["country", "countrycode"])) {
    return hasAnyToken(tokens, ["code"])
      ? fakerInstance.location.countryCode()
      : fakerInstance.location.country();
  }
  if (hasAnyToken(tokens, ["city"])) return fakerInstance.location.city();
  if (hasAnyToken(tokens, ["state", "province", "region"]))
    return fakerInstance.location.state();
  if (hasAnyToken(tokens, ["zip", "zipcode", "postalcode", "postcode"]))
    return fakerInstance.location.zipCode();
  if (hasAnyToken(tokens, ["street", "address"]))
    return fakerInstance.location.streetAddress();
  if (hasAnyToken(tokens, ["company", "organization", "organisation"]))
    return fakerInstance.company.name();
  if (hasAnyToken(tokens, ["job", "title", "position", "role"]))
    return fakerInstance.person.jobTitle();
  if (
    hasAnyToken(tokens, [
      "token",
      "access_token",
      "accesstoken",
      "refresh_token",
      "refreshtoken",
    ])
  ) {
    return fakerInstance.string.alphanumeric({ length: 32, casing: "mixed" });
  }
  if (hasAnyToken(tokens, ["api_key", "apikey", "secret", "secretkey"])) {
    return fakerInstance.string.alphanumeric({ length: 32, casing: "mixed" });
  }
  if (hasAnyToken(tokens, ["search", "query", "keyword", "q"])) {
    return fakerInstance.helpers.arrayElement([
      "laptop",
      "coffee",
      "openapi",
      "developer tools",
      "wireless headphones",
      "running shoes",
      "travel backpack",
    ]);
  }
  if (hasAnyToken(tokens, ["slug"])) {
    return fakerInstance.helpers
      .slugify(fakerInstance.commerce.productName())
      .toLowerCase();
  }
  if (hasAnyToken(tokens, ["product", "productname", "item"]))
    return fakerInstance.commerce.productName();
  if (hasAnyToken(tokens, ["description", "summary"]))
    return fakerInstance.commerce.productDescription();
  if (hasAnyToken(tokens, ["price", "amount", "cost", "total", "balance"])) {
    return fakerInstance.commerce.price({ min: 10, max: 500, dec: 2 });
  }
  if (
    hasAnyToken(tokens, [
      "date",
      "birthday",
      "birthdate",
      "createdat",
      "updatedat",
      "deletedat",
      "timestamp",
    ])
  ) {
    return generateDate(schema, fakerInstance);
  }
  if (hasAnyToken(tokens, ["message", "comment", "note", "text"])) {
    return fakerInstance.lorem.sentence({ min: 5, max: 12 });
  }
  return undefined;
}

function tryValidateValue(value: unknown, schema: OpenApiSchema): boolean {
  try {
    let validate = validators.get(schema);
    if (!validate) {
      validate = ajv.compile(schema as unknown as object);
      validators.set(schema, validate);
      ajv.removeSchema(schema as object);
    }
    return Boolean(validate(value));
  } catch {
    return false;
  }
}

function generateSafeFallback(
  schema: OpenApiSchema,
  genCtx: GenContext,
  fakerInstance: typeof faker,
): unknown {
  const types = normalizeTypes(schema);
  const pickedType = types.length
    ? fakerInstance.helpers.arrayElement(types)
    : undefined;
  switch (pickedType) {
    case "string":
      return fakerInstance.string.alpha({ length: 10, casing: "mixed" });
    case "integer":
      return 1;
    case "number":
      return 1.5;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object":
      return {};
    case "null":
      return null;
    default:
      return `${genCtx.parameter.name || "value"}-example`;
  }
}

function prepareSchemaForJsf(
  schema: OpenApiSchema,
  options: Required<Omit<ParameterValueGeneratorOptions, "fakerInstance">>,
): JsonSchemaLike {
  const maps = new Set([
    "properties",
    "patternProperties",
    "$defs",
    "definitions",
    "dependentSchemas",
  ]);
  const arrays = new Set(["allOf", "anyOf", "oneOf", "prefixItems"]);
  const singles = new Set([
    "items",
    "contains",
    "additionalProperties",
    "unevaluatedProperties",
    "unevaluatedItems",
    "not",
    "if",
    "then",
    "else",
    "propertyNames",
  ]);
  const visit = (value: unknown): unknown => {
    if (!isRecord(value)) return value;
    const result: Record<string, unknown> = { ...value };
    if (value.type === "array" || value.items !== undefined) {
      if (
        isFiniteNumber(value.minItems) &&
        value.minItems > options.maxArrayItems
      )
        throw new RangeError(
          "Array minimum exceeds the generation item budget.",
        );
      result.maxItems = Math.min(
        isFiniteNumber(value.maxItems) ? value.maxItems : options.maxArrayItems,
        options.maxArrayItems,
      );
    }
    if (
      value.type === "string" ||
      value.minLength !== undefined ||
      value.maxLength !== undefined
    ) {
      if (isFiniteNumber(value.minLength) && value.minLength > 16_384)
        throw new RangeError(
          "String minimum exceeds the generation length budget.",
        );
      result.maxLength = Math.min(
        isFiniteNumber(value.maxLength) ? value.maxLength : 16_384,
        16_384,
      );
    }
    for (const [key, item] of Object.entries(value)) {
      if (maps.has(key) && isRecord(item))
        result[key] = Object.fromEntries(
          Object.entries(item).map(([name, child]) => [name, visit(child)]),
        );
      else if (arrays.has(key) && Array.isArray(item))
        result[key] = item.map(visit);
      else if (singles.has(key)) result[key] = visit(item);
    }
    return result;
  };
  return visit(schema) as JsonSchemaLike;
}

function generateGenericSchemaValue(
  schema: OpenApiSchema,
  genCtx: GenContext,
  options: Required<Omit<ParameterValueGeneratorOptions, "fakerInstance">>,
  fakerInstance: typeof faker,
): unknown {
  const preparedSchema = prepareSchemaForJsf(schema, options);
  try {
    const raw = generateSync(
      preparedSchema as unknown as Record<string, unknown>,
      {
        seed: options.seed,
        maxDepth: options.maxDepth,
        maxDefaultItems: options.maxArrayItems,
        optionalsProbability: 0.35,
        alwaysFakeOptionals: false,
        fillProperties: true,
        useDefaultValue: options.useDefault,
        useExamplesValue: false,
        extensions: { faker: fakerInstance },
        failOnInvalidTypes: false,
      },
    );
    if (!options.strictSchemaValidation || tryValidateValue(raw, schema)) {
      return raw;
    }
    for (let i = 0; i <= options.validationRetryCount; i++) {
      const retryVal = generateSync(
        preparedSchema as unknown as Record<string, unknown>,
        {
          seed: options.seed + i,
          maxDepth: options.maxDepth,
          maxDefaultItems: options.maxArrayItems,
          optionalsProbability: 0.35,
          alwaysFakeOptionals: false,
          fillProperties: true,
          useDefaultValue: options.useDefault,
          useExamplesValue: false,
          extensions: { faker: fakerInstance },
          failOnInvalidTypes: false,
        },
      );
      if (tryValidateValue(retryVal, schema)) return retryVal;
    }
    return raw;
  } catch {
    return generateSafeFallback(schema, genCtx, fakerInstance);
  }
}

function generateStringWithRetry(
  schema: OpenApiSchema,
  context: ParameterTableGeneratorContext,
  fakerInstance: typeof faker,
  humanize: boolean,
  strict: boolean,
  retry: number,
): string {
  const enumVal = resolveEnumValue(schema, fakerInstance, humanize);
  if (enumVal !== undefined) {
    const candidate = constrainString(String(enumVal), schema);
    if (!strict || tryValidateValue(candidate, schema)) return candidate;
  }
  const humanVal = generateStringByParameterName(
    schema,
    context,
    fakerInstance,
  );
  if (humanVal !== undefined) {
    const candidate = constrainString(humanVal, schema);
    if (!strict || tryValidateValue(candidate, schema)) return candidate;
  }
  if (schema.pattern && typeof schema.pattern === "string") {
    try {
      const jsfVal = generateSync(schema as unknown as Record<string, unknown>);
      if (typeof jsfVal === "string") {
        if (!strict || tryValidateValue(jsfVal, schema)) return jsfVal;
      }
    } catch {
      // ignore
    }
  }
  const { min, max } = getStringBounds(schema);
  if (min !== undefined && min > 16_384)
    throw new RangeError(
      "String minimum exceeds the generation length budget.",
    );
  const length = fakerInstance.number.int({
    min: min ?? Math.min(8, max ?? 8),
    max: Math.min(max ?? Math.max(min ?? 8, 24), 16_384),
  });
  const candidate = constrainString(
    fakerInstance.string.alpha({ length, casing: "mixed" }),
    schema,
  );
  if (!strict || tryValidateValue(candidate, schema)) return candidate;
  if (retry <= 0) return candidate;
  return generateStringWithRetry(
    schema,
    context,
    fakerInstance,
    humanize,
    strict,
    retry - 1,
  );
}

function generateArrayValue(
  schema: OpenApiSchema,
  genCtx: GenContext,
  options: Required<Omit<ParameterValueGeneratorOptions, "fakerInstance">>,
  fakerInstance: typeof faker,
): unknown[] {
  if (genCtx.depth >= options.maxDepth) return [];
  const minItems = isFiniteNumber(schema.minItems)
    ? Math.max(0, schema.minItems)
    : Math.min(
        1,
        isFiniteNumber(schema.maxItems) ? Math.max(0, schema.maxItems) : 1,
      );
  if (minItems > options.maxArrayItems)
    throw new RangeError("Array minimum exceeds the generation item budget.");
  const maxItems = isFiniteNumber(schema.maxItems)
    ? Math.min(options.maxArrayItems, Math.max(minItems, schema.maxItems))
    : options.maxArrayItems;
  const count = fakerInstance.number.int({ min: minItems, max: maxItems });
  if (!schema.items || isReference(schema.items)) return [];
  return Array.from({ length: count }, (_, index) =>
    generateFromSchema(
      schema.items === true ? {} : (schema.items as OpenApiSchema),
      { ...genCtx, rowIndex: genCtx.rowIndex + index, depth: genCtx.depth + 1 },
      options,
      fakerInstance,
    ),
  );
}

function generateObjectValue(
  schema: OpenApiSchema,
  genCtx: GenContext,
  options: Required<Omit<ParameterValueGeneratorOptions, "fakerInstance">>,
  fakerInstance: typeof faker,
): Record<string, unknown> {
  if (genCtx.depth >= options.maxDepth) return {};
  const generated = generateGenericSchemaValue(
    schema,
    genCtx,
    options,
    fakerInstance,
  );
  return isRecord(generated) ? generated : {};
}

/**
 * Core entry with union type support.
 * Key fix: integer/number/boolean/null strict failures never escape to object fallback.
 */
function generateFromSchema(
  schema: OpenApiSchema,
  genCtx: GenContext,
  options: Required<Omit<ParameterValueGeneratorOptions, "fakerInstance">>,
  fakerInstance: typeof faker,
): unknown {
  if (genCtx.depth >= options.maxDepth) {
    return generateSafeFallback(schema, genCtx, fakerInstance);
  }
  const enumVal = resolveEnumValue(schema, fakerInstance, options.humanize);
  if (enumVal !== undefined) {
    if (!options.strictSchemaValidation || tryValidateValue(enumVal, schema)) {
      return enumVal;
    }
  }
  const types = normalizeTypes(schema);
  const targetType = types.length
    ? fakerInstance.helpers.arrayElement(types)
    : undefined;
  switch (targetType) {
    case "string":
      return generateStringWithRetry(
        schema,
        genCtx,
        fakerInstance,
        options.humanize,
        options.strictSchemaValidation,
        options.validationRetryCount,
      );
    case "integer": {
      for (let i = 0; i <= options.validationRetryCount; i++) {
        const candidate = generateInteger(schema, fakerInstance);
        if (
          !options.strictSchemaValidation ||
          tryValidateValue(candidate, schema)
        )
          return candidate;
      }
      return generateInteger(schema, fakerInstance);
    }
    case "number": {
      for (let i = 0; i <= options.validationRetryCount; i++) {
        const candidate = generateNumber(schema, fakerInstance);
        if (
          !options.strictSchemaValidation ||
          tryValidateValue(candidate, schema)
        )
          return candidate;
      }
      return generateNumber(schema, fakerInstance);
    }
    case "boolean": {
      for (let i = 0; i <= options.validationRetryCount; i++) {
        const candidate =
          typeof enumVal === "boolean"
            ? enumVal
            : fakerInstance.datatype.boolean();
        if (
          !options.strictSchemaValidation ||
          tryValidateValue(candidate, schema)
        ) {
          return candidate;
        }
      }
      return false;
    }
    case "array":
      return generateArrayValue(schema, genCtx, options, fakerInstance);
    case "object":
      return generateObjectValue(schema, genCtx, options, fakerInstance);
    case "null": {
      const candidate = null;
      if (
        !options.strictSchemaValidation ||
        tryValidateValue(candidate, schema)
      ) {
        return candidate;
      }
      return generateSafeFallback(schema, genCtx, fakerInstance);
    }
    default:
      return generateGenericSchemaValue(schema, genCtx, options, fakerInstance);
  }
}

export async function generateParameterValue(
  context: ParameterTableGeneratorContext,
  inputOptions?: ParameterValueGeneratorOptions,
): Promise<unknown> {
  context.signal?.throwIfAborted();
  // Preserve native dynamic import for the ESM-only generator in CommonJS builds.
  generateSync ??= (await import("json-schema-faker")).generateSync;
  const options = { ...DEFAULT_OPTIONS, ...inputOptions };
  for (const [key, maximum] of [
    ["maxArrayItems", 1000],
    ["maxDepth", 32],
    ["validationRetryCount", 20],
  ] as const) {
    const value = options[key];
    if (
      !Number.isInteger(value) ||
      value < (key === "validationRetryCount" ? 0 : 1) ||
      value > maximum
    ) {
      throw new RangeError(`Invalid generator option: ${key}`);
    }
  }
  const fakerInstance = options.fakerInstance ?? new Faker({ locale: en });
  if (inputOptions?.seed !== undefined && !inputOptions?.fakerInstance) {
    fakerInstance.seed(options.seed);
  }
  context.signal?.throwIfAborted();
  let rawSchema =
    resolveParameterSchema(context.parameter, context.document) ??
    context.parameter.schema;
  if (rawSchema === undefined)
    return `${context.parameter.name || "parameter"}-value`;

  const resolvedSchema = dereferenceLocalSchema(
    rawSchema,
    context.document ?? rawSchema,
  );
  if (resolvedSchema === false)
    throw new Error("No value satisfies a false schema.");
  const derefedSchema: OpenApiSchema =
    resolvedSchema === true ? {} : resolvedSchema;

  const generationSchema = prepareSchemaForJsf(
    derefedSchema,
    options,
  ) as OpenApiSchema;
  const genCtx: GenContext = { ...context, depth: 0 };
  context.signal?.throwIfAborted();
  const value = generateFromSchema(
    generationSchema,
    genCtx,
    options,
    fakerInstance,
  );
  if (
    options.strictSchemaValidation &&
    !tryValidateValue(value, derefedSchema)
  ) {
    throw new Error(
      "Unable to generate a value satisfying this schema. Provide an example or a custom generator.",
    );
  }
  return value;
}
