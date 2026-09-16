import type { SchemaValue } from "../../../core/types";
export type JSONSchemaType =
  "string" | "number" | "integer" | "boolean" | "object" | "array" | "null";

export const SCHEMA_TYPES: JSONSchemaType[] = [
  "string",
  "number",
  "integer",
  "boolean",
  "object",
  "array",
  "null",
];

/**
 * Loose JSON Schema shape. Unknown keywords are preserved untouched,
 * the editor never strips fields it does not understand.
 */
export interface JSONSchema {
  $ref?: string;
  $id?: string;
  $schema?: string;
  $defs?: Record<string, JSONSchema | boolean>;
  definitions?: Record<string, JSONSchema | boolean>;
  components?: { schemas?: Record<string, JSONSchema | boolean> };

  type?: JSONSchemaType | JSONSchemaType[];
  title?: string;
  description?: string;
  default?: unknown;
  examples?: unknown[];
  enum?: unknown[];
  const?: unknown;
  format?: string;

  properties?: Record<string, JSONSchema | boolean>;
  patternProperties?: Record<string, JSONSchema | boolean>;
  additionalProperties?: boolean | JSONSchema;
  required?: string[];
  items?: JSONSchema | boolean;
  prefixItems?: (JSONSchema | boolean)[];

  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  allOf?: (JSONSchema | boolean)[];
  anyOf?: (JSONSchema | boolean)[];
  oneOf?: (JSONSchema | boolean)[];
  not?: JSONSchema | boolean;

  deprecated?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;

  [keyword: string]: unknown;
}

/** Where a row lives relative to its parent container. */
export type NodeKind = "property" | "items" | "root";

/** Visual role of a row inside a resolved $ref block. */
export type RefSegment = "none" | "head" | "body" | "tail" | "single";

/** One rendered line of the flattened tree. */
export interface FlatNode {
  /** Stable identity, built from the schema path. */
  id: string;
  /** Property key, or a synthetic label for array items. */
  key: string;
  /** Path from the root schema down to this node's own schema object. */
  path: string[];
  /** Path to the parent container that owns `key`. */
  parentPath: string[];
  depth: number;
  kind: NodeKind;

  /** The raw schema at `path`, possibly just a `$ref` stub. */
  schema: JSONSchema;
  value: SchemaValue;
  /** The dereferenced schema used for rendering, identical to `schema` when no ref. */
  resolved: JSONSchema;
  resolvedValue: SchemaValue;

  required: boolean;
  expandable: boolean;
  expanded: boolean;

  /** Name of the referenced definition, when this node is a `$ref`. */
  refName?: string;
  /** True when the ref points at an ancestor and expansion was stopped. */
  recursive: boolean;
  /** Position inside the resolved ref block, drives the block border styling. */
  refSegment: RefSegment;
  /** Rows inside a ref subtree are read-only to protect shared components. */
  readOnly: boolean;
  /** Sortable only among siblings of the same `properties` object. */
  sortable: boolean;
}

/** Insert position requested from the row menu. */
export type AddFieldMode = "sibling" | "child";

/* -------------------------------------------------------------------------- */
/* Error channel                                                              */
/* -------------------------------------------------------------------------- */

export type SchemaEditorErrorScope =
  "clone" | "resolveRef" | "flatten" | "reorder" | "commit" | "render";

export interface SchemaEditorError {
  scope: SchemaEditorErrorScope;
  message: string;
  /** Original thrown value, kept as-is for logging. */
  cause?: unknown;
  /** Schema path where it happened, when known. */
  path?: string[];
}

export type SchemaErrorHandler = (error: SchemaEditorError) => void;

/* -------------------------------------------------------------------------- */
/* Component props                                                            */
/* -------------------------------------------------------------------------- */

export interface AdvancedEditorContext {
  required?: boolean;
  onRequiredChange?: (required: boolean) => void;
  nested: boolean;
  schema: SchemaValue;
  schemaName: string;
  fullSchema: JSONSchema;
  path: string[];
  readOnly: boolean;
  update: (next: SchemaValue) => void;
}

export interface SchemaTreeEditorProps {
  /** Controlled schema. Must be treated as immutable by the host. */
  schema: JSONSchema;
  onChange: (next: JSONSchema) => void;

  /** Optional list columns. Hidden attributes remain editable in settings. */
  showType?: boolean;
  showRequired?: boolean;
  showDescription?: boolean;
  document?: JSONSchema;
  className?: string;
  /** Disables every mutating affordance. */
  readOnly?: boolean;
  /** Keys expanded on first mount. Uncontrolled afterwards. */
  defaultExpanded?: string[];
  /** Max rows rendered before the overflow notice appears. */
  maxRows?: number;

  /** Renders the advanced settings popover body for a row. */
  renderAdvanced?: (context: AdvancedEditorContext) => React.ReactNode;

  /** Called on any recovered internal failure. The component stays alive. */
  onError?: SchemaErrorHandler;
  /** Verify incoming schema identity and shape on every prop change. Default true. */
  strictExternalSchema?: boolean;
}
export type SchemaDesignerTreeProps = Omit<
  SchemaTreeEditorProps,
  "schema" | "onChange"
> & {
  schema?: SchemaValue;
  value?: SchemaValue;
  onChange: (schema: SchemaValue) => void;
};
