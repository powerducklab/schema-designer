import { defineConfig } from "tsup";
export default defineConfig({
  entry: {
    "compat/variable-editor": "src/compat/variable-editor.ts",
    "compat/inline": "src/compat/inline.ts",
    "compat/tree": "src/compat/tree.ts",
    "compat/parameters": "src/compat/parameters.ts",
    "react/variableTextEditor/index": "src/react/variableTextEditor/index.ts",
    index: "src/index.ts",
    "core/index": "src/core/index.ts",
    "react/index": "src/react/index.ts",
    "react/schemaTreeEditor/index": "src/react/schemaTreeEditor/index.ts",
    "react/inlineSchemaEditor/index": "src/react/inlineSchemaEditor/index.ts",
    "react/parametersTable/index": "src/react/parametersTable/index.ts",
    "react/parametersTable/libs/generateValue":
      "src/react/parametersTable/libs/generateValue.ts",
  },
  format: ["esm", "cjs"],
  loader: { ".css": "local-css" },
  dts: true,
  clean: true,
  splitting: true,
  // Rollup preserves native dynamic imports in CommonJS chunks.
  treeshake: true,
  esbuildOptions(options) {
    options.loader = { ...options.loader, ".module.css": "local-css" };
  },
  external: [
    "react",
    "react-dom",
    "@chakra-ui/react",
    "@emotion/react",
    "@faker-js/faker",
    "json-schema-faker",
    "ajv",
    "ajv-formats",
    "@powerduck/openapi-parser",
  ],
});
