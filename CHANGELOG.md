# Changelog

## 0.1.0

- Harden variable editor transactions, empty input changes, read-only interactions, and stable editor lifecycles.
- Preserve immutable sibling identity and property ordering; handle boolean schemas and composition-array deletion.
- Stabilize parameter resizing and generation cancellation, with keyboard resizing and compact nested settings.
- Bound generated allocations and fix CommonJS loading for the optional generator.
- Add production artifact verification and expand regression coverage to 75 tests.

- Extract three editors into independently importable entry points with shared immutable schema operations.
- Integrate Inline field configuration into Tree while retaining custom advanced renderers.
- Preserve boolean schemas, unknown extensions, reference siblings, and controlled request values.
- Correct reference occurrence IDs, pointer escaping, unsafe inherited property traversal, and bounded tree traversal.
- Preserve incomplete JSON drafts and stable enum input focus.
- Separate parameter definition updates, request values, row selection, and request enablement.
- Merge asynchronous generation only into unchanged rows; isolate Faker state and reject invalid strict results.
- Publish scoped CSS Modules, theme token fallbacks, ESM/CommonJS builds, declarations, tests, and a built-package example.
