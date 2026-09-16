import { VscSettingsCompact } from "react-icons/vsc";
import { SettingsPanel } from "../shared/SettingsPanel";
import type { SchemaValue } from "../../core/types";
import { InlineSchemaEditor } from "../inlineSchemaEditor/InlineSchemaEditor";
import * as React from "react";
import {
  Box,
  Button,
  createListCollection,
  Icon,
  IconButton,
  Input,
  Menu,
  Popover,
  Portal,
  Select,
  Span,
  Text,
} from "@chakra-ui/react";

import styles from "./SchemaTreeEditor.module.css";
import {
  SCHEMA_TYPES,
  type AddFieldMode,
  type FlatNode,
  type JSONSchema,
  type JSONSchemaType,
  type SchemaEditorError,
  type SchemaErrorHandler,
  type SchemaTreeEditorProps,
} from "./libs/types";
import {
  cloneSchema,
  defaultSchemaFor,
  deleteIn,
  flattenSchema,
  getIn,
  insertKeyAfter,
  isPlainObject,
  isValidKey,
  patchSchema,
  pruneExpanded,
  remapExpanded,
  renameKey,
  renameRequired,
  reorderKeys,
  requiredOwnerPath,
  safeRun,
  schemaTypeOf,
  setIn,
  setRequired,
  samePath,
  changeSchemaType,
  typeLabel,
  uniqueKey,
  verifyExternalSchema,
} from "./libs/utils";
import { LuLink2 } from "react-icons/lu";
import { BiGridVertical } from "react-icons/bi";
import { VscTrash } from "react-icons/vsc";
import { MdAdd } from "react-icons/md";
import { FaStarOfLife } from "react-icons/fa6";
import { FiChevronRight } from "react-icons/fi";

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const INDENT_STEP = 14;
const DEFAULT_MAX_ROWS = 5000;
const CONFIRM_TIMEOUT = 2600;
const REJECT_FLASH = 900;

/* -------------------------------------------------------------------------- */
/* Error boundary                                                             */
/* -------------------------------------------------------------------------- */

interface BoundaryProps {
  onError?: SchemaErrorHandler;
  children: React.ReactNode;
}

interface BoundaryState {
  failed: boolean;
  message: string;
  retryKey: number;
}

class SchemaErrorBoundary extends React.Component<
  BoundaryProps,
  BoundaryState
> {
  state: BoundaryState = { failed: false, message: "", retryKey: 0 };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return {
      failed: true,
      message: error instanceof Error ? error.message : String(error),
      retryKey: 0,
    };
  }

  componentDidCatch(error: unknown): void {
    try {
      this.props.onError?.({
        scope: "render",
        message: error instanceof Error ? error.message : String(error),
        cause: error,
      });
    } catch {
      /* Error observers cannot prevent recovery. */
    }
  }

  private handleRetry = (): void => {
    this.setState((state) => ({
      failed: false,
      message: "",
      retryKey: state.retryKey + 1,
    }));
  };

  render(): React.ReactNode {
    if (!this.state.failed) {
      return (
        <React.Fragment key={this.state.retryKey}>
          {this.props.children}
        </React.Fragment>
      );
    }
    return (
      <Box className={styles.fallback} role="alert">
        <Text className={styles.fallbackTitle}>
          Schema view stopped responding
        </Text>
        <Text className={styles.fallbackMessage}>{this.state.message}</Text>
        <Button
          className={styles.ghostButton}
          onClick={this.handleRetry}
          size="xs"
        >
          Reload view
        </Button>
      </Box>
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Buffered input - keystrokes never touch the schema tree                    */
/* -------------------------------------------------------------------------- */

interface BufferedInputProps {
  value: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  invalidHint?: string;
  ariaLabel: string;
  /** Return false to reject the commit and roll the field back. */
  onCommit: (next: string) => boolean | void;
}

interface SyncState {
  draft: string;
  /** The external value this draft was derived from. */
  external: string;
}

const BufferedInput: React.FC<BufferedInputProps> = React.memo(
  ({
    value,
    placeholder,
    className,
    disabled,
    invalidHint,
    ariaLabel,
    onCommit,
  }) => {
    // Both halves live in state, so a discarded render leaves no trace behind.
    const [sync, setSync] = React.useState<SyncState>(() => ({
      draft: value,
      external: value,
    }));
    const [rejected, setRejected] = React.useState(false);
    const focused = React.useRef(false);
    const cancelCommit = React.useRef(false);
    const rejectTimer = React.useRef<number | null>(null);

    const focusExternal = React.useRef(value);

    // Synchronize external changes outside render. While focused, preserve the
    // draft and resolve conflicts deterministically on blur.
    React.useEffect(() => {
      if (focused.current) return;
      setSync((current) =>
        current.draft === value && current.external === value
          ? current
          : { draft: value, external: value },
      );
    }, [value]);

    React.useEffect(
      () => () => {
        if (rejectTimer.current !== null) {
          window.clearTimeout(rejectTimer.current);
          rejectTimer.current = null;
        }
      },
      [],
    );

    const flashRejected = React.useCallback(() => {
      setRejected(true);
      if (rejectTimer.current !== null)
        window.clearTimeout(rejectTimer.current);
      rejectTimer.current = window.setTimeout(() => {
        rejectTimer.current = null;
        setRejected(false);
      }, REJECT_FLASH);
    }, []);

    const handleFocus = React.useCallback(() => {
      focused.current = true;
      focusExternal.current = value;
    }, [value]);

    const handleBlur = React.useCallback(() => {
      focused.current = false;
      if (cancelCommit.current || disabled) {
        cancelCommit.current = false;
        setSync({ draft: value, external: value });
        return;
      }

      // Never overwrite a newer external value that arrived while editing.
      if (focusExternal.current !== value) {
        setSync({ draft: value, external: value });
        return;
      }

      if (sync.draft === value) {
        setSync({ draft: value, external: value });
        return;
      }

      const accepted = onCommit(sync.draft);
      if (accepted === false) {
        setSync({ draft: value, external: value });
        flashRejected();
      } else {
        setSync({ draft: sync.draft, external: value });
      }
    }, [sync.draft, value, onCommit, flashRejected, disabled]);

    const handleChange = React.useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const draft = event.target.value;
        setSync((current) => ({ ...current, draft }));
      },
      [],
    );

    const handleKeyDown = React.useCallback(
      (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancelCommit.current = true;
          setSync({ draft: value, external: value });
          event.stopPropagation();
          event.currentTarget.blur();
        }
      },
      [value],
    );

    return (
      <Input
        className={[className, rejected ? styles.inputRejected : null]
          .filter(Boolean)
          .join(" ")}
        value={sync.draft}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-invalid={rejected || undefined}
        title={rejected ? invalidHint : undefined}
        spellCheck={false}
        autoComplete="off"
        onFocus={handleFocus}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        // Stop the row drag handle from hijacking text selection.
        onMouseDown={(event) => event.stopPropagation()}
      />
    );
  },
);
BufferedInput.displayName = "BufferedInput";

/* -------------------------------------------------------------------------- */
/* Row                                                                        */
/* -------------------------------------------------------------------------- */

interface RowHandlers {
  onToggle: (node: FlatNode) => void;
  onRename: (node: FlatNode, next: string) => boolean;
  onDescription: (node: FlatNode, next: string) => void;
  onType: (node: FlatNode, next: JSONSchemaType) => void;
  onRequired: (node: FlatNode, next: boolean) => void;
  onDelete: (node: FlatNode) => void;
  onAdd: (node: FlatNode, mode: AddFieldMode) => void;
  onDragStart: (node: FlatNode, index: number, event: React.DragEvent) => void;
  onDragOver: (node: FlatNode, index: number, event: React.DragEvent) => void;
  onDrop: (node: FlatNode, index: number, event: React.DragEvent) => void;
  onKeyboardMove: (node: FlatNode, delta: number) => void;
  /** Already bound to this row by the owner, `update` is wired in. */
  renderAdvanced?: SchemaTreeEditorProps["renderAdvanced"];
  rootSchema: JSONSchema;
  editable: boolean;
}

interface RowProps {
  node: FlatNode;
  index: number;
  handlers: RowHandlers;
}

const schemaTypeOptions = createListCollection({
  items: SCHEMA_TYPES.map((t) => ({ label: t, value: t })),
});
const SchemaRow: React.FC<RowProps> = React.memo(
  ({ node, index, handlers }) => {
    const [armed, setArmed] = React.useState(false);
    const [draggable, setDraggable] = React.useState(false);
    const confirmTimer = React.useRef<number | null>(null);

    const clearConfirmTimer = React.useCallback(() => {
      if (confirmTimer.current !== null) {
        window.clearTimeout(confirmTimer.current);
        confirmTimer.current = null;
      }
    }, []);

    // Hard cleanup on unmount, independent of the arming effect below.
    React.useEffect(() => clearConfirmTimer, [clearConfirmTimer]);

    const disarm = React.useCallback(() => {
      clearConfirmTimer();
      setArmed(false);
    }, [clearConfirmTimer]);

    // Any context change disarms: scrolling moves the button away from the
    // cursor, and losing focus means the user went elsewhere.
    React.useEffect(() => {
      if (!armed) return;
      const cancel = () => setArmed(false);
      window.addEventListener("scroll", cancel, {
        passive: true,
        capture: true,
      });
      window.addEventListener("resize", cancel);
      window.addEventListener("blur", cancel);
      document.addEventListener("visibilitychange", cancel);
      return () => {
        window.removeEventListener("scroll", cancel, {
          capture: true,
        } as EventListenerOptions);
        window.removeEventListener("resize", cancel);
        window.removeEventListener("blur", cancel);
        document.removeEventListener("visibilitychange", cancel);
      };
    }, [armed]);

    const handleDeleteClick = React.useCallback(() => {
      if (!armed) {
        setArmed(true);
        clearConfirmTimer();
        confirmTimer.current = window.setTimeout(() => {
          confirmTimer.current = null;
          setArmed(false);
        }, CONFIRM_TIMEOUT);
        return;
      }
      disarm();
      handlers.onDelete(node);
    }, [armed, clearConfirmTimer, disarm, handlers, node]);

    const rowEditable = handlers.editable && !node.readOnly;
    const resolvedType = schemaTypeOf(node.resolved);
    const canAddChild =
      rowEditable && resolvedType === "object" && !node.schema.$ref;

    const handleRowKeyDown = React.useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        if (!node.sortable || !rowEditable) return;
        if (!event.metaKey && !event.ctrlKey) return;
        if (event.key === "ArrowUp") {
          event.preventDefault();
          handlers.onKeyboardMove(node, -1);
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          handlers.onKeyboardMove(node, 1);
        }
      },
      [handlers, node, rowEditable],
    );

    const description =
      typeof node.resolved.description === "string"
        ? node.resolved.description
        : "";

    return (
      <Box
        className={styles.row}
        style={{ ["--row-depth" as string]: node.depth }}
        data-ref-segment={node.refSegment}
        data-readonly={node.readOnly || undefined}
        data-required={node.required || undefined}
        draggable={draggable || undefined}
        data-dragging={draggable || undefined}
        onKeyDown={handleRowKeyDown}
        onDragStart={(event) => handlers.onDragStart(node, index, event)}
        onDragOver={(event) => handlers.onDragOver(node, index, event)}
        onDrop={(event) => handlers.onDrop(node, index, event)}
        onDragEnd={() => setDraggable(false)}
        onMouseLeave={disarm}
        role="row"
      >
        <Box
          className={styles.nameCell}
          role="cell"
          style={{ paddingLeft: node.depth * INDENT_STEP }}
        >
          {node.sortable && rowEditable ? (
            <Box
              className={styles.grip}
              aria-label={`Reorder ${node.key}`}
              title="Drag to reorder, or Ctrl/Cmd with the arrow keys"
              role="button"
              tabIndex={-1}
              onMouseDown={() => setDraggable(true)}
              onMouseUp={() => setDraggable(false)}
            >
              <BiGridVertical />
            </Box>
          ) : (
            <Box className={styles.gripPlaceholder} />
          )}

          {node.expandable ? (
            <Button
              className={styles.chevron}
              data-expanded={node.expanded || undefined}
              aria-expanded={node.expanded}
              aria-label={
                node.expanded ? `Collapse ${node.key}` : `Expand ${node.key}`
              }
              onClick={() => handlers.onToggle(node)}
              size="xs"
              variant="ghost"
            >
              <FiChevronRight />
            </Button>
          ) : (
            <Box className={styles.chevronPlaceholder} />
          )}

          <BufferedInput
            className={styles.nameInput}
            value={node.key}
            ariaLabel="Field name"
            placeholder="fieldName"
            disabled={!rowEditable || node.kind !== "property"}
            invalidHint="Name is invalid or already used"
            onCommit={(next) => handlers.onRename(node, next)}
          />

          {node.refName ? (
            <Box
              className={styles.refBadge}
              title={`Reference: ${node.refName}`}
            >
              <LuLink2 className={styles.refBadgeIcon} strokeWidth={1.5} />
              <Text className={styles.refBadgeText}>{node.refName}</Text>
            </Box>
          ) : null}

          {node.recursive ? (
            <Box
              className={styles.recursiveBadge}
              title="Recursive reference, expansion stopped"
            >
              <Text className={styles.recursiveBadgeText}>recursive</Text>
            </Box>
          ) : null}
        </Box>

        <Box role="cell" className={styles.typeCell}>
          {typeof node.resolvedValue === "boolean" ? (
            <Text className={styles.typeStatic}>
              {node.resolvedValue ? "Any value" : "Never"}
            </Text>
          ) : rowEditable ? (
            <Select.Root
              collection={schemaTypeOptions}
              size="xs"
              multiple={false}
              className={styles.typeSelect}
              value={[resolvedType]}
              onValueChange={(details) => {
                const nextType = details.value[0];
                if (
                  !nextType ||
                  !SCHEMA_TYPES.includes(nextType as JSONSchemaType)
                ) {
                  return;
                }
                handlers.onType(node, nextType as JSONSchemaType);
              }}
            >
              <Select.HiddenSelect />
              <Select.Control>
                <Select.Trigger className={`${styles.typeSelectItem}`}>
                  <Select.ValueText
                    className={`${styles.typeSelectOption}`}
                    placeholder="Select a schema type"
                  />
                </Select.Trigger>
                <Select.IndicatorGroup>
                  <Select.Indicator />
                </Select.IndicatorGroup>
              </Select.Control>
              <Portal>
                <Select.Positioner>
                  <Select.Content className={styles.typeSelectContent}>
                    {schemaTypeOptions.items.map((item) => (
                      <Select.Item
                        aria-label="Field type"
                        item={item}
                        key={item.value}
                      >
                        <Span className={`${styles.typeSelectOption}`}>
                          {item.label}
                        </Span>
                        <Select.ItemIndicator />
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Positioner>
              </Portal>
            </Select.Root>
          ) : (
            <Text className={styles.typeStatic}>
              {typeLabel(node.resolved)}
            </Text>
          )}
        </Box>

        <Box role="cell" className={styles.requiredCell}>
          <IconButton
            className={`${styles.requiredToggle} ${node.required ? "required" : ""}`}
            data-on={node.required || undefined}
            aria-pressed={node.required}
            aria-label={
              node.required
                ? "Required, click to make optional"
                : "Optional, click to make required"
            }
            title={node.required ? "Required" : "Optional"}
            disabled={!rowEditable || node.kind !== "property"}
            onClick={() => handlers.onRequired(node, !node.required)}
            size="xs"
            variant="ghost"
          >
            <Icon size={"xs"}>
              {node.required ? <FaStarOfLife /> : <FaStarOfLife />}
            </Icon>
          </IconButton>
        </Box>

        <Box role="cell" className={styles.descriptionCell}>
          <BufferedInput
            className={styles.descriptionInput}
            value={description}
            ariaLabel="Field description"
            placeholder={
              typeof node.value === "boolean"
                ? "Boolean schema"
                : "Describe this field"
            }
            disabled={!rowEditable || typeof node.value === "boolean"}
            onCommit={(next) => handlers.onDescription(node, next)}
          />
        </Box>

        <Box role="cell" className={styles.actions}>
          {handlers.renderAdvanced ? (
            <Popover.Root
              positioning={{
                placement: "bottom-end",
                strategy: "fixed",
                overflowPadding: 12,
              }}
              lazyMount
              unmountOnExit
            >
              <Popover.Trigger asChild>
                <Button
                  className={styles.iconButton}
                  aria-label="Advanced settings"
                  title="Advanced settings"
                  size="xs"
                  variant="ghost"
                >
                  <VscSettingsCompact size={16} />
                </Button>
              </Popover.Trigger>
              <Portal>
                <Popover.Positioner>
                  <SettingsPanel title={node.key}>
                    {handlers.renderAdvanced({
                      required: node.required,
                      onRequiredChange:
                        node.kind === "property"
                          ? (value) => handlers.onRequired(node, value)
                          : undefined,
                      nested: node.depth > 0,
                      schema: node.readOnly ? node.resolvedValue : node.value,
                      schemaName: node.key,
                      fullSchema: handlers.rootSchema,
                      path: node.path,
                      readOnly: !rowEditable,
                      // Overwritten by the owner's row binding.
                      update: () => undefined,
                    })}
                  </SettingsPanel>
                </Popover.Positioner>
              </Portal>
            </Popover.Root>
          ) : null}

          {rowEditable ? (
            <Menu.Root
              positioning={{
                placement: "bottom-end",
                strategy: "fixed",
                overflowPadding: 12,
              }}
              lazyMount
              unmountOnExit
            >
              <Menu.Trigger asChild>
                <Button
                  className={styles.iconButton}
                  aria-label="Add field"
                  title="Add field"
                  size="xs"
                  variant="ghost"
                >
                  <MdAdd />
                </Button>
              </Menu.Trigger>
              <Portal>
                <Menu.Positioner>
                  <Menu.Content className={styles.menu}>
                    <Menu.Item
                      value="sibling"
                      disabled={node.kind !== "property"}
                      onSelect={() => handlers.onAdd(node, "sibling")}
                    >
                      Add field below
                    </Menu.Item>
                    {canAddChild ? (
                      <Menu.Item
                        value="child"
                        onSelect={() => handlers.onAdd(node, "child")}
                      >
                        Add nested field
                      </Menu.Item>
                    ) : null}
                  </Menu.Content>
                </Menu.Positioner>
              </Portal>
            </Menu.Root>
          ) : null}

          {rowEditable && node.kind !== "root" ? (
            <IconButton
              className={[styles.iconButton, armed ? styles.dangerArmed : null]
                .filter(Boolean)
                .join(" ")}
              aria-label={
                armed ? `Confirm delete ${node.key}` : `Delete ${node.key}`
              }
              title={armed ? "Click again to confirm" : "Delete field"}
              onClick={handleDeleteClick}
              size="xs"
              variant="ghost"
            >
              <VscTrash />
            </IconButton>
          ) : null}
        </Box>
      </Box>
    );
  },
);

/** Reference equality on the two schema objects is the only thing that matters. */
const MemoRow = React.memo(SchemaRow, (prev, next) => {
  const a = prev.node;
  const b = next.node;
  return (
    a.id === b.id &&
    a.key === b.key &&
    a.schema === b.schema &&
    a.resolved === b.resolved &&
    a.required === b.required &&
    a.expanded === b.expanded &&
    a.expandable === b.expandable &&
    a.depth === b.depth &&
    a.refSegment === b.refSegment &&
    a.readOnly === b.readOnly &&
    a.sortable === b.sortable &&
    a.recursive === b.recursive &&
    prev.index === next.index &&
    prev.handlers === next.handlers
  );
});
MemoRow.displayName = "SchemaRow";

/* -------------------------------------------------------------------------- */
/* Editor                                                                     */
/* -------------------------------------------------------------------------- */

interface DragState {
  active: boolean;
  key: string | null;
  ownerPath: string[] | null;
  overIndex: number | null;
  usedDataTransfer: boolean;
}

const IDLE_DRAG: DragState = Object.freeze({
  active: false,
  key: null,
  ownerPath: null,
  overIndex: null,
  usedDataTransfer: false,
}) as DragState;

interface AdvancedCache {
  owner: RowHandlers | null;
  byId: Map<string, RowHandlers>;
}

const SchemaTreeEditorInner: React.FC<SchemaTreeEditorProps> = React.memo(
  ({
    schema,
    onChange,
    className,
    showType = true,
    showRequired = false,
    showDescription = false,
    readOnly = false,
    defaultExpanded,
    maxRows = DEFAULT_MAX_ROWS,
    renderAdvanced = defaultAdvancedEditor,
    document: referenceDocument,
    onError,
    strictExternalSchema = true,
  }) => {
    const reportError = React.useCallback(
      (error: SchemaEditorError) => {
        try {
          onError?.(error);
        } catch {
          /* Error observers cannot prevent recovery. */
        }
      },
      [onError],
    );

    /* --- external contract check ------------------------------------------- */

    const signatureRef = React.useRef("");
    const previousSchemaRef = React.useRef<JSONSchema | undefined>(undefined);

    const safeSchema = React.useMemo(() => {
      if (!strictExternalSchema) {
        return isPlainObject(schema) ? schema : ({} as JSONSchema);
      }
      const check = verifyExternalSchema(
        schema,
        previousSchemaRef.current,
        signatureRef.current,
        reportError,
      );
      signatureRef.current = check.signature;
      previousSchemaRef.current = check.schema;
      if (check.mutated) {
        // The host mutated in place, so every cached reference is suspect.
        reportError({
          scope: "commit",
          message: "schema prop was mutated in place, rebuilding the tree",
        });
        return cloneSchema(check.schema);
      }
      return check.schema;
    }, [schema, strictExternalSchema, reportError]);

    /* --- expansion ---------------------------------------------------------- */

    const [expanded, setExpanded] = React.useState<Set<string>>(
      () => new Set(defaultExpanded ?? []),
    );

    /* --- drag state, per instance ------------------------------------------ */

    const dragRef = React.useRef<DragState>(IDLE_DRAG);
    const [dropLine, setDropLine] = React.useState<number | null>(null);
    const rafRef = React.useRef<number | null>(null);

    const cancelRaf = React.useCallback(() => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    }, []);

    const resetDrag = React.useCallback(() => {
      cancelRaf();
      if (dragRef.current !== IDLE_DRAG) dragRef.current = IDLE_DRAG;
      setDropLine((current) => (current === null ? current : null));
    }, [cancelRaf]);

    const scheduleDropLine = React.useCallback((index: number | null) => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setDropLine((current) => (current === index ? current : index));
      });
    }, []);

    // Bubble phase only. `dragend` always fires after `drop`, so it never
    // clears the state before the row handler has read it.
    React.useEffect(() => {
      const abort = () => resetDrag();
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") resetDrag();
      };
      const onVisibility = () => {
        if (document.visibilityState === "hidden") resetDrag();
      };

      document.addEventListener("dragend", abort);
      document.addEventListener("keydown", onKeyDown);
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("blur", abort);

      return () => {
        document.removeEventListener("dragend", abort);
        document.removeEventListener("keydown", onKeyDown);
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("blur", abort);
        cancelRaf();
      };
    }, [resetDrag, cancelRaf]);

    /* --- commit ------------------------------------------------------------- */

    const commit = React.useCallback(
      (next: JSONSchema) => {
        if (readOnly || next === safeSchema) return;
        safeRun(
          "commit",
          () => {
            previousSchemaRef.current = next;
            onChange(next);
          },
          undefined,
          reportError,
        );
      },
      [onChange, safeSchema, reportError, readOnly],
    );

    /* --- flatten ------------------------------------------------------------ */

    const { nodes, overflow } = React.useMemo(
      () =>
        flattenSchema({
          root: safeSchema,
          document: referenceDocument,
          expanded,
          maxRows,
          onError: reportError,
        }),
      [safeSchema, referenceDocument, expanded, maxRows, reportError],
    );

    // Group reference occurrences by depth, retaining original row indices for drag operations.
    const rowGroups = React.useMemo(() => {
      const groups: {
        id: string;
        reference: boolean;
        depth: number;
        rows: { node: FlatNode; index: number }[];
      }[] = [];
      nodes.forEach((node, index) => {
        const last = groups[groups.length - 1];
        if (
          last?.reference &&
          node.depth > last.depth &&
          node.refSegment !== "none"
        ) {
          last.rows.push({ node, index });
        } else {
          groups.push({
            id: node.id,
            reference: !!node.refName,
            depth: node.depth,
            rows: [{ node, index }],
          });
        }
      });
      return groups;
    }, [nodes]);

    const propertyCount = React.useMemo(
      () =>
        isPlainObject(safeSchema.properties)
          ? Object.keys(safeSchema.properties).length
          : 0,
      [safeSchema],
    );

    /* --- mutations ---------------------------------------------------------- */

    const editable = !readOnly;

    const handleToggle = React.useCallback((node: FlatNode) => {
      setExpanded((current) => {
        const next = new Set(current);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        return next;
      });
    }, []);

    const handleRename = React.useCallback(
      (node: FlatNode, raw: string): boolean => {
        const nextKey = raw.trim();
        if (!nextKey || nextKey === node.key) return nextKey === node.key;
        if (!isValidKey(nextKey)) return false;

        const owner = getIn(safeSchema, node.parentPath);
        if (!isPlainObject(owner)) return false;
        if (Object.prototype.hasOwnProperty.call(owner, nextKey)) return false;

        const renamed = renameKey(owner, node.key, nextKey);
        if (renamed === owner) return false;

        let next = setIn(safeSchema, node.parentPath, renamed);
        const ownerPath = requiredOwnerPath(node.parentPath);
        if (ownerPath)
          next = renameRequired(next, ownerPath, node.key, nextKey);

        setExpanded((current) =>
          remapExpanded(current, node.path, [...node.parentPath, nextKey]),
        );
        commit(next);
        return true;
      },
      [safeSchema, commit],
    );

    const handleDescription = React.useCallback(
      (node: FlatNode, raw: string) => {
        const value = raw.trim();
        commit(
          patchSchema(safeSchema, node.path, {
            description: value || undefined,
          }),
        );
      },
      [safeSchema, commit],
    );

    const handleType = React.useCallback(
      (node: FlatNode, nextType: JSONSchemaType) => {
        if (
          typeof node.value !== "boolean" &&
          schemaTypeOf(node.resolved) === nextType
        )
          return;

        const current = isPlainObject(node.schema) ? node.schema : {};
        const next = changeSchemaType(current, nextType);

        // Leaving a container type drops its children on purpose.
        setExpanded((existing) => pruneExpanded(existing, node.path));
        commit(setIn(safeSchema, node.path, next));
      },
      [safeSchema, commit],
    );

    const handleRequired = React.useCallback(
      (node: FlatNode, nextRequired: boolean) => {
        const ownerPath = requiredOwnerPath(node.parentPath);
        if (!ownerPath) return; // array items and pattern properties have no `required`
        commit(setRequired(safeSchema, ownerPath, node.key, nextRequired));
      },
      [safeSchema, commit],
    );

    const handleDelete = React.useCallback(
      (node: FlatNode) => {
        let next = deleteIn(safeSchema, node.path);
        if (readOnly || next === safeSchema) return;
        const ownerPath = requiredOwnerPath(node.parentPath);
        if (ownerPath) next = setRequired(next, ownerPath, node.key, false);
        setExpanded((current) => pruneExpanded(current, node.path));
        commit(next);
      },
      [safeSchema, commit],
    );

    const handleAdd = React.useCallback(
      (node: FlatNode, mode: AddFieldMode) => {
        if (mode === "child") {
          const owner = getIn(safeSchema, [...node.path, "properties"]);
          const container = isPlainObject(owner) ? owner : {};
          const key = uniqueKey(container, "newField");
          const nextProps = insertKeyAfter(
            container,
            null,
            key,
            defaultSchemaFor("string"),
          );
          const next = setIn(safeSchema, node.path, {
            ...(isPlainObject(node.schema) ? node.schema : {}),
            type: "object",
            properties: nextProps,
          });
          setExpanded((current) => new Set(current).add(node.id));
          commit(next);
          return;
        }

        const owner = getIn(safeSchema, node.parentPath);
        const container = isPlainObject(owner) ? owner : {};
        const key = uniqueKey(container, "newField");
        const nextProps = insertKeyAfter(
          container,
          node.key,
          key,
          defaultSchemaFor("string"),
        );
        commit(setIn(safeSchema, node.parentPath, nextProps));
      },
      [safeSchema, commit],
    );

    /* --- reordering --------------------------------------------------------- */

    const moveKey = React.useCallback(
      (ownerPath: string[], key: string, targetIndex: number) => {
        safeRun(
          "reorder",
          () => {
            const owner = getIn(safeSchema, ownerPath);
            if (!isPlainObject(owner)) return;
            const reordered = reorderKeys(owner, key, targetIndex);
            if (reordered === owner) return;
            commit(setIn(safeSchema, ownerPath, reordered));
          },
          undefined,
          reportError,
          ownerPath,
        );
      },
      [safeSchema, commit, reportError],
    );

    const handleDragStart = React.useCallback(
      (node: FlatNode, index: number, event: React.DragEvent) => {
        if (!node.sortable || !editable) {
          event.preventDefault();
          return;
        }
        let usedDataTransfer = false;
        try {
          event.dataTransfer.effectAllowed = "move";
          // Some sandboxed or mobile environments reject setData entirely.
          event.dataTransfer.setData("text/plain", node.key);
          usedDataTransfer = true;
        } catch {
          usedDataTransfer = false;
        }
        dragRef.current = {
          active: true,
          key: node.key,
          ownerPath: node.parentPath,
          overIndex: index,
          usedDataTransfer,
        };
      },
      [editable],
    );

    const handleDragOver = React.useCallback(
      (node: FlatNode, index: number, event: React.DragEvent) => {
        const drag = dragRef.current;
        if (!drag.active || !drag.ownerPath) return;
        if (!samePath(node.parentPath, drag.ownerPath)) return;

        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (drag.overIndex !== index) drag.overIndex = index;
        scheduleDropLine(index);
      },
      [scheduleDropLine],
    );

    const handleDrop = React.useCallback(
      (node: FlatNode, _index: number, event: React.DragEvent) => {
        const drag = dragRef.current;
        if (!drag.active || !drag.ownerPath || !drag.key) {
          resetDrag();
          return;
        }
        event.preventDefault();

        const ownerPath = drag.ownerPath;
        const movingKey = drag.key;
        resetDrag();

        if (!samePath(node.parentPath, ownerPath)) return;

        // Resolve the landing index from the live schema, never from a cached one.
        const owner = getIn(safeSchema, ownerPath);
        if (!isPlainObject(owner)) return;
        const targetIndex = Object.keys(owner).indexOf(node.key);
        if (targetIndex < 0) return;

        moveKey(ownerPath, movingKey, targetIndex);
      },
      [safeSchema, moveKey, resetDrag],
    );

    /** Keyboard fallback for environments where HTML5 drag is unavailable. */
    const handleKeyboardMove = React.useCallback(
      (node: FlatNode, delta: number) => {
        const owner = getIn(safeSchema, node.parentPath);
        if (!isPlainObject(owner)) return;
        const from = Object.keys(owner).indexOf(node.key);
        if (from < 0) return;
        moveKey(node.parentPath, node.key, from + delta);
      },
      [safeSchema, moveKey],
    );

    const handleAdvancedUpdate = React.useCallback(
      (node: FlatNode, next: SchemaValue) => {
        if (typeof next !== "boolean" && !isPlainObject(next)) {
          reportError({
            scope: "commit",
            message: "advanced editor returned a non-object schema",
            path: node.path,
          });
          return;
        }
        commit(setIn(safeSchema, node.path, next));
      },
      [safeSchema, commit, reportError],
    );

    /* --- toolbar ------------------------------------------------------------ */

    const handleAddRoot = React.useCallback(() => {
      const owner = isPlainObject(safeSchema.properties)
        ? safeSchema.properties
        : {};
      const key = uniqueKey(owner, "newField");
      const nextProps = insertKeyAfter(
        owner,
        null,
        key,
        defaultSchemaFor("string"),
      );
      commit({ ...safeSchema, type: "object", properties: nextProps });
    }, [safeSchema, commit]);

    const handleToggleAll = React.useCallback(() => {
      if (expanded.size > 0) {
        setExpanded(new Set());
        return;
      }
      const result = flattenSchema({
        root: safeSchema,
        document: referenceDocument,
        expanded: new Set(),
        expandAll: true,
        maxRows,
        onError: reportError,
      });
      setExpanded(
        new Set(
          result.nodes.filter((node) => node.expandable).map((node) => node.id),
        ),
      );
    }, [expanded.size, safeSchema, referenceDocument, maxRows, reportError]);

    /* --- handlers ----------------------------------------------------------- */

    const handlers = React.useMemo<RowHandlers>(
      () => ({
        onToggle: handleToggle,
        onRename: handleRename,
        onDescription: handleDescription,
        onType: handleType,
        onRequired: handleRequired,
        onDelete: handleDelete,
        onAdd: handleAdd,
        onDragStart: handleDragStart,
        onDragOver: handleDragOver,
        onDrop: handleDrop,
        onKeyboardMove: handleKeyboardMove,
        renderAdvanced,
        rootSchema: referenceDocument ?? safeSchema,
        editable,
      }),
      [
        handleToggle,
        handleRename,
        handleDescription,
        handleType,
        handleRequired,
        handleDelete,
        handleAdd,
        handleDragStart,
        handleDragOver,
        handleDrop,
        handleKeyboardMove,
        renderAdvanced,
        referenceDocument,
        safeSchema,
        editable,
      ],
    );

    /*
     * Per row handlers so the advanced popover receives a node bound `update`.
     * The cache is owned by this instance and keyed by the current `handlers`
     * object, so a new schema version invalidates every entry at once.
     */
    const advancedCacheRef = React.useRef<AdvancedCache>({
      owner: null,
      byId: new Map(),
    });

    const rowHandlersFor = React.useCallback(
      (base: RowHandlers, node: FlatNode): RowHandlers => {
        if (!base.renderAdvanced) return base;
        const cache = advancedCacheRef.current;
        if (cache.owner !== base) {
          cache.owner = base;
          cache.byId = new Map();
        }
        const hit = cache.byId.get(node.id);
        if (hit) return hit;

        const inner = base.renderAdvanced;
        const bound: RowHandlers = {
          ...base,
          renderAdvanced: (context) =>
            inner({
              ...context,
              update: (next) => {
                if (base.editable && !node.readOnly)
                  handleAdvancedUpdate(node, next);
              },
            }),
        };
        cache.byId.set(node.id, bound);
        return bound;
      },
      [handleAdvancedUpdate],
    );

    React.useEffect(
      () => () => {
        advancedCacheRef.current = { owner: null, byId: new Map() };
      },
      [],
    );

    /* --- render ------------------------------------------------------------- */

    return (
      <Box
        className={[styles.root, className].filter(Boolean).join(" ")}
        data-show-type={showType}
        data-show-required={showRequired}
        data-show-description={showDescription}
        style={
          {
            "--grid-min-width": `${160 + (showType ? 120 : 0) + (showRequired ? 36 : 0) + (showDescription ? 168 : 0) + 150}px`,
            "--grid-columns": [
              "minmax(160px, 1fr)",
              showType && "112px",
              showRequired && "28px",
              showDescription && "minmax(160px, 1fr)",
              "80px",
            ]
              .filter(Boolean)
              .join(" "),
          } as React.CSSProperties
        }
      >
        <Box className={styles.toolbar}>
          <Text className={styles.toolbarTitle}>Schema</Text>
          <Text className={styles.toolbarMeta}>
            {propertyCount} field{propertyCount === 1 ? "" : "s"}
          </Text>
          <Box className={styles.toolbarSpacer} />
          <Button
            className={styles.ghostButton}
            onClick={handleToggleAll}
            disabled={!nodes.some((node) => node.expandable)}
            size="xs"
            variant="ghost"
          >
            {expanded.size > 0 ? "Collapse all" : "Expand all"}
          </Button>
          <Button
            className={styles.ghostButton}
            onClick={handleAddRoot}
            disabled={!editable}
            size="xs"
            variant="ghost"
          >
            <MdAdd />
            Add field
          </Button>
        </Box>

        <Box
          className={styles.tableViewport}
          role="table"
          aria-label="Schema fields"
        >
          <Box className={styles.header} role="row">
            <Text role="columnheader" className={styles.headerCell}>
              Name
            </Text>
            <Text role="columnheader" className={styles.headerCell}>
              Type
            </Text>
            <Text
              role="columnheader"
              className={styles.headerCell}
              title="Required or optional"
            >
              Req
            </Text>
            <Text role="columnheader" className={styles.headerCell}>
              Description
            </Text>
            <Box
              role="columnheader"
              className={styles.headerCell}
              aria-label="Actions"
            />
          </Box>

          <Box
            className={styles.list}
            role="rowgroup"
            data-dragging={dropLine !== null || undefined}
            onDragLeave={(event) => {
              if (
                event.currentTarget.contains(event.relatedTarget as Node | null)
              )
                return;
              scheduleDropLine(null);
            }}
          >
            {nodes.length === 0 ? (
              <Box className={styles.empty}>
                <Text className={styles.emptyTitle}>No fields yet</Text>
                <Text className={styles.emptyHint}>
                  Add the first field to start describing this object.
                </Text>
                <Button
                  className={styles.ghostButton}
                  onClick={handleAddRoot}
                  disabled={!editable}
                  size="xs"
                >
                  <MdAdd />
                  Add field
                </Button>
              </Box>
            ) : (
              rowGroups.map((group) => (
                <div
                  key={group.id}
                  className={
                    group.reference ? styles.referenceGroup : undefined
                  }
                >
                  {group.rows.map(({ node, index }) => (
                    <React.Fragment key={node.id}>
                      {dropLine === index ? (
                        <Box className={styles.dropLine} aria-hidden="true" />
                      ) : null}
                      <MemoRow
                        node={node}
                        index={index}
                        handlers={rowHandlersFor(handlers, node)}
                      />
                    </React.Fragment>
                  ))}
                </div>
              ))
            )}
          </Box>
        </Box>
        {overflow ? (
          <Box className={styles.notice} role="status">
            <Text className={styles.noticeText}>
              Showing the first {maxRows} rows. Collapse a branch to see the
              rest.
            </Text>
          </Box>
        ) : null}
      </Box>
    );
  },
);

/* -------------------------------------------------------------------------- */
/* Public component                                                           */
/* -------------------------------------------------------------------------- */

export const SchemaTreeEditor = React.memo(
  (props: import("./libs/types").SchemaDesignerTreeProps) => {
    const value =
      props.value !== undefined ? props.value : (props.schema ?? {});
    return (
      <SchemaErrorBoundary onError={props.onError}>
        {typeof value === "boolean" ? (
          <InlineSchemaEditor
            value={value}
            onChange={props.onChange}
            disabled={props.readOnly}
            nested
          />
        ) : (
          <SchemaTreeEditorInner
            {...props}
            schema={value as JSONSchema}
            onChange={props.onChange}
          />
        )}
      </SchemaErrorBoundary>
    );
  },
);

function defaultAdvancedEditor(
  context: import("./libs/types").AdvancedEditorContext,
) {
  return (
    <InlineSchemaEditor
      schema={context.schema}
      fullSchema={context.fullSchema}
      required={context.required}
      onRequiredChange={context.onRequiredChange}
      schemaName={context.schemaName}
      path={context.path}
      nested
      disabled={context.readOnly}
      onChange={context.update}
    />
  );
}
