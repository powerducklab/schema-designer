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
  /** Extend a value cell while retaining the standard table and text editor. */
  renderValueControl?: (parameter: OpenApiParameter, editor: ReactNode) => ReactNode;

  onChange?: (parameters: OpenApiParameter[]) => void;

  onSelectionChange?: (selectedIds: string[]) => void;

  onRowReorder?: (parameters: OpenApiParameter[]) => void;

  generateValue?: (context: ParameterTableGeneratorContext) => unknown;

  faker?: {
    generate: (context: ParameterTableGeneratorContext) => unknown;
  };

  emptyState?: ReactNode;

  /** Localized, user-visible table text. Omitted fields fall back to English. */
  labels?: Partial<ParameterTableLabels>;

  showRequired?: boolean;
  showType?: boolean;
  showDescription?: boolean;

  stickyHeader?: boolean;

  height?: number | string;

  className?: string;
};

/**
 * User-visible strings rendered by the table. Host applications pass localized
 * values; omitted fields use the English defaults so existing consumers keep
 * working without changes.
 */
export type ParameterTableLabels = {
  name: string;
  value: string;
  type: string;
  required: string;
  optional: string;
  description: string;
  namePlaceholder: string;
  valuePlaceholder: string;
  selectType: string;
  includeInRequest: string;
  pathParametersRequired: string;
  /** Accessible label for the static row drag handle. */
  dragToReorder: string;
  /** Accessible label for a row drag handle. Supports the {{name}} token. */
  dragRow: string;
  /** Accessible label for a name input. Supports the {{name}} token. */
  nameField: string;
  /** Accessible label for a value input. Supports the {{name}} token. */
  valueField: string;
  /** Accessible label and tooltip for a row settings button. Supports {{name}}. */
  configureRow: string;
  /** Accessible label for a column resize handle. Supports the {{label}} token. */
  resizeColumn: string;
  /** Toolbar title shown above the table. */
  parametersTitle: string;
  /** Empty-state message when no rows exist. */
  noParameters: string;
  /** Accessible label for the selection action toolbar. */
  selectedActions: string;
  /** Selection status text. Supports the {{count}} token. */
  selectedCount: string;
  /** Accessible label for the header select-all checkbox. */
  selectAll: string;
  /** Accessible label for a row checkbox. Supports the {{name}} token. */
  selectRow: string;
  /** Accessible label for a row checkbox when the parameter has no name yet. */
  selectUnnamedParameter: string;
  /** Delete-selected action button label. */
  deleteSelected: string;
  /** Generate-values action button label. */
  generateValues: string;
  /** Accessible label for a row include switch. Supports the {{name}} token. */
  includeRow: string;
  /** Accessible label for a row type selector. Supports the {{name}} token. */
  typeField: string;
  /** Error message shown when value generation fails. */
  generationFailed: string;
  /** Settings panel title fallback when the parameter has no name. */
  settingsTitle: string;
  /** Settings panel schema tab label. */
  tabSchema: string;
  /** Settings panel parameter tab label. */
  tabParameter: string;
  /** Parameter location field label. */
  location: string;
  /** Serialization group title. */
  serialization: string;
  /** Serialization style field label. */
  serializationStyle: string;
  /** Serialization style input placeholder. */
  defaultForLocation: string;
  /** Explode switch label. */
  explode: string;
  /** Allow reserved characters switch label. */
  allowReserved: string;
  /** Notice shown for parameters that use a content media type. */
  contentPreserved: string;
};

export const DEFAULT_PARAMETER_TABLE_LABELS: ParameterTableLabels = {
  name: "Name",
  value: "Value",
  type: "Type",
  required: "Required",
  optional: "Optional",
  description: "Description",
  namePlaceholder: "Name",
  valuePlaceholder: "Value",
  selectType: "Select type",
  includeInRequest: "Include in request",
  pathParametersRequired: "Path parameters are required",
  dragToReorder: "Drag to reorder",
  dragRow: "Drag {{name}}",
  nameField: "Name for {{name}}",
  valueField: "Value for {{name}}",
  configureRow: "Configure {{name}}",
  resizeColumn: "Resize {{label}} column",
  parametersTitle: "Parameters",
  noParameters: "No parameters defined.",
  selectedActions: "Selected parameter actions",
  selectedCount: "{{count}} selected",
  selectAll: "Select all parameters",
  selectRow: "Select {{name}}",
  selectUnnamedParameter: "Select parameter",
  deleteSelected: "Delete",
  generateValues: "Generate values",
  includeRow: "Include {{name}}",
  typeField: "Type for {{name}}",
  generationFailed: "Value generation failed.",
  settingsTitle: "Parameter",
  tabSchema: "Schema",
  tabParameter: "Parameter",
  location: "Location",
  serialization: "Serialization",
  serializationStyle: "Serialization style",
  defaultForLocation: "Default for location",
  explode: "Explode",
  allowReserved: "Allow reserved characters",
  contentPreserved:
    "This parameter uses content. Its media type schema is preserved.",
};

export type ParameterInput = { value: unknown; enabled: boolean };
export type ParameterValues = Readonly<Record<string, ParameterInput>>;
