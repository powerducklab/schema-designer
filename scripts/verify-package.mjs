import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const manifest = JSON.parse(await readFile("package.json", "utf8"));
let verified = 0;
for (const target of Object.values(manifest.exports)) {
  if (typeof target === "string") {
    await access(target);
    continue;
  }
  for (const path of Object.values(target)) await access(path);
  const esm = await import(pathToFileURL(resolve(target.import)).href);
  const cjs = require(resolve(target.require));
  assert.equal(typeof esm, "object");
  assert.equal(typeof cjs, "object");
  verified += 1;
}
const { renderToString } = require("react-dom/server");
const { createElement } = require("react");
const { ChakraProvider, defaultSystem } = require("@chakra-ui/react");
const { SchemaTreeEditor, ParametersTable } = require(
  resolve("dist/index.cjs"),
);
for (const editor of [
  createElement(SchemaTreeEditor, {
    value: { properties: { id: { type: "string" } } },
    onChange() {},
  }),
  createElement(ParametersTable, { parameters: [{ name: "id", in: "query" }] }),
]) {
  assert.ok(
    renderToString(
      createElement(ChakraProvider, { value: defaultSystem }, editor),
    ).length > 0,
  );
}
console.log(
  `Verified ${verified} ESM/CommonJS export pairs, declaration paths, styles, and server rendering.`,
);

const { generateParameterValue } = require(
  resolve("dist/react/parametersTable/libs/generateValue.cjs"),
);
assert.equal(
  await generateParameterValue({
    parameter: {
      name: "count",
      in: "query",
      schema: { type: "integer", const: 7 },
    },
    rowIndex: 0,
  }),
  7,
);
console.log("CommonJS optional generation adapter passed.");
