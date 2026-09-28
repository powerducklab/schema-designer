import { createContext, useContext, type ReactNode } from "react";

/**
 * User-visible labels for the inline JSON Schema editor.
 *
 * JSON Schema keywords ($ref, allOf/anyOf/oneOf, minItems, ...) are technical
 * tokens and intentionally stay untranslated, matching how API tooling treats
 * JSON and YAML keywords. Everything a user reads as prose or a field caption
 * is a label below.
 *
 * Templates use {{name}} placeholders that callers replace at render time.
 */
export interface InlineSchemaEditorLabels {
  // Generic / shared
  required: string;
  description: string;
  none: string;
  remove: string;
  configure: string;
  removeItem: string;
  configureItem: string;

  // Boolean-schema (schema: true / false) state
  anyValueAllowed: string;
  noValuesAllowed: string;
  booleanSchemaNote: string;
  disallowAllValues: string;
  allowAllValues: string;
  configureConstraints: string;

  // Header
  fieldName: string;
  fieldNamePlaceholder: string;
  type: string;
  descriptionPlaceholder: string;
  selectTypePlaceholder: string;
  typeAny: string;
  typeString: string;
  typeNumber: string;
  typeInteger: string;
  typeBoolean: string;
  typeArray: string;
  typeObject: string;
  typeNull: string;

  // Reference
  referenceOptional: string;
  referenceLinked: string;
  useInlineSchema: string;
  restoreDraft: string;
  noReference: string;

  // Tabs
  tabCore: string;
  tabValidation: string;
  tabAdvanced: string;
  compositionRules: string;

  // String editor
  format: string;
  pattern: string;
  minLength: string;
  maxLength: string;

  // Number editor
  multipleOf: string;
  minimum: string;
  maximum: string;
  exclusiveMinimum: string;
  exclusiveMaximum: string;

  // Boolean editor note
  booleanConstraintsNote: string;

  // Array editor
  itemsSchema: string;
  itemsSchemaDescription: string;
  containsSchema: string;
  containsSchemaDescription: string;
  uniqueItems: string;
  tuplePrefixItems: string;
  addPrefixItem: string;
  noPrefixItems: string;
  prefixItem: string;
  prefixItemDescription: string;

  // Object editor
  properties: string;
  addProperty: string;
  noProperties: string;
  additionalProperties: string;
  allowAnyProperty: string;
  disallowExtraProperties: string;
  validateWithSchema: string;
  additionalPropertySchema: string;
  configureAdditionalPropertySchema: string;
  additionalPropertiesPanelTitle: string;

  // Property row
  property: string;
  propertyNamePlaceholder: string;
  propertyNameRequired: string;
  propertyNameExists: string;
  configureProperty: string;
  duplicateProperty: string;
  removeProperty: string;

  // Enum editor
  enum: string;
  addEnum: string;
  enumValue: string;
  removeEnumValue: string;
  noEnumValues: string;
  enumEnterValueOrRemove: string;
  enumValidInteger: string;
  enumValidNumber: string;
  enumUseTrueFalse: string;
  enumUseNull: string;
  enumValidJson: string;

  // Composition editor
  addCompositionItem: string;
  noCompositionRules: string;
  configureCompositionItem: string;
  removeCompositionItem: string;

  // Advanced editor
  advancedOptions: string;
  title: string;
  const: string;
  example: string;
  defaultValue: string;
  examples: string;
  addExample: string;
  noExamples: string;
  exampleN: string;
  removeExample: string;
  showLessCommonOptions: string;
  contentEncoding: string;
  contentMediaType: string;
  deprecated: string;
  writeOnly: string;
  hiddenFromResponses: string;
  readOnly: string;
  hiddenFromRequests: string;
  externalDocsUrl: string;
  validTrueFalse: string;
  validInteger: string;
  validNumber: string;
  validUseNull: string;
  validJson: string;

  // Value editor
  unset: string;
  true: string;
  false: string;

  // Live preview
  generatedSchema: string;
  previewRoot: string;
  copy: string;
  copied: string;
  copiedSchemaJson: string;
  previewUnavailable: string;
}

export const DEFAULT_INLINE_SCHEMA_LABELS: InlineSchemaEditorLabels = {
  required: "Required",
  description: "Description",
  none: "None",
  remove: "Remove",
  configure: "Configure",
  removeItem: "Remove {{name}}",
  configureItem: "Configure {{name}}",

  anyValueAllowed: "Any value is allowed",
  noValuesAllowed: "No values are allowed",
  booleanSchemaNote: "This is a boolean JSON Schema.",
  disallowAllValues: "Disallow all values",
  allowAllValues: "Allow all values",
  configureConstraints: "Configure constraints",

  fieldName: "Field name",
  fieldNamePlaceholder: "customerEmail",
  type: "Type",
  descriptionPlaceholder: "Helpful summary for API consumers",
  selectTypePlaceholder: "Select type",
  typeAny: "Any",
  typeString: "String",
  typeNumber: "Number",
  typeInteger: "Integer",
  typeBoolean: "Boolean",
  typeArray: "Array",
  typeObject: "Object",
  typeNull: "Null",

  referenceOptional: "Reference (optional)",
  referenceLinked: "Reference linked",
  useInlineSchema: "Use inline schema",
  restoreDraft: "Restore draft",
  noReference: "No reference",

  tabCore: "Core",
  tabValidation: "Validation",
  tabAdvanced: "Advanced",
  compositionRules: "Composition rules (allOf / anyOf / oneOf)",

  format: "Format",
  pattern: "Pattern",
  minLength: "Min length",
  maxLength: "Max length",

  multipleOf: "Multiple of",
  minimum: "Minimum",
  maximum: "Maximum",
  exclusiveMinimum: "Exclusive minimum",
  exclusiveMaximum: "Exclusive maximum",

  booleanConstraintsNote:
    "Boolean schemas do not expose type-specific constraints in this compact editor.",

  itemsSchema: "Items schema",
  itemsSchemaDescription: "Define the schema used by each array item.",
  containsSchema: "Contains schema",
  containsSchemaDescription:
    "Require at least one array item to match this schema.",
  uniqueItems: "Unique items",
  tuplePrefixItems: "Tuple prefix items",
  addPrefixItem: "Add prefix item",
  noPrefixItems: "No tuple prefix items.",
  prefixItem: "Prefix item {{index}}",
  prefixItemDescription: "Schema for the positional tuple item.",

  properties: "Properties",
  addProperty: "Add property",
  noProperties: "No properties defined.",
  additionalProperties: "Additional properties",
  allowAnyProperty: "Allow any property",
  disallowExtraProperties: "Disallow extra properties",
  validateWithSchema: "Validate with schema",
  additionalPropertySchema: "Additional property schema",
  configureAdditionalPropertySchema: "Configure additional property schema",
  additionalPropertiesPanelTitle: "Additional properties",

  property: "Property",
  propertyNamePlaceholder: "Property name",
  propertyNameRequired: "Property name is required.",
  propertyNameExists: "Property name already exists.",
  configureProperty: "Configure property",
  duplicateProperty: "Duplicate property",
  removeProperty: "Remove property",

  enum: "Enum",
  addEnum: "Add enum",
  enumValue: "Value {{index}}",
  removeEnumValue: "Remove enum value",
  noEnumValues: "No enum values.",
  enumEnterValueOrRemove: "Enter a value or remove this entry.",
  enumValidInteger: "Enter a valid integer.",
  enumValidNumber: "Enter a valid number.",
  enumUseTrueFalse: "Use true or false.",
  enumUseNull: 'Use "null".',
  enumValidJson: "Enter valid JSON.",

  addCompositionItem: "Add {{key}} item",
  noCompositionRules: "No {{key}} rules.",
  configureCompositionItem: "Configure {{key}} item {{index}}",
  removeCompositionItem: "Remove {{key}} item {{index}}",

  advancedOptions: "Advanced options",
  title: "Title",
  const: "Const",
  example: "Example",
  defaultValue: "Default",
  examples: "Examples",
  addExample: "Add example",
  noExamples: "No examples.",
  exampleN: "Example {{index}}",
  removeExample: "Remove example",
  showLessCommonOptions: "Show less common options",
  contentEncoding: "Content encoding",
  contentMediaType: "Content media type",
  deprecated: "Deprecated",
  writeOnly: "Write only",
  hiddenFromResponses: "Hidden from responses",
  readOnly: "Read only",
  hiddenFromRequests: "Hidden from requests",
  externalDocsUrl: "External docs URL",
  validTrueFalse: "Pick true or false.",
  validInteger: "Enter a valid integer.",
  validNumber: "Enter a valid number.",
  validUseNull: 'Use "null".',
  validJson: "Enter valid JSON.",

  unset: "Unset",
  true: "True",
  false: "False",

  generatedSchema: "Generated schema",
  previewRoot: "root",
  copy: "Copy",
  copied: "Copied",
  copiedSchemaJson: "Copied schema JSON",
  previewUnavailable:
    "Schema preview unavailable: input contains a cyclic or non-JSON value.",
};

const InlineSchemaLabelsContext = createContext<InlineSchemaEditorLabels>(
  DEFAULT_INLINE_SCHEMA_LABELS,
);

export function InlineSchemaLabelsProvider(props: {
  labels?: InlineSchemaEditorLabels;
  children: ReactNode;
}) {
  // Explicit labels win. With no labels prop the provider stays transparent and
  // inherits the nearest parent provider, so a label-less nested editor cannot
  // reset a localized provider mounted above it.
  const parent = useContext(InlineSchemaLabelsContext);
  const value = props.labels ?? parent;
  return (
    <InlineSchemaLabelsContext.Provider value={value}>
      {props.children}
    </InlineSchemaLabelsContext.Provider>
  );
}

export function useInlineSchemaLabels(): InlineSchemaEditorLabels {
  return useContext(InlineSchemaLabelsContext);
}

/** Replaces {{token}} placeholders with the provided values. */
export function fillLabel(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
}
