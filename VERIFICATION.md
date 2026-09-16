# Verification record

Date: September 16, 2026.

- Independent library TypeScript check: passed.
- Regression suite: 75 tests passed across seven test files.
- ESM, CommonJS, and declaration generation: passed.
- Every published export path exists and every ESM entry point loads.
- CommonJS core loads while React, Chakra, CodeMirror, and Faker imports are explicitly prohibited.
- The packed CommonJS React entry renders a tree inside the host application's Chakra provider.
- The locally installed package is compared byte-for-byte with the final build.
- English-only source/comment scan: no Han characters in library source, tests, scripts, examples, README, or changelog.
- Browser review uses built distribution files. Checked light/dark tree settings, reference rows, boolean fields, bounded popovers, parameter design configuration, request enablement, raw variable input, and narrow-window row layout.

## Pure-function benchmark

A traversal and one immutable field update, measured over 25 runs on the development machine:

| Fields | Median  | p95     |
| ------ | ------- | ------- |
| 100    | 0.07 ms | 0.32 ms |
| 1,000  | 0.41 ms | 0.67 ms |
| 10,000 | 5.89 ms | 9.06 ms |

These measurements do not include React rendering, browser layout, or network work. The UI is bounded by `maxRows`, not virtualized. They are a reproducible baseline, not a universal performance score.

## Host application checks

The extracted library and compatibility entries pass their checks. The host-wide typecheck still reports four errors outside the extracted components:

- `src/components/business/httpRequest/HttpRequest.tsx`: a string is used to index the typed panel map.
- `src/layouts/main/MainLayout.tsx`: `includeSchemaProperties` is not declared by the installed `OpenApiTreeOptions` type.
- `src/pages/docs/DocsView.tsx`: `document` is not a declared `OasDocumentProps` property.
- `src/pages/spec/SpecView.tsx`: `auto` is not assignable to `EditorTheme`.

The host check used the library TypeScript compiler against the host tsconfig; the host-resolved compiler does not support its module resolution setting.

No npm publication was performed. The package is marked `UNLICENSED` pending the owner's release decision.

## Compact UI iteration

- Tree and parameter configuration now share a 420px settings surface with viewport-bounded scrolling.
- Compact columns are the default; optional columns can be enabled independently.
- Added regression tests for collapse/expand round trips and optional parameter columns.
- Removed filled reference blocks, duplicate type badges, and solid delete confirmation styling.
- Browser checks include light and dark modes, shared settings, and reference row alignment.

## Alignment and variable-editor follow-up

- Reference icon and text centers were measured in the browser and match exactly; paragraph margins no longer affect row alignment.
- Tab styling uses a single indicator. Shared settings use thin outline icons.
- Host danger colors use lower-saturation light/dark tokens, synchronized with the preview.
- VariableTextEditor now backs the host component through compatibility re-exports. Controlled updates retain the editor DOM.
- Completion metadata is precomputed per variable snapshot; completion replaces existing closing braces and normalizes lookup names without mutating caller data.
- Added five variable utility tests and one controlled editor integration test.

## Focus geometry and reference blocks

- Settings icons use VscSettingsCompact throughout the shared editors.
- Reference interaction backgrounds are scoped to one occurrence and its descendants.
- Measured parameter input height is 32px and row height is 33px before and after focus; width is unchanged. Long text still expands (104px in the browser check).
- Removed the wrapped editor's outward ring and extra width; focus uses an inset underline.
- All 52 regression tests and the library typecheck/build pass.

## Column visibility stability

- Column widths are synchronized before paint and only when the viewport width changes. Height-only observer notifications do not schedule updates.
- Bounded width allocation converges in one update and preserves state identity for unchanged dimensions.
- Each visible-column layout retains its own widths across compact/full round trips.
- Browser measurements confirmed identical full-layout widths before and after a compact/full round trip.
- Regression coverage verifies bounded allocation, repeated notifications, narrow containers, layout restoration, and retained input DOM identity. All 56 tests pass.

## Production-readiness source audit

Reviewed the public entry points and types, immutable schema operations, reference traversal, tree rendering and interactions, inline controls, parameter state and sizing, variable editor lifecycle, generation adapter, shared settings surfaces, styles, and package configuration. This is an audit of this library's source, not a security audit of all transitive dependencies.

- Fixed clearing variable inputs, stale token decorations, color-only variable updates, editor recreation on presentation changes, read-only paste/drop, and IME submission handling.
- Preserved sibling identity and property order; fixed encoded local references, boolean schemas, malformed children, root compositions, and composition-array deletion.
- Fixed Escape accidentally committing a draft, read-only custom updates, root deletion actions, and required toggles on non-property nodes.
- Avoided redundant parameter reconciliation and generated-value emissions. Added cancellation when generation context changes, empty-to-populated measurement, observer fallback, final pointer sizing, and keyboard resizing.
- Unified nested settings surfaces and horizontal header/row scrolling. Corrected completion selection styles, focused whitespace, bounded hover surfaces, sticky-header behavior, and touch action visibility.
- Bounded generator options, nested arrays, strings, and reference traversal; corrected exclusive integer bounds and zero-item arrays.
- Fixed the optional generator's CommonJS loading of an ESM-only dependency. `verify:package` loads all 12 ESM/CommonJS export pairs, checks declaration/style paths, renders both tree and parameter components on the server, and executes generation through CommonJS.
- Enabled unused-local and unused-parameter checks and removed unreachable mutation helpers.

The regression suite includes 19 additional tests compared with the previous 56-test baseline. Browser checks use built output and cover light/dark settings, nested panels, compact/full columns, and constrained widths. The benchmark above measures pure functions only.

### Remaining release validation

- Run the supported React 18/19 and Safari/Firefox matrix; this workspace validates its installed React version and local Chromium only.
- Validate complete documents in the host. Unknown schema keywords are retained but not all have dedicated editing controls.
- Use a worker-backed generator with host-enforced timeouts for untrusted regexes or schemas. Allocation bounds cannot interrupt third-party synchronous execution.
- Review the package license and resolve host-wide errors before an application release. No npm publication was performed.
