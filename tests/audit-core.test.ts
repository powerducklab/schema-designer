import { describe, expect, it } from "vitest";
import { deleteIn, flattenSchema, resolveRef } from "../src/core/tree";
import {
  renameProperty,
  updateProperty,
  parseSchemaValue,
} from "../src/core/schema";
import { reorder } from "../src/react/parametersTable/libs/reorder";
import { reconcileRows } from "../src/react/parametersTable/libs/lib";

describe("audit regression coverage", () => {
  it("keeps untouched property objects and rename order", () => {
    const first = { type: "string" };
    const schema = {
      properties: { first, second: false, third: true },
      required: ["second"],
    };
    expect((updateProperty(schema, "third", {}) as any).properties.first).toBe(
      first,
    );
    const renamed = renameProperty(schema, "second", "renamed") as any;
    expect(Object.keys(renamed.properties)).toEqual([
      "first",
      "renamed",
      "third",
    ]);
    expect(renamed.required).toEqual(["renamed"]);
    expect(schema.properties.second).toBe(false);
  });
  it("resolves encoded references and rejects external reference chains", () => {
    const root = {
      $defs: {
        "a b": { type: "string" as const },
        External: { $ref: "https://example.com/schema" },
      },
    };
    expect(resolveRef("#/$defs/a%20b", root)?.schema).toBe(root.$defs["a b"]);
    expect(resolveRef("#/$defs/External", root)).toBeNull();
    expect(resolveRef("#/%ZZ", root)).toBeNull();
    expect(resolveRef("#", root)?.schema).toBe(root);
  });
  it("renders composition siblings alongside properties and ignores malformed children", () => {
    const result = flattenSchema({
      root: {
        properties: { name: { type: "string" }, broken: null },
        allOf: [false, { type: "object" }],
      } as any,
      expanded: new Set(),
      maxRows: 10,
    });
    expect(result.nodes.map((node) => node.key)).toEqual([
      "name",
      "allOf[0]",
      "allOf[1]",
    ]);
  });
  it("deletes composition entries without mutating the original array", () => {
    const schema = { allOf: [false, { type: "string" }] };
    expect(deleteIn(schema, ["allOf", "0"]).allOf).toEqual([
      { type: "string" },
    ]);
    expect(schema.allOf).toHaveLength(2);
    expect(deleteIn(schema, ["allOf", "-1"])).toBe(schema);
  });
  it("rejects invalid reorder indices and non-finite values", () => {
    const items = [1, 2];
    expect(reorder(items, 9, 0)).toBe(items);
    expect(reorder(items, 0, NaN)).toBe(items);
    expect(parseSchemaValue("Infinity", "number")).toBeUndefined();
  });
  it("does not rebuild unchanged parameter rows", () => {
    const parameter = { name: "limit", in: "query" as const };
    const rows = [{ id: "one", parameter }];
    expect(reconcileRows(rows, [parameter])).toBe(rows);
  });
});
it("preserves boolean parameter schemas through reference resolution", async () => {
  const { resolveParameterSchema, resolveParameterType } =
    await import("../src/react/parametersTable/libs/parameterValue");
  const parameter = {
    name: "x",
    in: "query" as const,
    schema: { $ref: "#/$defs/Denied" },
  };
  expect(resolveParameterSchema(parameter, { $defs: { Denied: false } })).toBe(
    false,
  );
  expect(resolveParameterType(parameter, { $defs: { Denied: false } })).toBe(
    "never",
  );
});
