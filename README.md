# @powerduck/schema-designer

<p align="left">
  <a href="https://www.npmjs.com/package/@powerduck/schema-designer"><img src="https://img.shields.io/npm/v/@powerduck/schema-designer" alt="npm version"></a>
  <a href="https://www.powerduck.com/"><img src="https://img.shields.io/badge/website-powerduck.com-f28c28" alt="website"></a>
</p>

Build JSON Schema and OpenAPI parameter editing UIs in minutes. Drop-in React components for designing request bodies, response schemas, query/path parameters, and variable-aware text fields — all sharing a single immutable schema engine.

**Website**: [https://www.powerduck.com/](https://www.powerduck.com/)

---

## Quick Start

Install:

```sh
npm install @powerduck/schema-designer
```

Import the CSS once:

```tsx
import "@powerduck/schema-designer/styles.css";
```

Wrap your app in a `ChakraProvider` (Chakra UI v3 required).

### Edit a JSON Schema tree

```tsx
import { useState } from "react";
import { SchemaTreeEditor } from "@powerduck/schema-designer";
import type { SchemaValue } from "@powerduck/schema-designer";

function DesignSchema() {
  const [schema, setSchema] = useState<SchemaValue>({
    type: "object",
    properties: {
      email: { type: "string", format: "email" },
      age: { type: "integer", minimum: 0 },
    },
    required: ["email"],
  });

  return <SchemaTreeEditor value={schema} onChange={setSchema} />;
}
```

### Edit OpenAPI parameters

```tsx
import { ParametersTable } from "@powerduck/schema-designer/react/parameters";

const [parameters, setParameters] = useState([
  { name: "page", in: "query", schema: { type: "integer", default: 1 } },
  { name: "limit", in: "query", schema: { type: "integer", default: 20, maximum: 100 } },
]);

<ParametersTable parameters={parameters} onChange={setParameters} />
```

### Variable-aware text input

```tsx
import { VariableTextEditor } from "@powerduck/schema-designer/react/variable-editor";

<VariableTextEditor
  value={url}
  onChange={setUrl}
  variables={[{ name: "baseUrl", value: "https://api.example.com" }]}
/>
```

---

## What You Get

| Component | Use case |
|-----------|----------|
| **SchemaTreeEditor** | Visual tree for designing JSON Schema — add properties, set types, edit constraints, drag to reorder |
| **InlineSchemaEditor** | Single-field editor for editing one schema node inline (type, format, enum, examples, composition) |
| **ParametersTable** | OpenAPI parameter table — design query/path/header/cookie params, or switch to "request" mode to fill values |
| **VariableTextEditor** | CodeMirror input with `{{variable}}` token support for URLs, headers, and scripts |

---

## Common Scenarios

### Design mode vs Request mode

```tsx
// Design: edit parameter definitions
<ParametersTable parameters={params} onChange={setParams} />

// Request: fill in values to send (definitions locked)
<ParametersTable
  parameters={params}
  mode="request"
  values={requestValues}
  onValuesChange={setRequestValues}
/>
```

### Show optional columns

```tsx
<SchemaTreeEditor value={schema} onChange={setSchema} showRequired showDescription />
<ParametersTable parameters={params} onChange={setParams} showType showRequired showDescription />
```

### Resolve $ref references

```tsx
<SchemaTreeEditor
  value={schema}
  onChange={setSchema}
  document={openApiDocument}  // resolves local $ref pointers
/>
```

### Generate sample values

```tsx
<ParametersTable
  parameters={params}
  mode="request"
  values={values}
  onValuesChange={setValues}
  onError={reportError}
/>
```

The built-in generator creates realistic sample values from your schema using Faker + JSON Schema Faker, with Ajv validation.

---

## Entry Points

| Import | Contents |
|--------|----------|
| `@powerduck/schema-designer` | All React components (tree, inline, parameters, variable editor) |
| `@powerduck/schema-designer/core` | Pure schema operations — patch, pointers, traversal, reference resolution (no React) |
| `@powerduck/schema-designer/react/tree` | SchemaTreeEditor only |
| `@powerduck/schema-designer/react/inline` | InlineSchemaEditor only |
| `@powerduck/schema-designer/react/parameters` | ParametersTable only |
| `@powerduck/schema-designer/react/variable-editor` | VariableTextEditor only |
| `@powerduck/schema-designer/styles.css` | Combined component styles |

ESM + CommonJS builds with full TypeScript declarations. Tree-shaking friendly — importing `react/tree` doesn't load CodeMirror or Faker.

---

## Requirements

- React 18.2+ or 19
- Chakra UI v3 (wrap app in `ChakraProvider`)
- Node 22.12+ (for the optional generator adapter)

---

## API Reference

### SchemaTreeEditor

| Prop | Default | Description |
|------|---------|-------------|
| `value` | required | The JSON Schema to edit (object or boolean) |
| `onChange` | required | Callback receiving the new schema |
| `document` | edited schema | Root document for resolving local `$ref` |
| `showType` | `true` | Show inline type selector |
| `showRequired` | `false` | Show required column |
| `showDescription` | `false` | Show description column |
| `defaultExpanded` | `[]` | Initially expanded paths |
| `maxRows` | `5000` | Max expanded rows before overflow notice |
| `readOnly` | `false` | Disable all edits |
| `onError` | — | Recovered errors with scope and path |

### ParametersTable

| Prop | Default | Description |
|------|---------|-------------|
| `parameters` | required | OpenAPI parameter array |
| `onChange` | — | Callback receiving updated parameter definitions |
| `mode` | `"design"` | `"design"` edits definitions; `"request"` fills values |
| `values` | local state | Controlled request values keyed by `parameterKey` |
| `onValuesChange` | — | Callback for request value changes |
| `document` | — | Root document for `$ref` resolution |
| `showType` / `showRequired` / `showDescription` | `false` | Toggle optional columns |
| `readOnly` | `false` | Disable all edits |

### VariableTextEditor

| Prop | Default | Description |
|------|---------|-------------|
| `value` | required | Raw text string |
| `onChange` | — | Callback receiving new text |
| `variables` | `[]` | Array of `{ name, value, description, type? }` |
| `allowLineBreaks` | `false` | Enable multi-line input |
| `submitOnEnter` | `false` | Call submit on Enter |
| `minHeight` / `maxFocusedHeight` | `32` / `320` | Pixel height bounds |
| `readOnly` / `disabled` | `false` | Lock input |

---

## License

UNLICENSED — owned by Powerduck.
