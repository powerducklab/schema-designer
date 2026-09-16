import type { SchemaValue } from "../../core/types";
export type InlineSchemaType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "array"
  | "object"
  | "null"
  | "any";

export type SchemaFormatOptions = readonly string[];

export type SchemaRecord = Record<string, unknown>;

export interface OpenApiSchema extends SchemaRecord {}

export type CompositionKey = "allOf" | "anyOf" | "oneOf";

export interface InlineSchemaEditorProps {
  schema?: SchemaValue;
  value?: SchemaValue;
  onChange?: (value: SchemaValue) => void;
  schemaType?: InlineSchemaType;
  schemaName?: string;
  fullSchema?: OpenApiSchema;
  required?: boolean;
  disabled?: boolean;
  showAdvanced?: boolean;
  showComposition?: boolean;
  showLiveJson?: boolean;
  formatOptions?: SchemaFormatOptions;
  path?: string[];
  nested?: boolean;
  onTypeChange?: (type: InlineSchemaType) => void;
  onRequiredChange?: (required: boolean) => void;
  update?: (patch: Partial<OpenApiSchema>) => void;
  onExampleChange?: (value: unknown) => void;
  onDefaultChange?: (value: unknown) => void;
  onNameChange?: (name: string) => void;
}

export interface SchemaPropertyItem {
  name: string;
  schema: OpenApiSchema;
  required: boolean;
}

export interface SchemaBuilderNode {
  id: string;
  name?: string;
  schema: OpenApiSchema;
  required?: boolean;
  depth: number;
}

export interface SchemaEditorState {
  schema: OpenApiSchema;
  type: InlineSchemaType;
}
