import type { SchemaValue } from "./types";
import { resolveLocalReference } from "./references";
import type {
  FlatNode,
  JSONSchema,
  JSONSchemaType,
  RefSegment,
  SchemaEditorErrorScope,
  SchemaErrorHandler,
} from "../react/schemaTreeEditor/libs/types";

/* -------------------------------------------------------------------------- */
/* Guards                                                                     */
/* -------------------------------------------------------------------------- */

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/** Rejects keys that could reach Object.prototype. */
export function isUnsafeKey(key: string): boolean {
  return UNSAFE_KEYS.has(key);
}

export function samePath(a: readonly string[], b: readonly string[]): boolean {
  return (
    a.length === b.length && a.every((segment, index) => segment === b[index])
  );
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Runs fn, converts any throw into a reported error plus a fallback value. */
export function safeRun<T>(
  scope: SchemaEditorErrorScope,
  fn: () => T,
  fallback: T,
  onError?: SchemaErrorHandler,
  path?: string[],
): T {
  try {
    return fn();
  } catch (cause) {
    try {
      onError?.({
        scope,
        message: cause instanceof Error ? cause.message : String(cause),
        cause,
        path,
      });
    } catch {
      /* Error observers must not break recovery. */
    }
    return fallback;
  }
}

/* -------------------------------------------------------------------------- */
/* Cloning                                                                    */
/* -------------------------------------------------------------------------- */

const MAX_CLONE_DEPTH = 512;

/**
 * Structural clone that tolerates cyclic graphs.
 * An already visited node is reused, so the cycle is preserved
 * instead of blowing the stack.
 */
export function cloneSchema<T>(
  value: T,
  seen?: WeakMap<object, unknown>,
  depth = 0,
): T {
  if (value === null || typeof value !== "object") return value;
  if (depth > MAX_CLONE_DEPTH) {
    throw new RangeError(
      `Schema exceeds maximum clone depth of ${MAX_CLONE_DEPTH}`,
    );
  }

  const memo = seen ?? new WeakMap<object, unknown>();
  const source = value as unknown as object;
  if (memo.has(source)) return memo.get(source) as T;

  if (Array.isArray(value)) {
    const out: unknown[] = new Array(value.length);
    memo.set(source, out);
    for (let i = 0; i < value.length; i += 1) {
      out[i] = cloneSchema(value[i], memo, depth + 1);
    }
    return out as unknown as T;
  }

  const out: Record<string, unknown> = Object.create(null);
  memo.set(source, out);
  for (const key of Object.keys(value as Record<string, unknown>)) {
    Object.defineProperty(out, key, {
      value: cloneSchema(
        (value as Record<string, unknown>)[key],
        memo,
        depth + 1,
      ),
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return out as unknown as T;
}

/* -------------------------------------------------------------------------- */
/* Immutable writes                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Writes `value` at `path`, sharing structure with `root` for untouched
 * branches so row level memoization keeps working.
 */
export function setIn<T extends object>(
  root: T,
  path: string[],
  value: unknown,
): T {
  if (path.length === 0) return (value as T) ?? root;

  const [head, ...rest] = path;

  if (Array.isArray(root)) {
    const index = Number(head);
    if (!Number.isInteger(index) || index < 0 || index >= root.length)
      return root;
    const child = root[index];
    const nextChild =
      rest.length === 0
        ? value
        : setIn(
            (isPlainObject(child) || Array.isArray(child)
              ? child
              : {}) as object,
            rest,
            value,
          );
    if (nextChild === child) return root;
    const copy = root.slice();
    copy[index] = nextChild;
    return copy as unknown as T;
  }

  const container = root as Record<string, unknown>;
  const child = Object.hasOwn(container, head) ? container[head] : undefined;
  const nextChild =
    rest.length === 0
      ? value
      : setIn(
          (isPlainObject(child) || Array.isArray(child) ? child : {}) as object,
          rest,
          value,
        );
  if (nextChild === child) return root;
  return { ...container, [head]: nextChild } as T;
}

export function getIn(root: unknown, path: string[]): unknown {
  let cursor: unknown = root;
  for (const token of path) {
    if (Array.isArray(cursor)) {
      const index = Number(token);
      if (!Number.isInteger(index)) return undefined;
      cursor = cursor[index];
      continue;
    }
    if (!isPlainObject(cursor)) return undefined;
    if (!Object.prototype.hasOwnProperty.call(cursor, token)) return undefined;
    cursor = cursor[token];
  }
  return cursor;
}

/** Deletes the key at `path`, returning the same reference when nothing changed. */
export function deleteIn<T extends object>(root: T, path: string[]): T {
  if (path.length === 0) return root;
  const parentPath = path.slice(0, -1);
  const key = path[path.length - 1];

  const parent = getIn(root, parentPath);
  if (Array.isArray(parent)) {
    const index = Number(key);
    if (!/^(0|[1-9][0-9]*)$/.test(key) || index >= parent.length) return root;
    return setIn(
      root,
      parentPath,
      parent.filter((_, position) => position !== index),
    );
  }
  if (
    !isPlainObject(parent) ||
    !Object.prototype.hasOwnProperty.call(parent, key)
  )
    return root;

  const next: Record<string, unknown> = Object.create(null);
  for (const existing of Object.keys(parent)) {
    if (existing === key) continue;
    next[existing] = parent[existing];
  }
  return setIn(root, parentPath, next);
}

/** Merges a partial patch into the schema object at `path`. */
export function patchSchema<T extends object>(
  root: T,
  path: string[],
  patch: Record<string, unknown>,
): T {
  const target = getIn(root, path);
  const base = isPlainObject(target) ? target : {};
  const next: Record<string, unknown> = { ...base };
  let changed = false;

  for (const key of Object.keys(patch)) {
    const value = patch[key];
    if (value === undefined) {
      if (Object.prototype.hasOwnProperty.call(next, key)) {
        delete next[key];
        changed = true;
      }
      continue;
    }
    if (next[key] !== value) {
      Object.defineProperty(next, key, {
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      changed = true;
    }
  }
  if (!changed) return root;
  return setIn(root, path, next);
}

/* -------------------------------------------------------------------------- */
/* Key ordering                                                               */
/* -------------------------------------------------------------------------- */

/** Moves `fromKey` to `toIndex` inside an object, preserving insertion order. */
export function reorderKeys<T extends Record<string, unknown>>(
  source: T,
  fromKey: string,
  toIndex: number,
): T {
  if (!isPlainObject(source)) return source;
  const keys = Object.keys(source);
  const from = keys.indexOf(fromKey);
  if (from < 0) return source;

  const target = Math.max(0, Math.min(keys.length - 1, toIndex));
  if (target === from) return source;

  keys.splice(from, 1);
  keys.splice(target, 0, fromKey);

  const out: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    out[key] = source[key];
  }
  return out as T;
}

/** Renames a key in place, keeping its original position. */
export function renameKey<T extends Record<string, unknown>>(
  source: T,
  fromKey: string,
  toKey: string,
): T {
  if (!isPlainObject(source) || fromKey === toKey) return source;

  if (!Object.prototype.hasOwnProperty.call(source, fromKey)) return source;
  if (Object.prototype.hasOwnProperty.call(source, toKey)) return source;

  const out: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(source)) {
    if (key === fromKey) out[toKey] = source[key];
    else out[key] = source[key];
  }
  return out as T;
}

/** Inserts `key` right after `afterKey`, or at the end when not found. */
export function insertKeyAfter<T extends Record<string, unknown>>(
  source: T,
  afterKey: string | null,
  key: string,
  value: unknown,
): T {
  const base = isPlainObject(source) ? source : ({} as T);
  const out: Record<string, unknown> = Object.create(null);
  let inserted = false;

  for (const existing of Object.keys(base)) {
    out[existing] = base[existing];
    if (existing === afterKey) {
      out[key] = value;
      inserted = true;
    }
  }
  if (!inserted) out[key] = value;
  return out as T;
}

/** Produces `name`, `name2`, `name3`... until it is free. */
export function uniqueKey(
  source: Record<string, unknown> | undefined,
  base: string,
): string {
  const owner = isPlainObject(source) ? source : {};
  if (!Object.prototype.hasOwnProperty.call(owner, base)) return base;
  let counter = 2;
  while (Object.prototype.hasOwnProperty.call(owner, `${base}${counter}`))
    counter += 1;
  return `${base}${counter}`;
}

export const KEY_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$-]*$/;

export function isValidKey(key: string): boolean {
  return typeof key === "string";
}

/* -------------------------------------------------------------------------- */
/* required array maintenance                                                 */
/* -------------------------------------------------------------------------- */

export function setRequired<T extends object>(
  root: T,
  ownerPath: string[],
  key: string,
  required: boolean,
): T {
  const owner = getIn(root, ownerPath);
  const current =
    isPlainObject(owner) && Array.isArray(owner.required) ? owner.required : [];
  const has = current.includes(key);
  if (has === required) return root;

  const next = required
    ? [...current, key]
    : current.filter((item) => item !== key);
  if (next.length === 0) {
    const base = isPlainObject(owner) ? { ...owner } : {};
    delete base.required;
    return setIn(root, ownerPath, base);
  }
  return patchSchema(root, ownerPath, { required: next });
}

export function renameRequired<T extends object>(
  root: T,
  ownerPath: string[],
  fromKey: string,
  toKey: string,
): T {
  const owner = getIn(root, ownerPath);
  if (!isPlainObject(owner) || !Array.isArray(owner.required)) return root;
  if (!owner.required.includes(fromKey)) return root;
  return patchSchema(root, ownerPath, {
    required: owner.required.map((item) => (item === fromKey ? toKey : item)),
  });
}

export function removeRequired<T extends object>(
  root: T,
  ownerPath: string[],
  key: string,
): T {
  return setRequired(root, ownerPath, key, false);
}

/* -------------------------------------------------------------------------- */
/* $ref resolution                                                            */
/* -------------------------------------------------------------------------- */

const REF_PREFIX = "#/";
const MAX_REF_HOPS = 64;

function decodePointerToken(token: string): string {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

/**
 * Resolves a local JSON Pointer `$ref`. Follows ref chains up to a hop budget
 * and returns null for malformed pointers instead of throwing.
 */
export function resolveRef(
  ref: string,
  root: JSONSchema | undefined,
  onError?: SchemaErrorHandler,
): { schema: JSONSchema | boolean; name: string } | null {
  if (
    typeof ref !== "string" ||
    (ref !== "#" && !ref.startsWith(REF_PREFIX)) ||
    !isPlainObject(root)
  ) {
    return null;
  }

  return safeRun(
    "resolveRef",
    () => {
      let current = ref;
      const visited = new Set<string>();

      for (let hop = 0; hop < MAX_REF_HOPS; hop += 1) {
        if (visited.has(current)) return null;
        visited.add(current);

        if (current !== "#" && !current.startsWith(REF_PREFIX)) return null;
        const tokens = decodeURIComponent(current.slice(REF_PREFIX.length))
          .split("/")
          .map(decodePointerToken);
        const cursor = resolveLocalReference(current, root);
        if (typeof cursor === "boolean")
          return { schema: cursor, name: tokens[tokens.length - 1] ?? current };
        if (!isPlainObject(cursor)) return null;

        const next = (cursor as JSONSchema).$ref;
        if (typeof next !== "string") {
          const name = tokens[tokens.length - 1] ?? current;
          return { schema: cursor as JSONSchema, name };
        }
        current = next;
      }
      return null;
    },
    null,
    onError,
  );
}

/* -------------------------------------------------------------------------- */
/* External contract verification                                             */
/* -------------------------------------------------------------------------- */

/** Cheap shallow signature: enough to catch in place mutation by the host. */
function signatureOf(schema: unknown): string {
  if (!isPlainObject(schema)) return "";
  const top = Object.keys(schema);
  const props = isPlainObject(schema.properties)
    ? Object.keys(schema.properties)
    : [];
  const required = Array.isArray(schema.required) ? schema.required.length : 0;
  return `${top.length}|${top.join(",")}|${props.join(",")}|${required}`;
}

export interface ExternalSchemaCheck {
  schema: JSONSchema;
  /** The host mutated the same object reference in place. */
  mutated: boolean;
}

/**
 * Validates the schema coming from the host and detects in place mutation.
 * `previousSignature` must be stored by the caller between renders.
 */
export function verifyExternalSchema(
  next: unknown,
  previous: JSONSchema | undefined,
  previousSignature: string,
  onError?: SchemaErrorHandler,
): ExternalSchemaCheck & { signature: string } {
  if (!isPlainObject(next)) {
    onError?.({
      scope: "commit",
      message: "schema prop must be a plain object",
    });
    return {
      schema: (previous ?? {}) as JSONSchema,
      mutated: false,
      signature: previousSignature,
    };
  }
  const signature = signatureOf(next);
  const mutated = previous === next && signature !== previousSignature;
  return { schema: next as JSONSchema, mutated, signature };
}

/* -------------------------------------------------------------------------- */
/* Display helpers                                                            */
/* -------------------------------------------------------------------------- */

export function schemaTypeOf(schema: JSONSchema | undefined): JSONSchemaType {
  if (!isPlainObject(schema)) return "string";
  const raw = schema.type;
  if (Array.isArray(raw)) {
    const first = raw.find((item) => item !== "null");
    return (first ?? "string") as JSONSchemaType;
  }
  if (typeof raw === "string") return raw as JSONSchemaType;
  if (isPlainObject(schema.properties)) return "object";
  if (isPlainObject(schema.items)) return "array";
  return "string";
}

export function typeLabel(schema: JSONSchema | undefined): string {
  const base = schemaTypeOf(schema);
  if (base === "array" && isPlainObject(schema?.items)) {
    return `array of ${schemaTypeOf(schema?.items as JSONSchema)}`;
  }
  if (schema?.format) return `${base} · ${schema.format}`;
  if (Array.isArray(schema?.enum) && schema.enum.length > 0) return "enum";
  return base;
}

export function isExpandable(schema: JSONSchema | undefined): boolean {
  if (!isPlainObject(schema)) return false;
  if (
    isPlainObject(schema.properties) &&
    Object.keys(schema.properties).length > 0
  )
    return true;
  if (isPlainObject(schema.items) || typeof schema.items === "boolean")
    return true;
  if (
    [schema.prefixItems, schema.allOf, schema.anyOf, schema.oneOf].some(
      (items) => Array.isArray(items) && items.length,
    )
  )
    return true;
  return false;
}

export function defaultSchemaFor(type: JSONSchemaType): JSONSchema {
  switch (type) {
    case "object":
      return { type: "object", properties: {} };
    case "array":
      return { type: "array", items: { type: "string" } };
    default:
      return { type };
  }
}

/**
 * Changes the schema type without discarding metadata, extensions, or unknown
 * keywords. Only keywords that are structurally incompatible with the target
 * type are removed.
 */
export function changeSchemaType(
  schema: JSONSchema,
  nextType: JSONSchemaType,
): JSONSchema {
  const next = cloneSchema(schema);
  next.type = nextType;

  const remove = (...keys: string[]) => {
    for (const key of keys) delete next[key];
  };

  if (nextType !== "string") {
    remove("minLength", "maxLength", "pattern");
  }
  if (nextType !== "number" && nextType !== "integer") {
    remove(
      "minimum",
      "maximum",
      "exclusiveMinimum",
      "exclusiveMaximum",
      "multipleOf",
    );
  }
  if (nextType !== "array") {
    remove(
      "items",
      "prefixItems",
      "minItems",
      "maxItems",
      "uniqueItems",
      "contains",
      "minContains",
      "maxContains",
    );
  }
  if (nextType !== "object") {
    remove(
      "properties",
      "required",
      "additionalProperties",
      "patternProperties",
      "propertyNames",
      "minProperties",
      "maxProperties",
      "dependentRequired",
      "dependentSchemas",
      "unevaluatedProperties",
    );
  }

  // Keep title, description, default, examples, annotations, x-* extensions,
  // and unknown keywords intact. Add only missing container defaults.
  if (nextType === "object" && !isPlainObject(next.properties)) {
    next.properties = {};
  }
  if (
    nextType === "array" &&
    !Object.prototype.hasOwnProperty.call(next, "items")
  ) {
    next.items = { type: "string" };
  }

  return next;
}

/* -------------------------------------------------------------------------- */
/* Flattening                                                                 */
/* -------------------------------------------------------------------------- */

interface FlattenOptions {
  expandAll?: boolean;
  root: JSONSchema;
  document?: JSONSchema;
  expanded: Set<string>;
  maxRows: number;
  onError?: SchemaErrorHandler;
}

interface WalkContext extends FlattenOptions {
  out: FlatNode[];
  refStack: string[];
  overflow: { hit: boolean };
}

function refBlockSegment(
  isRefRoot: boolean,
  insideRef: boolean,
  hasChildren: boolean,
): RefSegment {
  if (isRefRoot) return hasChildren ? "head" : "single";
  if (insideRef) return "body";
  return "none";
}

function walk(
  value: SchemaValue,
  key: string,
  path: string[],
  parentPath: string[],
  depth: number,
  required: boolean,
  insideRef: boolean,
  context: WalkContext,
): void {
  if (context.out.length >= context.maxRows) {
    context.overflow.hit = true;
    return;
  }

  if (typeof value !== "boolean" && !isPlainObject(value)) return;
  const schema: JSONSchema =
    typeof value === "boolean" ? {} : (value as JSONSchema);
  const id = pointerId(path) || "$root";
  let resolved = schema;
  let resolvedValue: SchemaValue = value;
  let refName: string | undefined;
  let recursive = false;
  let isRefRoot = false;

  if (isPlainObject(schema) && typeof schema.$ref === "string") {
    isRefRoot = true;
    if (context.refStack.includes(schema.$ref)) {
      recursive = true;
      refName = schema.$ref.split("/").pop();
    } else {
      const hit = resolveRef(
        schema.$ref,
        context.document ?? context.root,
        context.onError,
      );
      if (hit) {
        resolvedValue = hit.schema;
        resolved = typeof hit.schema === "boolean" ? {} : hit.schema;
        refName = hit.name;
      } else {
        recursive = false;
        refName = schema.$ref.split("/").pop();
      }
    }
  }

  const expandable = depth < 128 && !recursive && isExpandable(resolved);
  const expanded =
    expandable && (context.expandAll || context.expanded.has(id));
  const readOnly = insideRef;

  const node: FlatNode = {
    id,
    key,
    path,
    parentPath,
    depth,
    kind:
      parentPath.length === 0 && key === ""
        ? "root"
        : parentPath[parentPath.length - 1] !== "properties"
          ? "items"
          : "property",
    schema,
    value,
    resolved,
    resolvedValue,
    required,
    expandable,
    expanded,
    refName,
    recursive,
    refSegment: refBlockSegment(isRefRoot, insideRef, expanded),
    readOnly,
    sortable: !insideRef && parentPath[parentPath.length - 1] === "properties",
  };
  context.out.push(node);

  if (!expanded) return;

  const childInsideRef = insideRef || isRefRoot;
  const nextRefStack =
    isRefRoot && typeof schema.$ref === "string"
      ? [...context.refStack, schema.$ref]
      : context.refStack;
  const childContext: WalkContext = {
    ...context,
    refStack: nextRefStack,
    out: context.out,
  };

  const requiredSet = Array.isArray(resolved.required)
    ? new Set(resolved.required)
    : new Set<string>();
  const basePath = path;

  if (isPlainObject(resolved.properties)) {
    const keys = Object.keys(resolved.properties);
    for (const childKey of keys) {
      if (context.out.length >= context.maxRows) {
        context.overflow.hit = true;
        break;
      }
      walk(
        resolved.properties[childKey] as JSONSchema,
        childKey,
        [...basePath, "properties", childKey],
        [...basePath, "properties"],
        depth + 1,
        requiredSet.has(childKey),
        childInsideRef,
        childContext,
      );
    }
  }
  if (isPlainObject(resolved.items) || typeof resolved.items === "boolean") {
    walk(
      resolved.items as JSONSchema,
      "items",
      [...basePath, "items"],
      basePath,
      depth + 1,
      false,
      childInsideRef,
      childContext,
    );
  }

  for (const keyword of ["prefixItems", "allOf", "anyOf", "oneOf"] as const) {
    const entries = resolved[keyword];
    if (!Array.isArray(entries)) continue;
    for (let index = 0; index < entries.length; index++) {
      if (context.out.length >= context.maxRows) {
        context.overflow.hit = true;
        break;
      }
      walk(
        entries[index],
        `${keyword}[${index}]`,
        [...basePath, keyword, String(index)],
        [...basePath, keyword],
        depth + 1,
        false,
        childInsideRef,
        childContext,
      );
    }
  }

  // Close the ref block on the last emitted descendant.
  if (isRefRoot) {
    const last = context.out[context.out.length - 1];
    if (last && last !== node) last.refSegment = "tail";
  }
}

export interface FlattenResult {
  nodes: FlatNode[];
  overflow: boolean;
}

/** Walks only the expanded branches, bounded by `maxRows`. Never throws. */
export function flattenSchema(options: FlattenOptions): FlattenResult {
  const { root, onError } = options;
  return safeRun(
    "flatten",
    () => {
      const out: FlatNode[] = [];
      const overflow = { hit: false };
      const context: WalkContext = {
        ...options,
        maxRows: Number.isFinite(options.maxRows)
          ? Math.max(1, Math.floor(options.maxRows))
          : 5000,
        out,
        refStack: [],
        overflow,
      };

      if (!isPlainObject(root)) return { nodes: out, overflow: false };

      const requiredSet = Array.isArray(root.required)
        ? new Set(root.required)
        : new Set<string>();
      if (isPlainObject(root.properties)) {
        for (const key of Object.keys(root.properties)) {
          if (context.out.length >= context.maxRows) {
            context.overflow.hit = true;
            break;
          }
          walk(
            root.properties[key] as JSONSchema,
            key,
            ["properties", key],
            ["properties"],
            0,
            requiredSet.has(key),
            false,
            context,
          );
        }
      }
      if (isPlainObject(root.properties)) {
        for (const keyword of [
          "items",
          "prefixItems",
          "allOf",
          "anyOf",
          "oneOf",
        ] as const) {
          const value = root[keyword];
          const entries = Array.isArray(value)
            ? value
            : keyword === "items" &&
                (isPlainObject(value) || typeof value === "boolean")
              ? [value]
              : [];
          for (let index = 0; index < entries.length; index++) {
            const singleton = keyword === "items" && !Array.isArray(value);
            walk(
              entries[index],
              singleton ? keyword : `${keyword}[${index}]`,
              singleton ? [keyword] : [keyword, String(index)],
              singleton ? [] : [keyword],
              0,
              false,
              false,
              context,
            );
            if (context.overflow.hit) break;
          }
        }
      }
      if (
        !isPlainObject(root.properties) &&
        (root.type ||
          root.$ref ||
          root.items !== undefined ||
          root.prefixItems ||
          root.allOf ||
          root.anyOf ||
          root.oneOf)
      ) {
        walk(root, "", [], [], 0, false, false, context);
      }
      return { nodes: out, overflow: overflow.hit };
    },
    { nodes: [], overflow: false },
    onError,
  );
}

/* -------------------------------------------------------------------------- */
/* Expansion state maintenance                                                */
/* -------------------------------------------------------------------------- */

/** Drops expansion keys under a removed path. */
export function pruneExpanded(
  expanded: Set<string>,
  removedPath: string[],
): Set<string> {
  const prefix = pointerId(removedPath);
  let changed = false;
  const next = new Set<string>();
  for (const id of expanded) {
    if (id === prefix || id.startsWith(`${prefix}/`)) {
      changed = true;
      continue;
    }
    next.add(id);
  }
  return changed ? next : expanded;
}

/** Rewrites expansion keys after a rename so open branches stay open. */
export function remapExpanded(
  expanded: Set<string>,
  fromPath: string[],
  toPath: string[],
): Set<string> {
  const from = pointerId(fromPath);
  const to = pointerId(toPath);
  if (from === to) return expanded;

  let changed = false;
  const next = new Set<string>();
  for (const id of expanded) {
    if (id === from) {
      next.add(to);
      changed = true;
    } else if (id.startsWith(`${from}/`)) {
      next.add(`${to}${id.slice(from.length)}`);
      changed = true;
    } else {
      next.add(id);
    }
  }
  return changed ? next : expanded;
}

/**
 * The object that owns a property's `required` array.
 * Returns null when the node is not a member of a `properties` map,
 * for example array `items` or `patternProperties` entries.
 */
export function requiredOwnerPath(parentPath: string[]): string[] | null {
  if (parentPath.length === 0) return null;
  if (parentPath[parentPath.length - 1] !== "properties") return null;
  return parentPath.slice(0, -1);
}

export function stripUndefined(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = Object.create(null);
  for (const key of Object.keys(source)) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}
export function pointerId(path: readonly string[]): string {
  return path
    .map((segment) => segment.replace(/~/g, "~0").replace(/\//g, "~1"))
    .join("/");
}
