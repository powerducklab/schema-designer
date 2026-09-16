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
