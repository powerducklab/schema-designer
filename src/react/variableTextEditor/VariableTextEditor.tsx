"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";


import {
  acceptCompletion,
  completionKeymap,
  autocompletion,
} from "@codemirror/autocomplete";

import { history, historyKeymap, defaultKeymap } from "@codemirror/commands";

import {
  Annotation,
  Compartment,
  EditorState,
  type Extension,
} from "@codemirror/state";

import {
  drawSelection,
  EditorView,
  placeholder as editorPlaceholder,
  keymap,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
  Decoration,
} from "@codemirror/view";

import type {
  EndpointVariable,
  VariableTextEditorProps,
  VariableTokenMatch,
} from "./libs/variableTextEditor.types";

import {
  createTokenDecorations,
  createVariableCompletionSource,
  findVariableTokens,
  normalizeMaximumLength,
  sanitizePlainText,
  tokenAtPosition,
  truncateInsertion,
  escapeCssAttrValue,
} from "./libs/variableTextEditor.utils";

import styles from "./VariableTextEditor.module.css";

const EMPTY_VARIABLES: readonly EndpointVariable[] = Object.freeze([]);

const TOKEN_SELECTOR = `.${styles.variableToken}`;

const HOVER_OPEN_DELAY = 260;
const HOVER_CLOSE_DELAY = 50;

const POPOVER_GAP = 14;
const VIEWPORT_MARGIN = 12;

const POPOVER_MAX_WIDTH = 360;
const POPOVER_FALLBACK_HEIGHT = 200;

const MAX_PENDING_CONTROLLED_VALUES = 16;

const ExternalValueUpdate = Annotation.define<boolean>();

/**
 * Forces the decoration plugin to observe an external variables snapshot
 * update without rebuilding the whole decoration extension.
 */
const VariablesSnapshotUpdate = Annotation.define<number>();

interface HoverState {
  tokenKey: string;
  rect: DOMRect;
  from: number;
  to: number;
  name: string;
  variable?: EndpointVariable;
}

interface PopoverPosition {
  left: number;
  top: number;
  placement: "top" | "bottom";
  arrowLeft: number;
}

interface PointerSnapshot {
  clientX: number;
  clientY: number;
}

interface VariableSnapshot {
  variables: readonly EndpointVariable[];
  version: number;
}

interface TokenIndexCache {
  doc: string;
  variablesVersion: number;
  tokens: readonly VariableTokenMatch[];
}

/**
 * Compare variable definitions by semantic content.
 *
 * This intentionally does not rely on array identity because React parents
 * frequently create a fresh array on every render.
 */
function variablesEqual(
  a: readonly EndpointVariable[],
  b: readonly EndpointVariable[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; i += 1) {
    const left = a[i];
    const right = b[i];

    if (
      left.name !== right.name ||
      left.value !== right.value ||
      left.description !== right.description ||
      left.type !== right.type ||
      left.color !== right.color ||
      left.backgroundColor !== right.backgroundColor
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Merge overlapping/adjacent ranges.
 *
 * All ranges are expressed in the same document coordinate space.
 */
function mergeRanges(
  ranges: readonly { from: number; to: number }[],
): { from: number; to: number }[] {
  if (ranges.length <= 1) return ranges.slice();

  const sorted = ranges
    .filter((range) => range.to > range.from)
    .slice()
    .sort((a, b) => {
      if (a.from !== b.from) return a.from - b.from;
      return a.to - b.to;
    });

  if (sorted.length <= 1) return sorted;

  const result: { from: number; to: number }[] = [];

  let current = {
    from: sorted[0].from,
    to: sorted[0].to,
  };

  for (let i = 1; i < sorted.length; i += 1) {
    const next = sorted[i];

    if (next.from <= current.to) {
      current.to = Math.max(current.to, next.to);
      continue;
    }

    result.push(current);
    current = {
      from: next.from,
      to: next.to,
    };
  }

  result.push(current);

  return result;
}

/**
 * Transaction-level invariant enforcement.
 *
 * Important:
 * - The original transaction is preserved.
 * - Invalid content is removed by a second sequential change.
 * - We do NOT construct a fresh EditorState/Transaction from scratch.
 * - This preserves CodeMirror's original transaction metadata/history semantics.
 *
 * Single-line behavior:
 *   "\n" is rejected, not converted to " ".
 *
 * Paste/drop behavior is handled separately by DOM event handlers and can
 * intentionally normalize newlines to spaces.
 */
function createInputInvariantFilter(
  maxLengthRef: { current: number },
  allowLineBreaksRef: { current: boolean },
  isComposingRef: { current: boolean },
): Extension {
  return EditorState.transactionFilter.of((transaction) => {
    if (!transaction.docChanged) {
      return transaction;
    }

    /**
     * Do not rewrite text while an IME composition is active.
     *
     * Composition transactions are browser/IME controlled and modifying them
     * synchronously can corrupt composition state.
     */
    if (isComposingRef.current) {
      return transaction;
    }

    const newDoc = transaction.newDoc;

    const invalidRanges: { from: number; to: number }[] = [];

    /**
     * Single-line invariant.
     *
     * We intentionally delete line separators at transaction level.
     * Enter therefore cannot become a space through the React controlled
     * value round-trip.
     */
    if (!allowLineBreaksRef.current) {
      const text = newDoc.toString();

      const newlineRegex = /[\r\n\u2028\u2029]+/g;

      let match: RegExpExecArray | null;

      while ((match = newlineRegex.exec(text)) !== null) {
        const from = match.index;
        const to = from + match[0].length;

        invalidRanges.push({ from, to });
      }
    }

    /**
     * Maximum document length invariant.
     *
     * Positions here are in transaction.newDoc coordinates.
     * The additional spec below is sequential, so these positions are
     * intentionally based on the document produced by the original
     * transaction.
     */
    const limit = maxLengthRef.current;

    if (Number.isFinite(limit) && newDoc.length > limit) {
      invalidRanges.push({
        from: Math.max(0, Math.floor(limit)),
        to: newDoc.length,
      });
    }

    if (invalidRanges.length === 0) {
      return transaction;
    }

    const merged = mergeRanges(invalidRanges);

    return [
      transaction,
      {
        changes: merged.map(({ from, to }) => ({
          from,
          to,
          insert: "",
        })),
        sequential: true,
      },
    ];
  });
}

/** Keep decorations in the same transaction as their document positions. */
class VariableDecorationPlugin {
  decorations: DecorationSet = Decoration.none;

  constructor(
    view: EditorView,
    private readonly getSnapshot: () => VariableSnapshot,
    private readonly tokenIndexRef: { current: TokenIndexCache },
    private readonly classes: Readonly<Record<string, string>>,
  ) {
    this.rebuild(view.state);
  }

  private rebuild(state: EditorState): void {
    const snapshot = this.getSnapshot();
    const doc = state.doc.toString();
    const tokens = findVariableTokens(doc, snapshot.variables);
    this.tokenIndexRef.current = {
      doc,
      variablesVersion: snapshot.version,
      tokens,
    };
    this.decorations = createTokenDecorations(
      state,
      snapshot.variables,
      this.classes,
      tokens,
    );
  }

  update(update: ViewUpdate): void {
    if (
      update.docChanged ||
      update.transactions.some(
        (transaction) =>
          transaction.annotation(VariablesSnapshotUpdate) !== undefined,
      )
    )
      this.rebuild(update.state);
  }
}

function createVariableDecorationExtension(
  snapshotRef: { current: VariableSnapshot },
  tokenIndexRef: { current: TokenIndexCache },
): Extension {
  const getSnapshot = () => snapshotRef.current;

  const plugin = ViewPlugin.fromClass(
    class extends VariableDecorationPlugin {
      constructor(view: EditorView) {
        super(view, getSnapshot, tokenIndexRef, styles);
      }
    },
    {
      decorations: (plugin: VariableDecorationPlugin) => plugin.decorations,
    },
  );
  return plugin;
}

function createVariableCompletionExtension(
  variables: readonly EndpointVariable[],
): Extension {
  return autocompletion({
    override: [createVariableCompletionSource(variables)],
    activateOnTyping: true,
    defaultKeymap: false,
  });
}

export const VariableTextEditor: React.FC<VariableTextEditorProps> = memo(
  (props) => {
    const {
      value,
      variables: variablesProp,
      disabled = false,
      readOnly = false,
      placeholder = "",
      ariaLabel = "Variable text editor",
      className,
      autoFocus = false,
      submitOnEnter = false,
      minHeight = 32,
      expansionMode = "inline",
      safePadding = 8,
      maxFocusedHeight = 320,
      maxLength,
      allowLineBreaks = false,
      onChange,
      onSubmit,
      onFocus,
      onBlur,
    } = props;

    const variables = variablesProp ?? EMPTY_VARIABLES;

    const safeMaxLength = normalizeMaximumLength(maxLength);

    const normalizedValue = sanitizePlainText(
      value,
      safeMaxLength,
      allowLineBreaks,
    );

    const safeMinHeight = Number.isFinite(minHeight)
      ? Math.max(24, Math.round(minHeight))
      : 32;

    const safeMaxHeight = Number.isFinite(maxFocusedHeight)
      ? Math.max(safeMinHeight, Math.round(maxFocusedHeight))
      : Math.max(safeMinHeight, 320);

    const hostRef = useRef<HTMLDivElement | null>(null);
    const tooltipRef = useRef<HTMLDivElement | null>(null);
    const viewRef = useRef<EditorView | null>(null);

    const destroyedRef = useRef(false);
    const isComposingRef = useRef(false);

    const pendingCompositionSyncRef = useRef(false);

    /**
     * Initial value only.
     *
     * This ref must NOT be continuously overwritten with controlled props,
     * otherwise it becomes impossible to distinguish a stale parent value
     * from a real external value update.
     */
    const initialValueRef = useRef(normalizedValue);

    /**
     * Latest document value actually present in CodeMirror.
     */
    const editorValueRef = useRef(normalizedValue);

    /**
     * Last parent value that we have acknowledged as current.
     *
     * This is the key to preventing:
     *
     *   user types "abc"
     *   parent still has "ab"
     *   React render
     *   editor gets overwritten back to "ab"
     */
    const lastAcknowledgedPropValueRef = useRef(normalizedValue);

    /**
     * Values emitted by the editor but not yet acknowledged by the parent.
     *
     * This allows the parent to update asynchronously without clobbering
     * newer local edits.
     */
    const pendingEmittedValuesRef = useRef<string[]>([]);

    const [hover, setHover] = useState<HoverState | null>(null);

    const hoverRef = useRef<HoverState | null>(null);

    const [focused, setFocused] = useState(false);
    const focusedRef = useRef(false);

    const [focusedHeight, setFocusedHeight] = useState(safeMinHeight);

    const focusedHeightRef = useRef(safeMinHeight);

    const [wrapped, setWrapped] = useState(false);
    const wrappedRef = useRef(false);

    const anchorRef = useRef<HTMLDivElement>(null);
    const [overlayStyle, setOverlayStyle] = useState<CSSProperties>();

    useLayoutEffect(() => {
      if (!focused || expansionMode !== "overlay") {
        setOverlayStyle(undefined);
        return;
      }
      let frame = 0;
      const position = () => {
        frame = 0;
        const anchor = anchorRef.current;
        if (!anchor) return;
        const rect = anchor.getBoundingClientRect();
        if (rect.bottom <= 0 || rect.top >= window.innerHeight) {
          viewRef.current?.contentDOM.blur();
          return;
        }
        const height = Math.min(focusedHeight, window.innerHeight - 16);
        const top = Math.max(
          8,
          Math.min(rect.top, window.innerHeight - height - 8),
        );
        setOverlayStyle({
          position: "fixed",
          top,
          left: Math.max(8, rect.left),
          width: Math.min(
            rect.width,
            window.innerWidth - Math.max(8, rect.left) - 8,
          ),
          maxHeight: Math.max(safeMinHeight, window.innerHeight - top - 8),
          zIndex: 1100,
        });
      };
      const schedule = () => {
        if (!frame) frame = requestAnimationFrame(position);
      };
      position();
      window.addEventListener("scroll", schedule, true);
      window.addEventListener("resize", schedule);
      const observer =
        typeof ResizeObserver === "undefined"
          ? null
          : new ResizeObserver(schedule);
      if (anchorRef.current) observer?.observe(anchorRef.current);
      return () => {
        cancelAnimationFrame(frame);
        observer?.disconnect();
        window.removeEventListener("scroll", schedule, true);
        window.removeEventListener("resize", schedule);
      };
    }, [focused, expansionMode, focusedHeight, safeMinHeight]);

    const [popoverPosition, setPopoverPosition] =
      useState<PopoverPosition | null>(null);

    const activeTokenKeyRef = useRef<string | null>(null);

    const lastPointerTokenKeyRef = useRef<string | null>(null);

    const openTimerRef = useRef<number | null>(null);
    const closeTimerRef = useRef<number | null>(null);

    const frameRef = useRef<number | null>(null);

    const pointerRafRef = useRef<number | null>(null);

    const repositionRafRef = useRef<number | null>(null);

    const resizeObserverRef = useRef<ResizeObserver | null>(null);

    const tooltipResizeObserverRef = useRef<ResizeObserver | null>(null);

    const pointerInEditorRef = useRef(false);
    const pointerInPopoverRef = useRef(false);

    const markPopoverPointerDownUntilRef = useRef(0);

    const variablesSnapshotRef = useRef<VariableSnapshot>({
      variables,
      version: 1,
    });

    const disabledRef = useRef(disabled);
    const readOnlyRef = useRef(readOnly);
    const submitOnEnterRef = useRef(submitOnEnter);
    const allowLineBreaksRef = useRef(allowLineBreaks);

    const maxLengthRef = useRef(safeMaxLength);

    const onChangeRef = useRef(onChange);
    const onSubmitRef = useRef(onSubmit);
    const onFocusRef = useRef(onFocus);
    const onBlurRef = useRef(onBlur);

    const editableCompartmentRef = useRef(new Compartment());

    const variableDecorationCompartmentRef = useRef(new Compartment());

    const variableCompletionCompartmentRef = useRef(new Compartment());

    const placeholderCompartmentRef = useRef(new Compartment());

    const ariaCompartmentRef = useRef(new Compartment());

    const wrappingCompartmentRef = useRef(new Compartment());

    const tokenIndexRef = useRef<TokenIndexCache>({
      doc: normalizedValue,
      variablesVersion: variablesSnapshotRef.current.version,
      tokens: [],
    });

    const pendingPointerRef = useRef<PointerSnapshot | null>(null);

    const rootStyle = useMemo(
      () =>
        ({
          "--editor-min-height": `${safeMinHeight}px`,
          "--editor-max-focused-height": `${safeMaxHeight}px`,
          "--editor-padding-block": `${Number.isFinite(safePadding) ? Math.max(0, safePadding) : 8}px`,
          "--editor-focused-height": `${focusedHeight}px`,
        }) as CSSProperties,
      [focusedHeight, safeMaxHeight, safeMinHeight, safePadding],
    );

    const sameRect = useCallback(
      (a: DOMRect, b: DOMRect, eps = 0.01): boolean => {
        return (
          Math.abs(a.left - b.left) < eps &&
          Math.abs(a.top - b.top) < eps &&
          Math.abs(a.width - b.width) < eps &&
          Math.abs(a.height - b.height) < eps
        );
      },
      [],
    );

    useEffect(() => {
      focusedHeightRef.current = focusedHeight;
    }, [focusedHeight]);

    useEffect(() => {
      wrappedRef.current = wrapped;
    }, [wrapped]);

    const cancelOpen = useCallback(() => {
      if (openTimerRef.current !== null) {
        window.clearTimeout(openTimerRef.current);

        openTimerRef.current = null;
      }
    }, []);

    const cancelClose = useCallback(() => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);

        closeTimerRef.current = null;
      }
    }, []);

    const cancelFrame = useCallback(() => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);

        frameRef.current = null;
      }
    }, []);

    const cancelRepositionFrame = useCallback(() => {
      if (repositionRafRef.current !== null) {
        window.cancelAnimationFrame(repositionRafRef.current);

        repositionRafRef.current = null;
      }
    }, []);

    const commitHover = useCallback(
      (next: HoverState | null) => {
        if (destroyedRef.current) {
          return;
        }

        const current = hoverRef.current;

        if (!current && !next) {
          return;
        }

        if (
          current &&
          next &&
          current.tokenKey === next.tokenKey &&
          sameRect(current.rect, next.rect)
        ) {
          return;
        }

        hoverRef.current = next;
        activeTokenKeyRef.current = next?.tokenKey ?? null;

        setHover(next);

        if (!next) {
          setPopoverPosition(null);
        }
      },
      [sameRect],
    );

    const closeHover = useCallback(() => {
      cancelOpen();
      cancelClose();
      cancelRepositionFrame();
      commitHover(null);
    }, [cancelClose, cancelOpen, cancelRepositionFrame, commitHover]);

    const markPopoverPointerDown = useCallback(() => {
      markPopoverPointerDownUntilRef.current = Date.now() + 150;
    }, []);

    const requestFinalClose = useCallback(() => {
      cancelClose();

      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;

        if (destroyedRef.current) {
          return;
        }

        if (Date.now() < markPopoverPointerDownUntilRef.current) {
          return;
        }

        const shouldClose =
          !pointerInEditorRef.current &&
          !pointerInPopoverRef.current &&
          !focusedRef.current;

        if (!shouldClose) {
          return;
        }

        closeHover();

        setWrapped(false);
        setFocusedHeight(safeMinHeight);
      }, HOVER_CLOSE_DELAY);
    }, [cancelClose, closeHover, safeMinHeight]);

    const scheduleClose = useCallback(() => {
      cancelClose();

      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;

        if (destroyedRef.current) {
          return;
        }

        if (Date.now() < markPopoverPointerDownUntilRef.current) {
          return;
        }

        if (tooltipRef.current?.matches(":hover, :focus-within")) {
          return;
        }

        commitHover(null);
      }, HOVER_CLOSE_DELAY);
    }, [cancelClose, commitHover]);

    const getTokensCurrent = useCallback(
      (view: EditorView): readonly VariableTokenMatch[] => {
        const doc = view.state.doc.toString();

        const snapshot = variablesSnapshotRef.current;

        const cached = tokenIndexRef.current;

        if (
          cached.doc === doc &&
          cached.variablesVersion === snapshot.version
        ) {
          return cached.tokens;
        }

        const tokens = findVariableTokens(doc, snapshot.variables);

        tokenIndexRef.current = {
          doc,
          variablesVersion: snapshot.version,
          tokens,
        };

        return tokens;
      },
      [],
    );

    const getTokenAtPointer = useCallback(
      (snapshot: PointerSnapshot): VariableTokenMatch | null => {
        const view = viewRef.current;

        if (destroyedRef.current || !view) {
          return null;
        }

        const tokens = getTokensCurrent(view);

        if (!tokens.length) {
          return null;
        }

        const pos = view.posAtCoords({
          x: snapshot.clientX,
          y: snapshot.clientY,
        });

        if (pos == null) {
          return null;
        }

        return tokenAtPosition(tokens, pos) ?? null;
      },
      [getTokensCurrent],
    );

    const fullLineTokenRectFromView = useCallback(
      (view: EditorView, from: number, to: number): DOMRect | null => {
        if (view.state.doc.length === 0) return null;
        const host = view.dom;

        const selector =
          `${TOKEN_SELECTOR}` +
          `[data-variable-from="${escapeCssAttrValue(String(from))}"]` +
          `[data-variable-to="${escapeCssAttrValue(String(to))}"]`;

        const element = host.querySelector(selector) as HTMLElement | null;

        if (element) {
          const tokenRect = element.getBoundingClientRect();

          const lineElement = element.closest(".cm-line") as HTMLElement | null;

          const lineRect = lineElement?.getBoundingClientRect();

          const editorRect = view.dom.getBoundingClientRect();

          const top = Math.max(editorRect.top, lineRect?.top ?? tokenRect.top);

          const bottom = Math.min(
            editorRect.bottom,
            lineRect?.bottom ?? tokenRect.bottom,
          );

          const height = Math.max(tokenRect.height, bottom - top);

          const width = tokenRect.width;

          if (width <= 0 || height <= 0) {
            return null;
          }

          return new DOMRect(tokenRect.left, top, width, height);
        }

        const startCoords = view.coordsAtPos(from);

        const endCoords = view.coordsAtPos(to);

        if (!startCoords || !endCoords) {
          return null;
        }

        const left = startCoords.left;

        const right = endCoords.right;

        const top = Math.min(startCoords.top, endCoords.top);

        const bottom = Math.max(startCoords.bottom, endCoords.bottom);

        const width = right - left;

        const height = bottom - top;

        if (width <= 0 || height <= 0) {
          return null;
        }

        return new DOMRect(left, top, width, height);
      },
      [],
    );

    const buildHoverFromToken = useCallback(
      (view: EditorView, token: VariableTokenMatch): HoverState | null => {
        if (destroyedRef.current) {
          return null;
        }

        const rect = fullLineTokenRectFromView(view, token.from, token.to);

        if (!rect || rect.width <= 0 || rect.height <= 0) {
          return null;
        }

        const tokenKey = `${token.from}:${token.to}:${token.name}`;

        return {
          tokenKey,
          rect,
          from: token.from,
          to: token.to,
          name: token.name,
          variable: token.variable,
        };
      },
      [fullLineTokenRectFromView],
    );

    const showToken = useCallback(
      (token: VariableTokenMatch) => {
        if (destroyedRef.current) {
          return;
        }

        const view = viewRef.current;

        if (!view || disabledRef.current) {
          return;
        }

        const nextHover = buildHoverFromToken(view, token);

        if (!nextHover) {
          closeHover();
          return;
        }

        if (
          activeTokenKeyRef.current === nextHover.tokenKey &&
          hoverRef.current &&
          hoverRef.current.tokenKey === nextHover.tokenKey &&
          sameRect(hoverRef.current.rect, nextHover.rect)
        ) {
          return;
        }

        commitHover(nextHover);
      },
      [buildHoverFromToken, closeHover, commitHover, sameRect],
    );

    const scheduleOpen = useCallback(
      (snapshot: PointerSnapshot, token: VariableTokenMatch) => {
        cancelClose();
        cancelOpen();

        openTimerRef.current = window.setTimeout(() => {
          openTimerRef.current = null;

          if (destroyedRef.current) {
            return;
          }

          const view = viewRef.current;

          if (!view || disabledRef.current) {
            return;
          }

          const tokens = getTokensCurrent(view);

          const latest = tokens.find(
            (candidate) =>
              candidate.from === token.from &&
              candidate.to === token.to &&
              candidate.token === token.token,
          );

          if (!latest) {
            return;
          }

          /**
           * Re-read the pointer position before opening.
           *
           * This prevents an old queued pointer snapshot from opening a
           * tooltip after the pointer already moved elsewhere.
           */
          const latestToken = getTokenAtPointer(snapshot);

          if (
            !latestToken ||
            latestToken.from !== latest.from ||
            latestToken.to !== latest.to
          ) {
            return;
          }

          showToken(latest);
        }, HOVER_OPEN_DELAY);
      },
      [cancelClose, cancelOpen, getTokenAtPointer, getTokensCurrent, showToken],
    );

    const flushPointer = useCallback(() => {
      pointerRafRef.current = null;

      const snapshot = pendingPointerRef.current;

      pendingPointerRef.current = null;

      if (!snapshot || destroyedRef.current) {
        return;
      }

      pointerInEditorRef.current = true;

      const token = getTokenAtPointer(snapshot);

      if (token) {
        const tokenKey = `${token.from}:${token.to}:${token.name}`;

        if (lastPointerTokenKeyRef.current !== tokenKey) {
          lastPointerTokenKeyRef.current = tokenKey;

          scheduleOpen(snapshot, token);
        } else if (!hoverRef.current) {
          scheduleOpen(snapshot, token);
        }

        return;
      }

      lastPointerTokenKeyRef.current = null;

      if (hoverRef.current) {
        requestFinalClose();
      } else {
        cancelOpen();
      }
    }, [cancelOpen, getTokenAtPointer, requestFinalClose, scheduleOpen]);

    const schedulePointerFlush = useCallback(
      (event: ReactPointerEvent) => {
        /**
         * Never keep the React SyntheticEvent itself alive.
         * Only copy the two coordinates we need.
         */
        pendingPointerRef.current = {
          clientX: event.clientX,
          clientY: event.clientY,
        };

        if (pointerRafRef.current !== null) {
          return;
        }

        pointerRafRef.current = window.requestAnimationFrame(flushPointer);
      },
      [flushPointer],
    );

    const handlePointerMove = useCallback(
      (event: ReactPointerEvent) => {
        schedulePointerFlush(event);
      },
      [schedulePointerFlush],
    );

    const handleHostPointerEnter = useCallback(() => {
      pointerInEditorRef.current = true;
    }, []);

    const handleHostPointerLeave = useCallback(() => {
      pointerInEditorRef.current = false;

      cancelOpen();
      requestFinalClose();
    }, [cancelOpen, requestFinalClose]);

    const handleTooltipPointerEnter = useCallback(() => {
      pointerInPopoverRef.current = true;
      cancelClose();
    }, [cancelClose]);

    const handleTooltipPointerLeave = useCallback(() => {
      pointerInPopoverRef.current = false;
      requestFinalClose();
    }, [requestFinalClose]);

    const measureFocusedHeight = useCallback(() => {
      if (destroyedRef.current || !focusedRef.current) {
        return;
      }

      const expectedView = viewRef.current;

      if (!expectedView) {
        return;
      }

      if (frameRef.current !== null) {
        return;
      }

      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;

        if (destroyedRef.current) {
          return;
        }

        if (viewRef.current !== expectedView) {
          return;
        }

        if (!focusedRef.current) {
          return;
        }

        const content = expectedView.contentDOM;

        const measuredRaw = Math.max(
          safeMinHeight,
          Math.ceil(content.scrollHeight),
        );

        // Ignore subpixel rounding at the single-line boundary; real wrapping still expands.
        const stableHeight =
          measuredRaw <= safeMinHeight + 2 ? safeMinHeight : measuredRaw;
        const nextHeight = Math.min(stableHeight, safeMaxHeight);

        const nextWrapped = stableHeight > safeMinHeight;

        const currentHeight = focusedHeightRef.current;

        const currentWrapped = wrappedRef.current;

        if (nextHeight === currentHeight && nextWrapped === currentWrapped) {
          return;
        }

        focusedHeightRef.current = nextHeight;

        wrappedRef.current = nextWrapped;

        setFocusedHeight(nextHeight);

        setWrapped(nextWrapped);
      });
    }, [safeMaxHeight, safeMinHeight]);

    /**
     * Calculate the popover position from the REAL popover dimensions.
     */
    const calculatePopoverPosition = useCallback(
      (rect: DOMRect, width: number, height: number): PopoverPosition => {
        const safeWidth = Math.min(
          POPOVER_MAX_WIDTH,
          Math.max(1, window.innerWidth - VIEWPORT_MARGIN * 2),
        );

        const actualWidth = Math.min(
          safeWidth,
          Math.max(1, width || safeWidth),
        );

        const actualHeight = Math.max(1, height || POPOVER_FALLBACK_HEIGHT);

        const tokenCenter = rect.left + rect.width / 2;

        const left = Math.max(
          VIEWPORT_MARGIN,
          Math.min(
            tokenCenter - actualWidth / 2,
            window.innerWidth - actualWidth - VIEWPORT_MARGIN,
          ),
        );

        const canPlaceBelow =
          rect.bottom + POPOVER_GAP + actualHeight <=
          window.innerHeight - VIEWPORT_MARGIN;

        const canPlaceAbove =
          rect.top - POPOVER_GAP - actualHeight >= VIEWPORT_MARGIN;

        const showAbove = !canPlaceBelow && canPlaceAbove;

        const top = showAbove
          ? Math.max(VIEWPORT_MARGIN, rect.top - actualHeight - POPOVER_GAP)
          : Math.min(
              Math.max(VIEWPORT_MARGIN, rect.bottom + POPOVER_GAP),
              Math.max(
                VIEWPORT_MARGIN,
                window.innerHeight - actualHeight - VIEWPORT_MARGIN,
              ),
            );

        return {
          left,
          top,
          placement: showAbove ? "top" : "bottom",
          arrowLeft: Math.max(
            12,
            Math.min(tokenCenter - left, actualWidth - 12),
          ),
        };
      },
      [],
    );

    const repositionPopover = useCallback(() => {
      if (destroyedRef.current) {
        return;
      }

      const currentHover = hoverRef.current;

      if (!currentHover) {
        return;
      }

      const tooltip = tooltipRef.current;

      const rect = currentHover.rect;

      const tooltipRect = tooltip?.getBoundingClientRect();

      const width =
        tooltipRect?.width ||
        Math.min(POPOVER_MAX_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2);

      const height = tooltipRect?.height || POPOVER_FALLBACK_HEIGHT;

      const next = calculatePopoverPosition(rect, width, height);

      setPopoverPosition((previous) => {
        if (
          previous &&
          previous.left === next.left &&
          previous.top === next.top &&
          previous.placement === next.placement &&
          previous.arrowLeft === next.arrowLeft
        ) {
          return previous;
        }

        return next;
      });
    }, [calculatePopoverPosition]);

    const schedulePopoverReposition = useCallback(() => {
      if (repositionRafRef.current !== null) {
        return;
      }

      repositionRafRef.current = window.requestAnimationFrame(() => {
        repositionRafRef.current = null;

        repositionPopover();
      });
    }, [repositionPopover]);

    const applyExternalValue = useCallback(
      (view: EditorView, nextValue: string): boolean => {
        if (destroyedRef.current || viewRef.current !== view) {
          return false;
        }

        const currentDoc = view.state.doc.toString();

        if (currentDoc === nextValue) {
          editorValueRef.current = currentDoc;

          return false;
        }

        closeHover();

        /**
         * IMPORTANT:
         *
         * Do not explicitly set selection here.
         *
         * CodeMirror automatically maps the current selection through
         * the external ChangeSet. This is much safer than manually taking
         * the old selection and forcing it back into the new document.
         */
        view.dispatch({
          changes: {
            from: 0,
            to: currentDoc.length,
            insert: nextValue,
          },
          annotations: ExternalValueUpdate.of(true),
        });

        editorValueRef.current = nextValue;

        return true;
      },
      [closeHover],
    );

    /**
     * Keep imperative refs synchronized.
     *
     * initialValueRef is deliberately excluded from ongoing controlled-value
     * semantics. The editor itself is the source of the current local value.
     */
    useLayoutEffect(() => {
      disabledRef.current = disabled;

      readOnlyRef.current = readOnly;

      submitOnEnterRef.current = submitOnEnter;

      allowLineBreaksRef.current = allowLineBreaks;

      maxLengthRef.current = safeMaxLength;

      onChangeRef.current = onChange;

      onSubmitRef.current = onSubmit;

      onFocusRef.current = onFocus;

      onBlurRef.current = onBlur;
    }, [
      disabled,
      readOnly,
      submitOnEnter,
      allowLineBreaks,
      safeMaxLength,
      onChange,
      onSubmit,
      onFocus,
      onBlur,
    ]);

    const measurementRef = useRef(measureFocusedHeight);
    const minimumHeightRef = useRef(safeMinHeight);
    useLayoutEffect(() => {
      measurementRef.current = measureFocusedHeight;
      minimumHeightRef.current = safeMinHeight;
      measureFocusedHeight();
    }, [measureFocusedHeight, safeMinHeight]);

    /**
     * Create CodeMirror exactly once.
     */
    useLayoutEffect(() => {
      const host = hostRef.current;

      if (!host || viewRef.current) {
        return;
      }

      destroyedRef.current = false;

      const editable = !disabledRef.current && !readOnlyRef.current;

      const view = new EditorView({
        parent: host,

        state: EditorState.create({
          doc: initialValueRef.current,

          extensions: [
            history(),

            drawSelection({
              cursorBlinkRate: 1200,
            }),

            EditorState.allowMultipleSelections.of(false),

            editableCompartmentRef.current.of([
              EditorState.readOnly.of(!editable),

              EditorView.editable.of(editable),
            ]),

            /**
             * P0:
             *
             * All document invariants are enforced at the transaction level.
             */
            createInputInvariantFilter(
              maxLengthRef,
              allowLineBreaksRef,
              isComposingRef,
            ),

            wrappingCompartmentRef.current.of([]),

            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                closeHover();
                const newLength = update.state.doc.length;
                if (newLength === 0) {
                  hoverRef.current = null;
                  activeTokenKeyRef.current = null;
                  lastPointerTokenKeyRef.current = null;
                  setHover(null);
                  setPopoverPosition(null);
                  cancelRepositionFrame();
                }
              }

              if (!update.docChanged) {
                return;
              }

              const isExternal = update.transactions.some(
                (transaction) =>
                  transaction.annotation(ExternalValueUpdate) === true,
              );

              const rawValue = update.state.doc.toString();

              editorValueRef.current = rawValue;

              /**
               * Do not emit intermediate composition values.
               *
               * This prevents React from feeding an incomplete IME state
               * back into the editor.
               */
              if (isComposingRef.current) {
                pendingCompositionSyncRef.current = true;

                return;
              }

              if (isExternal) {
                return;
              }

              const nextValue = sanitizePlainText(
                rawValue,
                maxLengthRef.current,
                allowLineBreaksRef.current,
              );

              if (nextValue !== rawValue) {
                /**
                 * This should normally be impossible because the transaction
                 * invariant filter already enforces it.
                 *
                 * Keep this as a final defensive boundary.
                 */
                return;
              }

              if (focusedRef.current) {
                measurementRef.current();
              }

              pendingEmittedValuesRef.current.push(nextValue);

              if (
                pendingEmittedValuesRef.current.length >
                MAX_PENDING_CONTROLLED_VALUES
              ) {
                pendingEmittedValuesRef.current =
                  pendingEmittedValuesRef.current.slice(
                    -MAX_PENDING_CONTROLLED_VALUES,
                  );
              }

              onChangeRef.current?.(nextValue);
            }),

            variableDecorationCompartmentRef.current.of(
              createVariableDecorationExtension(
                variablesSnapshotRef,
                tokenIndexRef,
              ),
            ),

            variableCompletionCompartmentRef.current.of(
              createVariableCompletionExtension(
                variablesSnapshotRef.current.variables,
              ),
            ),

            placeholderCompartmentRef.current.of(
              placeholder ? editorPlaceholder(placeholder) : [],
            ),

            ariaCompartmentRef.current.of(
              EditorView.contentAttributes.of({
                "aria-label": ariaLabel,

                "aria-disabled": disabledRef.current ? "true" : "false",

                "aria-readonly": readOnlyRef.current ? "true" : "false",

                spellcheck: "false",
                autocapitalize: "off",
                autocomplete: "off",
              }),
            ),

            keymap.of([
              ...completionKeymap,
              ...historyKeymap,
              ...defaultKeymap,
            ]),

            EditorView.domEventHandlers({
              compositionstart() {
                isComposingRef.current = true;

                return false;
              },

              compositionend() {
                isComposingRef.current = false;

                /**
                 * CodeMirror may apply the final composition mutation
                 * asynchronously relative to the DOM compositionend event.
                 */
                queueMicrotask(() => {
                  if (destroyedRef.current || viewRef.current !== view) {
                    return;
                  }

                  if (!pendingCompositionSyncRef.current) {
                    return;
                  }

                  pendingCompositionSyncRef.current = false;

                  const rawValue = view.state.doc.toString();

                  const normalized = sanitizePlainText(
                    rawValue,
                    maxLengthRef.current,
                    allowLineBreaksRef.current,
                  );

                  if (normalized !== rawValue) {
                    view.dispatch({
                      changes: {
                        from: 0,
                        to: rawValue.length,
                        insert: normalized,
                      },
                      annotations: ExternalValueUpdate.of(true),
                    });

                    editorValueRef.current = normalized;

                    pendingEmittedValuesRef.current.push(normalized);

                    onChangeRef.current?.(normalized);

                    return;
                  }

                  editorValueRef.current = rawValue;

                  pendingEmittedValuesRef.current.push(rawValue);

                  onChangeRef.current?.(rawValue);
                });

                return false;
              },

              keydown(event, currentView): boolean {
                if (
                  event.isComposing ||
                  isComposingRef.current ||
                  disabledRef.current ||
                  readOnlyRef.current
                )
                  return false;
                if (event.key !== "Enter") {
                  return false;
                }

                if (allowLineBreaksRef.current) {
                  return false;
                }

                /**
                 * First allow autocomplete to accept the active completion.
                 */
                if (acceptCompletion(currentView)) {
                  event.preventDefault();
                  event.stopPropagation();

                  return true;
                }

                event.preventDefault();
                event.stopPropagation();

                if (submitOnEnterRef.current) {
                  onSubmitRef.current?.(currentView.state.doc.toString());
                }

                return true;
              },

              beforeinput(event, currentView): boolean {
                if (disabledRef.current || readOnlyRef.current) {
                  event.preventDefault();
                  return true;
                }
                if (isComposingRef.current) {
                  return false;
                }

                if (!event.inputType.startsWith("insert")) {
                  return false;
                }

                const text = event.data;

                if (!allowLineBreaksRef.current) {
                  /**
                   * Browser-native Enter paths.
                   */
                  if (
                    event.inputType === "insertLineBreak" ||
                    event.inputType === "insertParagraph" ||
                    event.inputType === "insertNewline"
                  ) {
                    event.preventDefault();
                    return true;
                  }

                  /**
                   * Some browser paths report Enter/newline as insertText.
                   *
                   * NEVER normalize this to " ".
                   */
                  if (text != null && /[\r\n\u2028\u2029]/.test(text)) {
                    event.preventDefault();
                    return true;
                  }
                }

                if (!text) {
                  return false;
                }

                const normalizedInsert = allowLineBreaksRef.current
                  ? text
                  : text.replace(/[\r\n\u2028\u2029]+/g, " ");

                const selection = currentView.state.selection.main;

                const insert = truncateInsertion(
                  normalizedInsert,
                  currentView.state.doc.length,
                  selection.to - selection.from,
                  maxLengthRef.current,
                );

                if (insert === text) {
                  return false;
                }

                event.preventDefault();

                if (insert) {
                  currentView.dispatch(
                    currentView.state.replaceSelection(insert),
                  );
                }

                return true;
              },

              paste(event, currentView): boolean {
                if (disabledRef.current || readOnlyRef.current) {
                  event.preventDefault();
                  return true;
                }
                const text = event.clipboardData?.getData("text/plain");

                if (text === undefined) {
                  return false;
                }

                event.preventDefault();

                const normalizedInsert = allowLineBreaksRef.current
                  ? text
                  : text.replace(/[\r\n\u2028\u2029]+/g, " ");

                const selection = currentView.state.selection.main;

                const insert = truncateInsertion(
                  normalizedInsert,
                  currentView.state.doc.length,
                  selection.to - selection.from,
                  maxLengthRef.current,
                );

                if (insert) {
                  currentView.dispatch(
                    currentView.state.replaceSelection(insert),
                  );
                }

                return true;
              },

              drop(event, currentView): boolean {
                if (disabledRef.current || readOnlyRef.current) {
                  event.preventDefault();
                  return true;
                }
                const text = event.dataTransfer?.getData("text/plain");

                if (text === undefined) {
                  return false;
                }

                event.preventDefault();

                const normalizedInsert = allowLineBreaksRef.current
                  ? text
                  : text.replace(/[\r\n\u2028\u2029]+/g, " ");

                const position = currentView.posAtCoords({
                  x: event.clientX,
                  y: event.clientY,
                });

                /**
                 * Drop over a selection must replace that selection.
                 *
                 * If there is no selection, insert at the pointer position.
                 */
                const selection = currentView.state.selection.main;

                const hasSelection = !selection.empty && position != null;

                let from: number;
                let to: number;
                let replacedLength: number;

                if (hasSelection) {
                  from = selection.from;
                  to = selection.to;
                  replacedLength = to - from;
                } else {
                  from = position ?? selection.from;

                  to = from;
                  replacedLength = 0;
                }

                const insert = truncateInsertion(
                  normalizedInsert,
                  currentView.state.doc.length,
                  replacedLength,
                  maxLengthRef.current,
                );

                if (insert) {
                  currentView.dispatch({
                    changes: {
                      from,
                      to,
                      insert,
                    },

                    selection: {
                      anchor: from + insert.length,
                    },

                    scrollIntoView: true,

                    userEvent: "input.drop",
                  });
                }

                return true;
              },

              focus(): boolean {
                if (destroyedRef.current || viewRef.current !== view) {
                  return false;
                }

                focusedRef.current = true;

                setFocused(true);

                view.dispatch({
                  effects: wrappingCompartmentRef.current.reconfigure([
                    EditorView.lineWrapping,
                  ]),
                });

                queueMicrotask(() => {
                  if (destroyedRef.current || viewRef.current !== view) {
                    return;
                  }

                  if (!view.hasFocus) {
                    return;
                  }

                  measurementRef.current();
                });

                onFocusRef.current?.();

                return false;
              },

              blur(): boolean {
                if (destroyedRef.current || viewRef.current !== view) {
                  return false;
                }

                focusedRef.current = false;

                setFocused(false);

                setWrapped(false);

                focusedHeightRef.current = minimumHeightRef.current;

                setFocusedHeight(minimumHeightRef.current);

                scheduleClose();

                view.dispatch({
                  effects: wrappingCompartmentRef.current.reconfigure([]),
                });

                onBlurRef.current?.();

                return false;
              },
            }),
          ],
        }),
      });

      viewRef.current = view;

      editorValueRef.current = view.state.doc.toString();

      if (typeof ResizeObserver !== "undefined") {
        resizeObserverRef.current = new ResizeObserver(() => {
          if (destroyedRef.current) {
            return;
          }

          const currentView = viewRef.current;

          if (!currentView || currentView !== view) {
            return;
          }

          if (focusedRef.current) {
            measurementRef.current();
          }
        });

        resizeObserverRef.current.observe(host);
      }

      if (autoFocus && editable) {
        queueMicrotask(() => {
          if (destroyedRef.current || viewRef.current !== view) {
            return;
          }

          if (!view.hasFocus) {
            view.focus();
          }
        });
      }

      return () => {
        destroyedRef.current = true;

        focusedRef.current = false;

        isComposingRef.current = false;

        pendingCompositionSyncRef.current = false;

        cancelOpen();
        cancelClose();
        cancelFrame();
        cancelRepositionFrame();

        resizeObserverRef.current?.disconnect();
        resizeObserverRef.current = null;

        tooltipResizeObserverRef.current?.disconnect();
        tooltipResizeObserverRef.current = null;

        if (pointerRafRef.current !== null) {
          window.cancelAnimationFrame(pointerRafRef.current);

          pointerRafRef.current = null;
        }

        pendingPointerRef.current = null;

        hoverRef.current = null;
        activeTokenKeyRef.current = null;

        lastPointerTokenKeyRef.current = null;

        tokenIndexRef.current = {
          doc: "",
          variablesVersion: variablesSnapshotRef.current.version,
          tokens: [],
        };

        setHover(null);
        setPopoverPosition(null);

        if (viewRef.current === view) {
          viewRef.current = null;
        }

        try {
          view.destroy();
        } catch {
          // CodeMirror destroy is intentionally best-effort.
        }
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /**
     * Controlled value synchronization.
     *
     * This is intentionally NOT a naive:
     *
     *   if (view.doc !== value) dispatch(value)
     *
     * implementation.
     *
     * It distinguishes:
     *
     * 1. stale parent render
     * 2. delayed acknowledgement of a local edit
     * 3. genuine external value change
     */
    useEffect(() => {
      const view = viewRef.current;

      if (!view || destroyedRef.current) {
        return;
      }

      if (isComposingRef.current) {
        /**
         * Defer external controlled updates until composition finishes.
         */
        return;
      }

      const nextValue = normalizedValue;

      const currentDoc = view.state.doc.toString();

      if (currentDoc === nextValue) {
        editorValueRef.current = currentDoc;

        lastAcknowledgedPropValueRef.current = nextValue;

        pendingEmittedValuesRef.current = [];

        return;
      }

      /**
       * Parent hasn't acknowledged the latest local edit yet.
       *
       * Example:
       *
       * parent = "ab"
       * editor = "abcd"
       * user emitted "abcd"
       *
       * React renders once more with stale "ab".
       *
       * Do NOT overwrite the editor.
       */
      if (nextValue === lastAcknowledgedPropValueRef.current) {
        return;
      }

      /**
       * Parent is acknowledging a value emitted by this editor.
       *
       * Do not dispatch anything because the editor already contains it.
       */
      const pendingIndex = pendingEmittedValuesRef.current.indexOf(nextValue);

      if (pendingIndex !== -1) {
        lastAcknowledgedPropValueRef.current = nextValue;

        pendingEmittedValuesRef.current = pendingEmittedValuesRef.current.slice(
          pendingIndex + 1,
        );

        return;
      }

      /**
       * Genuine external update.
       */
      pendingEmittedValuesRef.current = [];

      lastAcknowledgedPropValueRef.current = nextValue;

      applyExternalValue(view, nextValue);
    }, [applyExternalValue, normalizedValue]);

    /**
     * disabled/readOnly synchronization.
     *
     * If the editor becomes disabled/readOnly while focused, explicitly remove
     * DOM focus instead of only changing React state.
     */
    useEffect(() => {
      const view = viewRef.current;

      if (!view || destroyedRef.current) {
        return;
      }

      const editableNow = !disabled && !readOnly;

      if (!editableNow) {
        closeHover();

        if (view.hasFocus) {
          try {
            view.contentDOM.blur();
          } catch {
            // Best effort only.
          }
        }

        focusedRef.current = false;

        setFocused(false);

        setWrapped(false);

        focusedHeightRef.current = safeMinHeight;

        setFocusedHeight(safeMinHeight);

        view.dispatch({
          effects: wrappingCompartmentRef.current.reconfigure([]),
        });
      }

      view.dispatch({
        effects: [
          editableCompartmentRef.current.reconfigure([
            EditorState.readOnly.of(!editableNow),

            EditorView.editable.of(editableNow),
          ]),

          ariaCompartmentRef.current.reconfigure(
            EditorView.contentAttributes.of({
              "aria-label": ariaLabel,

              "aria-disabled": disabled ? "true" : "false",

              "aria-readonly": readOnly ? "true" : "false",

              spellcheck: "false",
              autocapitalize: "off",
              autocomplete: "off",
            }),
          ),
        ],
      });
    }, [ariaLabel, closeHover, disabled, readOnly, safeMinHeight]);

    /**
     * Variables synchronization.
     *
     * Decoration plugin keeps one canonical snapshot/version.
     * Completion source is reconfigured only when semantic variable content
     * actually changes.
     */
    useEffect(() => {
      const view = viewRef.current;

      if (!view || destroyedRef.current) {
        return;
      }

      const currentSnapshot = variablesSnapshotRef.current;

      if (variablesEqual(currentSnapshot.variables, variables)) {
        return;
      }

      closeHover();

      activeTokenKeyRef.current = null;

      lastPointerTokenKeyRef.current = null;

      const nextVersion = currentSnapshot.version + 1;

      variablesSnapshotRef.current = {
        variables,
        version: nextVersion,
      };

      tokenIndexRef.current = {
        doc: view.state.doc.toString(),
        variablesVersion: nextVersion,
        tokens: [],
      };

      /**
       * One transaction annotation updates the decoration plugin immediately.
       *
       * No decoration compartment rebuild is required.
       */
      view.dispatch({
        annotations: VariablesSnapshotUpdate.of(nextVersion),
      });

      /**
       * Completion source does capture its input snapshot, so it must be
       * reconfigured when variables change.
       */
      view.dispatch({
        effects: variableCompletionCompartmentRef.current.reconfigure(
          createVariableCompletionExtension(variables),
        ),
      });
    }, [closeHover, variables]);

    /**
     * Placeholder update.
     */
    useEffect(() => {
      const view = viewRef.current;

      if (!view || destroyedRef.current) {
        return;
      }

      view.dispatch({
        effects: placeholderCompartmentRef.current.reconfigure(
          placeholder ? editorPlaceholder(placeholder) : [],
        ),
      });
    }, [placeholder]);

    /**
     * Real-size popover measurement.
     *
     * The tooltip is first rendered hidden, measured in layout phase, and then
     * positioned using its actual width/height.
     */
    useLayoutEffect(() => {
      if (!hover) {
        tooltipResizeObserverRef.current?.disconnect();

        tooltipResizeObserverRef.current = null;

        setPopoverPosition(null);

        return;
      }

      setPopoverPosition(null);

      /**
       * Measure after the popover DOM has been committed.
       */
      repositionPopover();

      if (typeof ResizeObserver !== "undefined" && tooltipRef.current) {
        tooltipResizeObserverRef.current?.disconnect();

        const observer = new ResizeObserver(() => {
          schedulePopoverReposition();
        });

        observer.observe(tooltipRef.current);

        tooltipResizeObserverRef.current = observer;
      }

      return () => {
        tooltipResizeObserverRef.current?.disconnect();

        tooltipResizeObserverRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hover?.tokenKey, repositionPopover, schedulePopoverReposition]);

    /**
     * Reposition token anchor on viewport movement.
     */
    useEffect(() => {
      if (!hover?.tokenKey) {
        return;
      }

      const reposition = () => {
        if (destroyedRef.current || repositionRafRef.current !== null) {
          return;
        }

        const view = viewRef.current;
        const latestHover = hoverRef.current;
        if (!view || !latestHover || view.state.doc.length === 0) {
          closeHover();
          return;
        }

        repositionRafRef.current = window.requestAnimationFrame(() => {
          repositionRafRef.current = null;

          if (destroyedRef.current) {
            return;
          }

          const view = viewRef.current;
          const latestHover = hoverRef.current;

          if (!view || !latestHover) {
            closeHover();
            return;
          }

          const tokens = getTokensCurrent(view);

          const latest = tokens.find(
            (token) =>
              `${token.from}:${token.to}:${token.name}` ===
              latestHover.tokenKey,
          );

          if (!latest) {
            closeHover();
            return;
          }

          const rect = fullLineTokenRectFromView(view, latest.from, latest.to);

          if (!rect) {
            closeHover();
            return;
          }

          if (!sameRect(latestHover.rect, rect)) {
            commitHover({
              tokenKey: latestHover.tokenKey,

              rect,

              from: latest.from,
              to: latest.to,
              name: latest.name,
              variable: latest.variable,
            });
          }

          /**
           * Re-read actual popover dimensions after the token position
           * potentially changed.
           */
          repositionPopover();
        });
      };

      window.addEventListener("resize", reposition, { passive: true });

      window.addEventListener("scroll", reposition, {
        passive: true,
        capture: true,
      });

      return () => {
        window.removeEventListener("resize", reposition);

        window.removeEventListener("scroll", reposition, true);

        cancelRepositionFrame();
      };
    }, [
      cancelRepositionFrame,
      closeHover,
      commitHover,
      fullLineTokenRectFromView,
      getTokensCurrent,
      hover?.tokenKey,
      repositionPopover,
      sameRect,
    ]);

    const popoverStyle = useMemo(() => {
      if (!popoverPosition) {
        return {
          position: "fixed",
          zIndex: 999999,
          pointerEvents: "auto",
          left: 0,
          top: 0,
          visibility: "hidden",
        } as CSSProperties;
      }

      return {
        position: "fixed",
        zIndex: 999999,
        pointerEvents: "auto",
        left: popoverPosition.left,
        top: popoverPosition.top,
        visibility: "visible",
        "--popover-arrow-left": `${popoverPosition.arrowLeft}px`,
      } as CSSProperties;
    }, [popoverPosition]);

    const popoverNode = hover ? (
      <div
        ref={tooltipRef}
        className={styles.hoverPopover}
        style={popoverStyle}
        data-placement={popoverPosition?.placement ?? "bottom"}
        onPointerEnter={handleTooltipPointerEnter}
        onPointerLeave={handleTooltipPointerLeave}
        onPointerDown={markPopoverPointerDown}
      >
        <div className={styles.hoverPopoverArrow} />

        <div className={styles.popoverHeader}>
          {hover.variable?.name ?? hover.name}
        </div>

        <div className={styles.popoverType}>
          {hover.variable?.type ?? "Undefined variable"}
        </div>

        {hover.variable?.value !== undefined ? (
          <div className={styles.popoverValue}>{hover.variable.value}</div>
        ) : null}

        {hover.variable?.description ? (
          <div className={styles.popoverDesc}>{hover.variable.description}</div>
        ) : !hover.variable ? (
          <div className={styles.popoverDesc}>
            This variable is not defined in the current environment.
          </div>
        ) : null}
      </div>
    ) : null;

    return (
      <div
        ref={anchorRef}
        style={{
          minWidth: 0,
          width: "100%",
          height: expansionMode === "overlay" ? safeMinHeight : undefined,
        }}
      >
        <div
          ref={hostRef}
          className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
          style={{ ...rootStyle, ...overlayStyle }}
          data-focused={focused ? "" : undefined}
          data-wrapped={focused && wrapped ? "" : undefined}
          data-multiline={allowLineBreaks ? "" : undefined}
          data-disabled={disabled ? "" : undefined}
          data-readonly={readOnly ? "" : undefined}
          onPointerEnter={handleHostPointerEnter}
          onPointerMove={handlePointerMove}
          onPointerLeave={handleHostPointerLeave}
        >
          {popoverNode}
        </div>
      </div>
    );
  },
);

VariableTextEditor.displayName = "VariableTextEditor";
