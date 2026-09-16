import {
  SchemaTreeEditor,
  InlineSchemaEditor,
  ParametersTable,
} from "@powerduck/schema-designer";
import {
  parameterKey,
  mergeSchema,
  type SchemaValue,
} from "@powerduck/schema-designer/core";
import { SchemaTreeEditor as Tree } from "@powerduck/schema-designer/react/tree";
import { InlineSchemaEditor as Inline } from "@powerduck/schema-designer/react/inline";
import { ParameterTable } from "@powerduck/schema-designer/react/parameters";
const value: SchemaValue = { properties: { blocked: false } };
const onChange = (_value: SchemaValue) => {};
export const views = [
  <SchemaTreeEditor value={value} onChange={onChange} />,
  <Tree value={false} onChange={onChange} />,
  <InlineSchemaEditor value={value} onChange={onChange} />,
  <Inline value={false} onChange={onChange} />,
  <ParametersTable parameters={[]} mode="request" onValuesChange={() => {}} />,
  <ParameterTable parameters={[]} />,
];
export const key = parameterKey({ name: "id", in: "path" });
export const patched = mergeSchema({ title: "A" }, { title: undefined });
