import type {
  Completion,
  CompletionContext,
  CompletionResult,
  CompletionSource,
} from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";
import { Decoration, type DecorationSet } from "@codemirror/view";
import {
  EndpointVariable,
  VariableTextPart,
  VariableTokenMatch,
  VariableTokenPresentation,
} from "./variableTextEditor.types";

/**
 * IMPORTANT SSR safety:
 * - Do not assume CSS global exists.
 * - Do not call CSS.supports in SSR where CSS may be undefined or mocked oddly.
 * - Return undefined when cannot validate.
 */
function validCssColorSSRSafe(value?: string): string | undefined {
  const candidate = value?.trim();
  if (!candidate || /[;{}\r\n]/.test(candidate)) return undefined;

  if (typeof CSS === "undefined") return candidate;

  try {
    if (typeof CSS.supports !== "function") return candidate;
    if (!CSS.supports("color", candidate)) return undefined;
  } catch {
    return undefined;
  }

  return candidate;
}

/**
 * Token name validation and parsing patterns.
 *
 * Requirements:
 * - support Unicode letters/numbers
 * - allow path-like separators: _ $ . -
 * - avoid whitespace
 */
export const VARIABLE_NAME_PATTERN = /^[\p{L}\p{N}_$.-]+$/u;
export const VARIABLE_NAME_PATTERN_STRICT = /^[\p{L}\p{N}_$.-]+$/u;

/**
 * Token syntax supports:
 * - {{name}}
 * - {name}
 */
export const VARIABLE_TOKEN_REGEX =
  /\{\{([\p{L}\p{N}_$.-]+)\}\}|\{([\p{L}\p{N}_$.-]+)\}/gu;

/**
 * Used for completion:
 * match the end of current line that is just after "{{" or "{".
 */
export const VARIABLE_QUERY_PATTERN = /(?:\{\{|\{)[\p{L}\p{N}_$.-]*$/u;

export function tokenTypeClass(type?: string): string {
  switch (type?.trim().toLowerCase()) {
    case "secret":
    case "environment":
    case "globals":
    case "collection":
    case "local":
    case "request":
    case "dynamic":
      return type.trim().toLowerCase();
    default:
      return "unknown";
  }
}

export function parseVariableNameFromToken(token: string): string | null {
  if (token.startsWith("{{") && token.endsWith("}}")) {
    const inner = token.slice(2, -2);
    return VARIABLE_NAME_PATTERN_STRICT.test(inner) ? inner : null;
  }
  if (token.startsWith("{") && token.endsWith("}")) {
    const inner = token.slice(1, -1);
    return VARIABLE_NAME_PATTERN_STRICT.test(inner) ? inner : null;
  }
  return null;
}

/**
 * Map variable name -> variable object.
 * "Last duplicate wins" to keep highlighting and completion stable.
 */
export function createVariableMap(
  variables: readonly EndpointVariable[],
): ReadonlyMap<string, EndpointVariable> {
  const result = new Map<string, EndpointVariable>();
  for (const variable of variables) {
    const name = variable.name?.trim();
    if (name && VARIABLE_NAME_PATTERN.test(name)) {
      result.set(
        name,
        name === variable.name ? variable : { ...variable, name },
      );
    }
  }
  return result;
}

export function findVariableTokens(
  text: string,
  variables: readonly EndpointVariable[],
): VariableTokenMatch[] {
  const variableMap = createVariableMap(variables);
  const matches: VariableTokenMatch[] = [];

  for (const match of text.matchAll(VARIABLE_TOKEN_REGEX)) {
    const full = match[0];
    const index = match.index;
    if (index == null) continue;

    const name = match[1] ?? match[2];
    if (!name) continue;
    if (!VARIABLE_NAME_PATTERN.test(name)) continue;

    matches.push({
      token: full,
      name,
      from: index,
      to: index + full.length,
      variable: variableMap.get(name),
    });
  }
  return matches;
}

export function splitVariableText(
  text: string,
  variables: readonly EndpointVariable[],
): VariableTextPart[] {
  const parts: VariableTextPart[] = [];
  const tokens = findVariableTokens(text, variables);

  let cursor = 0;
  for (const token of tokens) {
    if (token.from > cursor) {
      parts.push({
        key: `text-${cursor}-${token.from}`,
        text: text.slice(cursor, token.from),
      });
    }
    parts.push({
      key: `token-${token.from}-${token.to}`,
      text: token.token,
      token,
    });
    cursor = token.to;
  }

  if (cursor < text.length) {
    parts.push({
      key: `text-${cursor}-${text.length}`,
      text: text.slice(cursor),
    });
  }
  return parts;
}

export function getTokenPresentation(
  variable: EndpointVariable | undefined,
  classes: Readonly<Record<string, string>>,
): VariableTokenPresentation {
  const type = variable ? tokenTypeClass(variable.type) : "unknown";
  const className = [classes.variableToken, classes[`variableToken_${type}`]]
    .filter(Boolean)
    .join(" ");

  const color = validCssColorSSRSafe(variable?.color);
  const bgColor = validCssColorSSRSafe(variable?.backgroundColor);

  return {
    className,
    tokenColor: color,
    tokenBgColor: bgColor,
  };
}

/**
 * Create decorations for tokens.
 *
 * REQUIRED for your hover matching:
 * We add data-variable-from/to attributes for exact instance matching.
 */
export function createTokenDecorations(
  state: EditorState,
  variables: readonly EndpointVariable[],
  classes: Readonly<Record<string, string>>,
  tokens?: readonly VariableTokenMatch[],
): DecorationSet {
  const docText = state.doc.toString();
  const docLength = state.doc.length;
  const useTokens = tokens ?? findVariableTokens(docText, variables);

  const ranges = useTokens
    .filter((match) => {
      return match.from < docLength && match.to > match.from;
    })
    .map((match) => {
      const safeFrom = Math.max(0, Math.min(match.from, docLength));
      const safeTo = Math.max(safeFrom, Math.min(match.to, docLength));

      const presentation = getTokenPresentation(match.variable, classes);
      const styleParts: string[] = [];
      if (presentation.tokenColor)
        styleParts.push(`color:${presentation.tokenColor}`);
      if (presentation.tokenBgColor)
        styleParts.push(`background-color:${presentation.tokenBgColor}`);
      const styleStr = styleParts.join(";");
      const attrs: Record<string, string> = {
        "data-variable-name": match.name,
        "data-variable-from": String(safeFrom),
        "data-variable-to": String(safeTo),
        "data-variable-defined": match.variable ? "true" : "false",
      };
      if (styleStr) {
        attrs.style = styleStr;
      }
      return Decoration.mark({
        class: presentation.className,
        attributes: attrs,
      }).range(safeFrom, safeTo);
    });

  return Decoration.set(ranges, true);
}

export function tokenAtPosition(
  tokens: readonly VariableTokenMatch[],
  position: number,
): VariableTokenMatch | undefined {
  let low = 0;
  let high = tokens.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const token = tokens[middle];
    if (position < token.from) high = middle - 1;
    else if (position >= token.to) low = middle + 1;
    else return token;
  }
  return undefined;
}

/**
 * Completion source:
 * suggest variable names when cursor is just after "{" or "{{".
 *
 * Caller should recreate this completion source when variables change.
 */
export function createVariableCompletionSource(
  variables: readonly EndpointVariable[],
): CompletionSource {
  const variableMap = createVariableMap(variables);
  // Precompute immutable completion metadata once per variable snapshot.
  const candidates = [...variableMap.values()].map((variable) => ({
    label: variable.name,
    search: variable.name.toLowerCase(),
    type: "variable",
    detail: variable.type ?? "Variable",
    info: variable.description,
  }));

  return (context: CompletionContext): CompletionResult | null => {
    const lineBeforeCursor = context.state.sliceDoc(
      context.state.doc.lineAt(context.pos).from,
      context.pos,
    );

    const match = lineBeforeCursor.match(VARIABLE_QUERY_PATTERN);
    if (!match) return null;

    const matchedText = match[0];
    const doubleBrace = matchedText.startsWith("{{");
    const openerLength = doubleBrace ? 2 : 1;

    const query = matchedText.slice(openerLength).toLowerCase();
    const from = context.pos - matchedText.length + openerLength;

    const closing = doubleBrace ? "}}" : "}";
    const options: Completion[] = candidates
      .filter((candidate) => candidate.search.includes(query))
      .map(({ search: _search, ...candidate }) => ({
        ...candidate,
        apply: `${candidate.label}${closing}`,
      }));
    const suffix = context.state.sliceDoc(
      context.pos,
      context.pos + closing.length,
    );
    let existingClosing = 0;
    while (existingClosing < suffix.length && suffix[existingClosing] === "}")
      existingClosing += 1;

    if (!options.length) return null;

    return {
      from,
      to: context.pos + existingClosing,
      options,
      filter: true,
      validFor: /^[\p{L}\p{N}_$.-]*$/u,
    };
  };
}

export function normalizeMaximumLength(value?: number): number {
  if (value === undefined || !Number.isFinite(value)) return 16_384;
  return Math.max(1, Math.min(Math.floor(value), 1_000_000));
}

/** Keep single-line by replacing newlines with spaces and enforce maxLength. */
export function sanitizePlainText(
  text: string,
  maxLength = Infinity,
  allowLineBreaks = false,
): string {
  const limit = Number.isFinite(maxLength)
    ? Math.max(0, Math.floor(maxLength))
    : Infinity;

  const source = limit === Infinity ? text : text.slice(0, limit);

  if (allowLineBreaks) return source;

  return source.replace(/[\r\n\u2028\u2029]+/g, " ");
}

export function truncateInsertion(
  insertedText: string,
  currentLength: number,
  replacedLength: number,
  maxLength: number,
): string {
  const available = Math.max(
    0,
    maxLength - Math.max(0, currentLength - replacedLength),
  );
  return insertedText.slice(0, available);
}

export function clampSelection(
  anchor: number,
  head: number,
  maxDocLength: number,
) {
  const max = Math.max(0, maxDocLength);
  const clamp = (position: number) => Math.max(0, Math.min(position, max));
  return { anchor: clamp(anchor), head: clamp(head) };
}

export function escapeCssAttrValue(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function createMinimalChange(oldText: string, newText: string) {
  let prefix = 0;
  const commonLength = Math.min(oldText.length, newText.length);
  while (
    prefix < commonLength &&
    oldText.charCodeAt(prefix) === newText.charCodeAt(prefix)
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < oldText.length - prefix &&
    suffix < newText.length - prefix &&
    oldText.charCodeAt(oldText.length - 1 - suffix) ===
      newText.charCodeAt(newText.length - 1 - suffix)
  ) {
    suffix += 1;
  }
  return {
    from: prefix,
    to: oldText.length - suffix,
    insert: newText.slice(prefix, newText.length - suffix),
  };
}
