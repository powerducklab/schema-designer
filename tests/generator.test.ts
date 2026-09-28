import { expect, it } from "vitest";
import { faker } from "@faker-js/faker";
import { generateParameterValue } from "../src/react/parametersTable/libs/generateValue";

it("does not change the application's Faker seed", async () => {
  faker.seed(123);
  const expected = faker.number.int();
  faker.seed(123);
  const value = await generateParameterValue(
    {
      parameter: {
        name: "count",
        in: "query",
        schema: { type: "integer", minimum: 1, maximum: 3 },
      },
      rowIndex: 0,
    },
    { seed: 99 },
  );
  expect([1, 2, 3]).toContain(value);
  expect(faker.number.int()).toBe(expected);
});
it("rejects unsatisfiable constraints instead of returning an invalid fallback", async () => {
  await expect(
    generateParameterValue({
      parameter: {
        name: "count",
        in: "query",
        schema: { type: "integer", minimum: 3, maximum: 1 },
      },
      rowIndex: 0,
    }),
  ).rejects.toThrow();
});
it("honors cancellation before generating", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    generateParameterValue({
      parameter: { name: "id", in: "query" },
      rowIndex: 0,
      signal: controller.signal,
    }),
  ).rejects.toThrow();
});
it("resolves a local document schema for generation", async () => {
  expect(
    await generateParameterValue({
      parameter: {
        name: "count",
        in: "query",
        schema: { $ref: "#/$defs/Count" },
      },
      document: { $defs: { Count: { type: "integer", const: 7 } } },
      rowIndex: 0,
    }),
  ).toBe(7);
});
it("rejects invalid budgets before generation", async () => {
  await expect(
    generateParameterValue(
      { parameter: { name: "x", in: "query" }, rowIndex: 0 },
      { validationRetryCount: Infinity },
    ),
  ).rejects.toThrow("Invalid generator option");
});
it("supports boolean schemas and rejects false schemas", async () => {
  await expect(
    generateParameterValue({
      parameter: { name: "x", in: "query", schema: false },
      rowIndex: 0,
    }),
  ).rejects.toThrow("false schema");
  expect(
    await generateParameterValue({
      parameter: { name: "x", in: "query", schema: true },
      rowIndex: 0,
    }),
  ).toBeDefined();
});
it("does not allocate an unbounded array", async () => {
  const value = await generateParameterValue({
    parameter: {
      name: "list",
      in: "query",
      schema: {
        type: "array",
        maxItems: 100000000,
        items: { type: "integer" },
      },
    },
    rowIndex: 0,
  });
  expect((value as unknown[]).length).toBeLessThanOrEqual(3);
});
it("rejects oversized nested generation constraints", async () => {
  await expect(
    generateParameterValue({
      parameter: {
        name: "payload",
        in: "query",
        schema: {
          type: "object",
          properties: { text: { type: "string", minLength: 100000000 } },
        },
      },
      rowIndex: 0,
    }),
  ).rejects.toThrow("generation length budget");
});
it("generates an empty array when maxItems is zero", async () => {
  expect(
    await generateParameterValue({
      parameter: {
        name: "list",
        in: "query",
        schema: { type: "array", maxItems: 0, items: true },
      },
      rowIndex: 0,
    }),
  ).toEqual([]);
});

it("keeps unconstrained array strings short without weakening minimum lengths", async () => {
  for (const maxLength of [undefined, 10000]) {
    const value = await generateParameterValue({parameter: {name: "tags", in: "query", schema: {type: "array", minItems: 2, maxItems: 2, items: {type: "string", maxLength}}}, rowIndex: 0}, {seed: 11});
    expect(value).toHaveLength(2);
    for (const item of value as string[]) expect(item.length).toBeLessThanOrEqual(24);
  }
  const value = await generateParameterValue({parameter: {name: "value", in: "query", schema: {type: "string", minLength: 80, maxLength: 100}}, rowIndex: 0}, {seed: 11});
  expect((value as string).length).toBe(80);
});

it("generates compact readable tags across seeds", async () => {
  for (let seed = 0; seed < 30; seed++) {
    const value = await generateParameterValue({parameter: {name: "tags", in: "query", schema: {type: "array", items: {type: "string"}}}, rowIndex: 0}, {seed}) as string[];
    expect(value.length).toBeLessThanOrEqual(3);
    for (const tag of value) expect(tag).toMatch(/^[a-z]{3,8}$/i);
    expect(JSON.stringify(value).length).toBeLessThanOrEqual(34);
  }
});
it("keeps nested object string samples short under large schema ceilings", async () => {
  const value = await generateParameterValue({parameter: {name: "payload", in: "query", schema: {type: "object", required: ["tag"], properties: {tag: {type: "string", maxLength: 10000}}}}, rowIndex: 0}, {seed: 11}) as {tag: string};
  expect(value.tag.length).toBeLessThanOrEqual(24);
});
