/** JSON Schema accepts both schema objects and unconditional boolean schemas. */
export interface SchemaObject {
  [keyword: string]: unknown;
}
export type SchemaValue = SchemaObject | boolean;
export type SchemaPatch = Partial<SchemaObject>;
