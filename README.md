# @powerduck/schema-designer

<p align="left">
  <a href="https://www.npmjs.com/package/@powerduck/schema-designer"><img src="https://img.shields.io/npm/v/@powerduck/schema-designer" alt="npm version"></a>
  <a href="https://www.powerduck.com/"><img src="https://img.shields.io/badge/website-powerduck.com-f28c28" alt="website"></a>
</p>

Composable JSON Schema and OpenAPI parameter editors extracted from Powerduck React. The tree, field settings, and parameter table share immutable schema operations while remaining independently importable.

**Website**: [https://www.powerduck.com/](https://www.powerduck.com/)

## Installation

The package currently lives in this workspace and has not been published. Build it before installing the local directory:

```sh
cd schema-designer
npm ci
npm run build
cd ../powerduck-react
npm install ../schema-designer --install-links
```

The React components require React 18.2 or 19, Chakra UI 3, and Emotion. Wrap them in your application's `ChakraProvider`. Do not create a second React runtime. Development and generation adapters require Node 22.12 or later.

```tsx
import { useState } from "react";
import {
  SchemaTreeEditor,
  InlineSchemaEditor,
  ParametersTable,
} from "@powerduck/schema-designer";
import type { SchemaValue } from "@powerduck/schema-designer";
import "@powerduck/schema-designer/styles.css";

function Designer() {
  const [schema, setSchema] = useState<SchemaValue>({
    type: "object",
    properties: { email: { type: "string", format: "email" } },
  });
  return <SchemaTreeEditor value={schema} onChange={setSchema} />;
}
```

## Entry points

| Import                                             | Purpose                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `@powerduck/schema-designer/core`                  | Schema patches, pointers, traversal, reference resolution, parameter identities, and values; no React or DOM runtime dependency |
| `@powerduck/schema-designer/react/tree`            | Visual schema tree, with Inline settings as the default field popover                                                           |
| `@powerduck/schema-designer/react/inline`          | Standalone field constraints, arrays, objects, composition, examples, defaults, and preview                                     |
| `@powerduck/schema-designer/react/parameters`      | Parameter definitions and request value tables                                                                                  |
| `@powerduck/schema-designer/react/variable-editor` | The retained CodeMirror variable-aware input                                                                                    |
| `@powerduck/schema-designer/adapters/generator`    | Optional Faker, JSON Schema Faker, and Ajv generation adapter                                                                   |
| `@powerduck/schema-designer/styles.css`            | Combined, scoped component styles; import once                                                                                  |
| `@powerduck/schema-designer/compat/*`              | Migration exports for existing Powerduck code                                                                                   |

Both ESM and CommonJS builds include TypeScript declarations. The generation adapter is dynamically loaded only when default generation is requested. Tree imports do not load parameter editing, CodeMirror, or Faker code.

## Schema editing

Use `value` and `onChange` for new integrations. Tree also accepts the original `schema` property. Inline additionally retains `schema` and `update(patch)`; an `undefined` patch value removes that keyword. Prefer one change interface per component. If both callbacks are provided, both are notified.

Treat input schemas as immutable. Replace the changed branch when applying external updates; in-place mutation is unsupported. Unknown keywords, extensions, union types, boolean schema children, and unchanged branches are retained. Explicit type conversion removes incompatible type-specific constraints.

Boolean schema roots and children remain `true` or `false`, rather than being coerced into empty objects. Their configuration UI supports toggling acceptance or explicitly converting to object constraints. Tree rendering includes array roots, items, tuple items, and composition branches. Existing object property lists retain their original layout.

Local references can be resolved against `document` on Tree and ParametersTable, or `fullSchema` on Inline. Without a document, Tree uses the edited schema. Referenced child rows are read-only; editing a reference occurrence does not rewrite its shared target. Unknown, external, and recursive references are retained, never automatically fetched. The default generator reports unresolved or recursive references instead of making a network request.

Tree preserves adding children and siblings, rename, required flags, description editing, delete confirmation, drag reorder, keyboard reorder, expansion, overflow reporting, error recovery, and custom `renderAdvanced(context)`. `context.update(next)` replaces that node. Inline patches and full replacements must not be confused.

Inline preserves type-specific constraints, property duplication, nested editing, references, enum values, composition, examples/defaults, copy, and diff preview. `showAdvanced`, `showComposition`, and `showLiveJson` control their respective UI. Copy uses the normal clipboard shortcut; field duplication uses Ctrl/Cmd+Shift+D.

## Parameter definitions versus request values

`mode="design"` is the default. It permits editing definitions, opening field configuration, selecting rows for batch operations, resizing columns, reordering, and deletion. `mode="request"` locks definition edits and adds request enablement independently of batch selection. Required path parameters stay enabled.

```tsx
import { ParametersTable } from "@powerduck/schema-designer/react/parameters";
import { initializeParameterValues } from "@powerduck/schema-designer/core";
import type { ParameterValues } from "@powerduck/schema-designer";

const [values, setValues] = useState<ParameterValues>(() =>
  initializeParameterValues(parameters),
);

<ParametersTable
  parameters={parameters}
  mode="request"
  values={values}
  onValuesChange={setValues}
  onError={reportError}
/>;
```

Values are keyed by `parameterKey(parameter)`, which includes location and name. Parameter definitions should have unique `(in, name)` pairs. Text edits remain raw strings so variables, incomplete JSON, and intentionally empty input are not lost. Examples and defaults supply initial display values; explicit request values take precedence, including `false`, `0`, `null`, and `""`. No HTTP serialization is performed by this package. Serialize against the current parameter definitions in your request layer.

`onChange` emits parameter definitions, while `onValuesChange` emits request values and enablement. Both controlled and local request values are supported. `onSelectionChange` retains the original internal row IDs and remains independent of enablement. Use `readOnly` to prevent edits and generation.

Generation skips supplied examples and values. A generation that makes no changes does not emit `onValuesChange`. A custom `generateValue(context)` may be asynchronous and receives an abort signal and optional document. Pending results merge only into unchanged rows and unchanged controlled values. Unmounting, entering read-only mode, changing mode or the reference document, or starting another generation cancels the previous operation. Errors are delivered through `onError`. Strict default generation rejects invalid candidates rather than returning an invalid fallback. Unsupported constraints may therefore require an explicit example or custom generator.

OpenAPI parameter content and extension fields are preserved. The table is not a complete OpenAPI document validator: hosts remain responsible for cross-parameter constraints such as duplicate names, path-template membership, and the incompatibility of `query` with `querystring` parameters.

## Theme and accessibility

All editors consume the existing Powerduck CSS tokens, including surface, text, border, radius, focus, and accent variables. Component CSS supplies light-theme fallbacks without overriding the host's tokens. Define the tokens on the page root for both themes so portaled menus and popovers inherit the same theme. Keep the Chakra color mode aligned with the page theme. `examples/tokens.css` is a reference copy of the application's tokens, not an automatically injected global stylesheet.

Controls retain accessible names, keyboard focus indicators, Escape handling, disabled states, and keyboard reordering. Popovers are mounted lazily and constrained to the viewport. Invalid value drafts remain visible for correction.

### Compact presentation

Both lists prioritize frequent edits. Tree shows field names and types by default; ParametersTable shows names and values. Optional columns are controlled independently with `showType`, `showRequired`, and `showDescription`. Hidden attributes remain available from the settings icon. Request mode opens settings read-only.

```tsx
<SchemaTreeEditor value={schema} onChange={setSchema} showRequired showDescription />
<ParametersTable parameters={parameters} onChange={setParameters} showType showRequired showDescription />
```

Tree and parameter settings share the same compact, themed popover surface. Parameter settings separate Schema constraints from Parameter metadata; reference and serialization controls are expandable. Tree offers both Expand all and Collapse all, with expansion bounded by `maxRows` and cycle detection. Row settings stay visible; add/delete actions appear on hover or keyboard focus and remain visible on touch devices. Deletion still requires confirmation.

## Performance and boundaries

Updates share unchanged branches. Tree traversal visits expanded branches, uses occurrence-specific pointer IDs, stops at `maxRows`, and limits nesting depth. `maxRows` defaults to 5,000 and shows an overflow notice; the tree is bounded but not virtualized. Avoid expanding thousands of rows simultaneously when a smaller view is sufficient. Diff previews use a bounded algorithm instead of an unbounded quadratic allocation. Unchanged property branches and reconciled parameter rows retain their identities. Column sizing runs before paint, ignores height-only resize notifications, and remembers each visible-column layout separately. The table retains its CodeMirror inputs across placeholder, dimension, and column-visibility changes. Both tables scroll horizontally within their own containers when optional columns exceed available space.

Run `npm run benchmark` for the pure traversal-plus-update benchmark at 100, 1,000, and 10,000 fields. This does not measure React rendering or interaction latency. Browser validation is also required for release acceptance.

## Development and verification

```sh
npm run typecheck
npm test -- --pool=forks --maxWorkers=1 --minWorkers=1
npm run build
npm run verify:package
npm run benchmark
npm run dev
npm pack
```

The example uses the built distribution, so rebuild after changing library sources. Tests cover data preservation, pointer escaping, repeated references, boolean schemas, prototype-named fields, immutable updates, bounded diffing, incomplete input, disabled controls, default Tree-to-Inline integration, request enablement, generation, and stale async responses.

Existing Powerduck component paths are compatibility entries backed by this package. The application's compact parameter table defaults remain unchanged. The tree compatibility adapter retains its original object-root contract; new integrations should use the package entry directly for boolean roots.

This workspace package is marked `UNLICENSED`. Publishing and license selection remain with the package owner.

### Variable text editor

`VariableTextEditor` is exported from the package root and from `@powerduck/schema-designer/react/variable-editor`. The subpath is preferred when only variable input is needed. Import `@powerduck/schema-designer/styles.css` once in the application. Existing Powerduck import paths forward to the library, including legacy utility imports.

```tsx
import { VariableTextEditor } from "@powerduck/schema-designer/react/variable-editor";

<VariableTextEditor value={url} onChange={setUrl} variables={variables} />;
```

Composition editing remains available under Validation > Composition rules. The section is collapsed initially and respects `showComposition={false}`. These operators model schema alternatives and intersections; they are not request values.

## Integration reference

### Tree

| Property                          | Default                  | Behavior                                                                                      |
| --------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------- |
| `value`, `onChange`               | Required controlled pair | Accepts object or boolean schemas; emits immutable replacements.                              |
| `document`                        | Edited schema            | Root document for local `$ref` pointers.                                                      |
| `showType`                        | `true`                   | Shows the inline type selector.                                                               |
| `showRequired`, `showDescription` | `false`                  | Reveals optional columns without dropping their data.                                         |
| `defaultExpanded`                 | `[]`                     | Initial occurrence paths, such as `properties/customer`; escape `~` and `/` as `~0` and `~1`. |
| `maxRows`                         | `5000`                   | Stops expanded traversal and displays an overflow notice.                                     |
| `readOnly`                        | `false`                  | Prevents commits, including custom advanced-editor updates.                                   |
| `renderAdvanced`                  | Shared Inline editor     | Custom content receives a full-node replacement callback.                                     |
| `onError`                         | Unset                    | Receives recovered errors with scope and path. Throwing observers cannot break recovery.      |

Enter commits buffered tree input; Escape cancels it. Ctrl/Cmd+Up/Down reorders properties. Array items have no required toggle, and composition entries can be removed. Local URI-fragment pointers, escaped property names, boolean references, and composition beside root properties are supported. Reference targets remain read-only in expanded rows.

### ParametersTable

| Property                                      | Default                   | Behavior                                                                           |
| --------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------- |
| `parameters`                                  | Required                  | Array of OpenAPI parameter definitions.                                            |
| `mode`                                        | `design`                  | `request` locks definition changes while permitting request values and enablement. |
| `showType`, `showRequired`, `showDescription` | `false`                   | Name and value stay visible.                                                       |
| `values`, `onValuesChange`                    | Local state               | Optional controlled request values indexed by `parameterKey`.                      |
| `document`                                    | Unset                     | Resolves local schema and example references.                                      |
| `height`                                      | `100%`                    | Use a bounded height for internal scrolling or `auto` for document flow.           |
| `stickyHeader`                                | `true`                    | Sticky within the table viewport; `false` uses normal flow.                        |
| `readOnly`                                    | `false`                   | Prevents definition edits, value edits, enablement changes, and generation.        |
| `generateValue`                               | Optional built-in adapter | Receives parameter, row index, document, and abort signal.                         |

Focused column separators accept Left/Right for 8px adjustments, or Shift+Left/Right for 32px. The adjacent pair retains its total width. The final column has no inactive resize handle. Content-based parameter schemas are preserved and are not accidentally combined with a new top-level `schema` by the type column. Boolean parameter schemas remain booleans in settings and reference resolution.

### VariableTextEditor

| Property                        | Default                            | Behavior                                                                                                           |
| ------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `value`, `onChange`             | Required value / optional callback | Raw text, including an empty string when cleared.                                                                  |
| `variables`                     | `[]`                               | Immutable definitions; names, values, descriptions, types, and custom colors update without rebuilding the editor. |
| `ariaLabel`                     | `Variable text editor`             | Use a field-specific accessible name.                                                                              |
| `allowLineBreaks`               | `false`                            | Paste normalizes line breaks to spaces when disabled.                                                              |
| `submitOnEnter`                 | `false`                            | Submits single-line input after completion handling; IME confirmation is preserved.                                |
| `minHeight`, `maxFocusedHeight` | `32`, `320`                        | Pixel heights; focused overflow is scrollable.                                                                     |
| `safePadding`                   | `8`                                | Nonnegative vertical padding while focused; tables use `4`.                                                        |
| `maxLength`                     | `16384`                            | UTF-16 code-unit limit, configurable up to 1,000,000.                                                              |
| `disabled`, `readOnly`          | `false`                            | Prevents edits, including paste/drop paths.                                                                        |

Treat variable arrays and their entries as immutable. Inline token decorations update with the same document transaction, so deletion cannot leave stale token ranges. Updating presentation props preserves focus, selection, and history. Hosts should echo changes; delayed acknowledgments are tolerated, but this is not a collaborative-edit conflict-resolution protocol.

## Generator safety and release boundaries

The optional default generator validates candidates against the original schema in strict mode. `false` schemas reject generation. `maxArrayItems` defaults to 3 and is an allocation budget (1–1,000); increase it explicitly when an array's minimum requires more items. `maxDepth` accepts 1–32, and `validationRetryCount` accepts 0–20. Generated strings are bounded to 16,384 code units; larger required minimums produce an error. Local dereferencing is bounded to 20,000 visited nodes and a maximum depth of 128. Reference resolution never fetches remote documents.

These limits do not sandbox user-supplied regexes or third-party synchronous generation. For untrusted schemas or hard time limits, provide a worker-backed `generateValue` adapter and enforce a timeout there. An abort signal prevents stale results from being committed; it cannot interrupt synchronous JavaScript already executing.

This is a schema editor, not a complete JSON Schema or OpenAPI validator. Unknown keywords are preserved, but not every keyword has a dedicated control. The host must validate a document before saving or sending requests. Large trees are bounded, not virtualized; large parameter tables instantiate an editor per visible text cell, so paginate or filter large parameter collections in the host.

The current audit verifies the installed dependency set and the local Chromium preview. React 18 and 19 are declared peer ranges; a full React-version, Safari, and Firefox matrix has not been run in this workspace. Run your supported-browser matrix before release. See [VERIFICATION.md](./VERIFICATION.md) for measured results and the source audit record. No numeric quality score substitutes for these checks.

Multiline parameter values use `expansionMode="overlay"` to expand above neighboring content while preserving row height, and collapse on blur. Standalone editors default to `"inline"` expansion. Expanded editors use a thin theme border, visible blank-line markers, and internal scrolling at `maxFocusedHeight`. Markers are visual only and are never included in copied or emitted values.
