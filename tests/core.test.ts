import { describe, expect, it } from "vitest";
import {
  cloneSchema,
  mergeSchema,
  getProperties,
  getArrayItems,
  getPrefixItems,
  getComposition,
  getReferenceOptions,
  createSchemaForType,
  renameProperty,
  parseSchemaValue,
  diffSchemaLines,
} from "../src/core/schema";
import {
  flattenSchema,
  setIn,
  getIn,
  resolveRef,
  safeRun,
  remapExpanded,
  pruneExpanded,
} from "../src/core/tree";
import {
  initializeParameterValues,
  parameterKey,
  parameterValueText,
} from "../src/core/parameters";
import { resolveParameterValue } from "../src/react/parametersTable/libs/parameterValue";
import { getDisplayValue } from "../src/react/parametersTable/libs/lib";

describe("schema preservation", () => {
  it("removes undefined patches while preserving extensions and false", () => {
    const input = Object.freeze({
      title: "Before",
      "x-private": false,
      default: 0,
    });
    expect(mergeSchema(input, { title: undefined })).toEqual({
      "x-private": false,
      default: 0,
    });
    expect(input.title).toBe("Before");
  });
  it("preserves boolean properties, items, tuples, and compositions", () => {
    expect(
      getProperties({ properties: { denied: false, allowed: true } }),
    ).toEqual({ denied: false, allowed: true });
    expect(getArrayItems({ items: false })).toBe(false);
    expect(getPrefixItems({ prefixItems: [true, false, {}] })).toEqual([
      true,
      false,
      {},
    ]);
    expect(getComposition({ allOf: [false, {}] }, "allOf")).toEqual([
      false,
      {},
    ]);
  });
  it("preserves unknown keywords on a type change and no-ops the current type", () => {
    const input = {
      type: "object",
      properties: { child: false },
      "x-custom": 1,
    };
    expect(createSchemaForType("object", input)).toBe(input);
    expect(createSchemaForType("string", input)["x-custom"]).toBe(1);
  });
  it("does not overwrite a sibling when renaming", () => {
    const input = { properties: { a: {}, b: false }, required: ["a"] };
    expect(renameProperty(input, "a", "b")).toBe(input);
    expect(renameProperty(input, "a", "c")).toEqual({
      properties: { b: false, c: {} },
      required: ["c"],
    });
  });
  it("clones cycles and retains own prototype-named data without pollution", () => {
    const input = JSON.parse(
      '{"properties":{"__proto__":{"type":"string"},"constructor":false}}',
    );
    const cloned = cloneSchema(input);
    expect(JSON.stringify(cloned)).toBe(JSON.stringify(input));
    const cycle: any = {};
    cycle.self = cycle;
    const copy = cloneSchema(cycle);
    expect(copy.self).toBe(copy);
    expect(({} as any).polluted).toBeUndefined();
  });
  it("patches one branch with structural sharing", () => {
    const input = { properties: { a: { title: "A" }, b: { title: "B" } } };
    const result = setIn(input, ["properties", "a", "title"], "New");
    expect(result.properties.b).toBe(input.properties.b);
    expect(input.properties.a.title).toBe("A");
    expect(setIn(input, ["properties", "a", "title"], "A")).toBe(input);
  });
  it("does not traverse inherited object members", () => {
    expect(getIn({}, ["toString"])).toBeUndefined();
    setIn({}, ["__proto__", "polluted"], true);
    expect(({} as any).polluted).toBeUndefined();
  });
  it("preserves an explicitly empty string", () =>
    expect(parseSchemaValue("", "string")).toBe(""));
});

describe("reference and traversal boundaries", () => {
  const root = {
    type: "object" as const,
    $defs: { Shared: { properties: { id: { type: "string" as const } } } },
    properties: {
      a: { $ref: "#/$defs/Shared" },
      b: { $ref: "#/$defs/Shared" },
    },
  };
  it("gives each reference occurrence a distinct identity", () => {
    const result = flattenSchema({
      root,
      expanded: new Set(["properties/a", "properties/b"]),
      maxRows: 100,
    });
    expect(result.nodes.map((node) => node.id)).toEqual([
      "properties/a",
      "properties/a/properties/id",
      "properties/b",
      "properties/b/properties/id",
    ]);
    expect(
      result.nodes
        .filter((node) => node.depth === 1)
        .every((node) => node.readOnly),
    ).toBe(true);
  });
  it("escapes reference options and display paths", () => {
    expect(getReferenceOptions({ $defs: { "a/b~c": {} } })).toEqual([
      "#/$defs/a~1b~0c",
    ]);
    expect(
      resolveRef("#/$defs/a~1b~0c", { $defs: { "a/b~c": { title: "Found" } } })
        ?.schema,
    ).toEqual({ title: "Found" });
    const input = new Set(["properties/a~1b/properties/child"]);
    expect(
      [...remapExpanded(input, ["properties", "a/b"], ["properties", "c"])][0],
    ).toBe("properties/c/properties/child");
    expect(pruneExpanded(input, ["properties", "a/b"]).size).toBe(0);
  });
  it("renders array roots and boolean item schemas", () => {
    const result = flattenSchema({
      root: { type: "array", items: false },
      expanded: new Set(["$root"]),
      maxRows: 10,
    });
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[1].value).toBe(false);
  });
  it("does not confuse a property called items with array items", () => {
    expect(
      flattenSchema({
        root: { properties: { items: {} } },
        expanded: new Set(),
        maxRows: 10,
      }).nodes[0].kind,
    ).toBe("property");
  });
  it("traverses tuple and composition branches", () => {
    const result = flattenSchema({
      root: { type: "array", prefixItems: [false, {}], allOf: [{}] },
      expanded: new Set(["$root"]),
      maxRows: 10,
    });
    expect(result.nodes.map((node) => node.key)).toEqual([
      "",
      "prefixItems[0]",
      "prefixItems[1]",
      "allOf[0]",
    ]);
  });
  it("bounds the number of rows", () => {
    const properties = Object.fromEntries(
      Array.from({ length: 10000 }, (_, i) => [String(i), {}]),
    );
    const result = flattenSchema({
      root: { properties },
      expanded: new Set(),
      maxRows: 20,
    });
    expect(result.nodes).toHaveLength(20);
    expect(result.overflow).toBe(true);
  });
  it("terminates cyclic references and protects error recovery", () => {
    expect(
      resolveRef("#/$defs/A", { $defs: { A: { $ref: "#/$defs/A" } } }),
    ).toBeNull();
    expect(
      safeRun(
        "flatten",
        () => {
          throw Error("bad");
        },
        1,
        () => {
          throw Error("observer");
        },
      ),
    ).toBe(1);
  });
  it("bounds diff memory while retaining exact before and after text", () => {
    const before = Array.from({ length: 2000 }, (_, i) => `old ${i}`).join(
      "\n",
    );
    const after = before.replace("old 900", "new 900");
    const diff = diffSchemaLines(before, after);
    expect(
      diff
        .filter((line) => line.kind !== "added")
        .map((line) => line.value)
        .join("\n"),
    ).toBe(before);
    expect(
      diff
        .filter((line) => line.kind !== "removed")
        .map((line) => line.value)
        .join("\n"),
    ).toBe(after);
  });
});

describe("request values", () => {
  it.each([false, 0, null, "", { a: 1 }, [1, 2]])(
    "preserves the user value %j ahead of examples",
    (value) => {
      const parameter = {
        name: "input",
        in: "query" as const,
        example: "example",
      };
      expect(
        getDisplayValue({ id: "row", parameter, generatedValue: value }).value,
      ).toEqual(value);
      expect(parameterValueText(value)).toBe(
        typeof value === "string" ? value : JSON.stringify(value),
      );
    },
  );
  it("initializes from schema examples before defaults", () => {
    const parameter = {
      name: "input",
      in: "query" as const,
      schema: { examples: [false], default: true },
    };
    expect(resolveParameterValue(parameter).value).toBe(false);
    expect(
      initializeParameterValues([parameter])[parameterKey(parameter)].value,
    ).toBe(false);
  });
  it("separates the identity of parameter locations", () => {
    expect(parameterKey({ name: "id", in: "header" })).not.toBe(
      parameterKey({ name: "id", in: "query" }),
    );
  });
});
