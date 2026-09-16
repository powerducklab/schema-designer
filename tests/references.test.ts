import { expect, it } from "vitest";
import {
  dereferenceLocalSchema,
  resolveLocalReference,
} from "../src/core/references";
import { flattenSchema, setIn } from "../src/core/tree";

it("resolves escaped, empty, and array pointer segments", () => {
  expect(
    resolveLocalReference("#/$defs/a~1b/", { $defs: { "a/b": { "": false } } }),
  ).toBe(false);
  expect(
    resolveLocalReference("#/prefixItems/0", { prefixItems: [false] }),
  ).toBe(false);
  expect(
    resolveLocalReference("#/properties/a%20b", {
      properties: { "a b": true },
    }),
  ).toBe(true);
});
it("does not interpret example data as schemas", () => {
  const schema = {
    type: "object",
    examples: [{ $ref: "https://example.test/data" }],
    properties: { value: { $ref: "#/$defs/Value" } },
  };
  expect(dereferenceLocalSchema(schema, { $defs: { Value: false } })).toEqual({
    ...schema,
    properties: { value: false },
  });
});
it("rejects external and recursive generation references without fetching", () => {
  expect(() =>
    dereferenceLocalSchema({ $ref: "https://example.test/schema" }),
  ).toThrow("Unresolved local reference");
  expect(() => dereferenceLocalSchema({ $ref: "#" })).toThrow(
    "Recursive reference",
  );
});
it("preserves prototype-named property data during edits", () => {
  const schema = JSON.parse(
    '{"properties":{"__proto__":{"type":"string"},"constructor":false}}',
  );
  const next = setIn(
    schema,
    ["properties", "__proto__", "title"],
    "Own property",
  );
  expect(next.properties.__proto__.title).toBe("Own property");
  expect(({} as any).title).toBeUndefined();
  const nodes = flattenSchema({
    root: next,
    expanded: new Set(),
    maxRows: 10,
  }).nodes;
  expect(nodes.map((node) => node.key)).toEqual(["__proto__", "constructor"]);
});

import { resolveParameterValue } from "../src/react/parametersTable/libs/parameterValue";
it("resolves parameter schema and example references against their document", () => {
  const document = {
    components: {
      schemas: { Limit: { type: "integer", examples: [0] } },
      examples: { Empty: { value: "" } },
    },
  };
  expect(
    resolveParameterValue(
      {
        name: "limit",
        in: "query",
        schema: { $ref: "#/components/schemas/Limit" },
      },
      document,
    ).value,
  ).toBe(0);
  expect(
    resolveParameterValue(
      {
        name: "limit",
        in: "query",
        examples: { sample: { $ref: "#/components/examples/Empty" } },
      },
      document,
    ).value,
  ).toBe("");
});

it("renders references to boolean schemas without coercion", () => {
  const root = {
    $defs: { Never: false },
    properties: { blocked: { $ref: "#/$defs/Never" } },
  };
  const result = flattenSchema({ root, expanded: new Set(), maxRows: 10 });
  expect(result.nodes[0].resolvedValue).toBe(false);
  expect(result.nodes[0].schema.$ref).toBe("#/$defs/Never");
});
