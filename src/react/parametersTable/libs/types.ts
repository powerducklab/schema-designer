import type { ReactNode } from "react";

export type OpenApiReference = {
  $ref: string;
};

export interface SplitterResizeSession {
  leftId: ColumnId;
  rightId: ColumnId;

  /**
   * Pointer identity prevents another pointer from accidentally
   * modifying the active resize session.
   */
  pointerId: number;

  /**
   * Pointer position at resize start.
   */
  startClientX: number;

  /**
   * Actual DOM widths captured at pointerdown.
   */
  startLeftWidth: number;
  startRightWidth: number;

  leftMinWidth: number;
  leftMaxWidth: number;

  rightMinWidth: number;
  rightMaxWidth: number;
}

export interface ApplyAdjacentSplitterResizeOptions {
  session: SplitterResizeSession;
  clientX: number;
  widths: Record<ColumnId, number>;
}

export type OpenApiExampleObject = {
  summary?: string;
  description?: string;
  value?: unknown;
  externalValue?: string;
  serializedValue?: string;
  dataValue?: unknown;
};

export type OpenApiSchema = {
  $ref?: string;
  type?: string | string[];
  format?: string;
  title?: string;
  description?: string;
  default?: unknown;
  example?: unknown;
  examples?: unknown[];
  enum?: unknown[];
  const?: unknown;
  nullable?: boolean;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number | boolean;
  exclusiveMaximum?: number | boolean;
  multipleOf?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  minProperties?: number;
  maxProperties?: number;
  items?: OpenApiSchema | OpenApiReference | boolean;
  properties?: Record<string, OpenApiSchema | OpenApiReference | boolean>;
  required?: string[];
  oneOf?: Array<OpenApiSchema | OpenApiReference | boolean>;
  anyOf?: Array<OpenApiSchema | OpenApiReference | boolean>;
  allOf?: Array<OpenApiSchema | OpenApiReference | boolean>;
  [key: string]: unknown;
};

export type OpenApiMediaType = {
  schema?: OpenApiSchema | OpenApiReference | boolean;
  example?: unknown;
  examples?: Record<string, OpenApiExampleObject | OpenApiReference>;
};

export type OpenApiParameter = {
  name: string;
  in: "query" | "querystring" | "header" | "path" | "cookie";
  description?: string;
  required?: boolean;
  deprecated?: boolean;
  allowEmptyValue?: boolean;
  style?: string;
  explode?: boolean;
  allowReserved?: boolean;
  schema?: OpenApiSchema | OpenApiReference | boolean;
  content?: Record<string, OpenApiMediaType | OpenApiReference>;
  example?: unknown;
  examples?: Record<string, OpenApiExampleObject | OpenApiReference>;
  [key: string]: unknown;
};

export type ParameterRow = {
  id: string;
  parameter: OpenApiParameter;
  generatedValue?: unknown;
};

export type ColumnId = "name" | "value" | "required" | "type" | "description";

export type ColumnDefinition = {
  id: ColumnId;
  label: string;

  /**
   * Initial width.
   */
  defaultWidth: number;

  /**
   * Minimum allowed width.
   */
  minWidth: number;

  /**
   * Maximum allowed width.
   *
   * When minWidth === maxWidth the column is fixed.
   */
  maxWidth?: number;

  visible?: boolean;
};

export type ParameterValueSource =
  | "example"
  | "examples"
  | "schema-example"
  | "schema-default"
  | "generated"
  | "external-example"
  | "missing";

export type ResolvedParameterValue = {
  value: unknown;
  source: ParameterValueSource;
  exampleName?: string;
  externalValue?: string;
};

export type ParameterTableGeneratorContext = {
  parameter: OpenApiParameter;
  schema?: OpenApiSchema;
  rowIndex: number;
  signal?: AbortSignal;
  document?: Record<string, unknown>;
};

export type ParameterTableProps = {
  /** Keep a draft row ready for entering the next parameter. Drafts are not emitted. */
  autoAppendLocation?: OpenApiParameter["in"];
  parameters: OpenApiParameter[];
  /** Permit draft parameter names/deletion in request mode. */
  editableParameters?: boolean;
  variables?: readonly import("../../variableTextEditor/libs/variableTextEditor.types").EndpointVariable[];
  mode?: "design" | "request";
  document?: Record<string, unknown>;
  readOnly?: boolean;
  values?: ParameterValues;
  onValuesChange?: (values: ParameterValues) => void;
  onError?: (error: unknown) => void;

  onChange?: (parameters: OpenApiParameter[]) => void;

  onSelectionChange?: (selectedIds: string[]) => void;

  onRowReorder?: (parameters: OpenApiParameter[]) => void;

  generateValue?: (context: ParameterTableGeneratorContext) => unknown;

  faker?: {
    generate: (context: ParameterTableGeneratorContext) => unknown;
  };

  emptyState?: ReactNode;

  showRequired?: boolean;
  showType?: boolean;
  showDescription?: boolean;

  stickyHeader?: boolean;

  height?: number | string;

  className?: string;
};

export type ParameterInput = { value: unknown; enabled: boolean };
export type ParameterValues = Readonly<Record<string, ParameterInput>>;
