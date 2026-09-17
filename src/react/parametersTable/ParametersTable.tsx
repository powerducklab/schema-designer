"use client";

import { createSchemaForType } from "../../core/schema";
import type { InlineSchemaType } from "../inlineSchemaEditor/types";

import { parameterKey, parameterValueText } from "../../core/parameters";
import { ParameterSettings } from "./ParameterSettings";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActionBar,
  Box,
  Button,
  Checkbox,
  Flex,
  Portal,
  Select,
  Span,
  Table,
  Text,
  createListCollection,
} from "@chakra-ui/react";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import { LuGripVertical, LuRefreshCw } from "react-icons/lu";
import { AiOutlineDelete } from "react-icons/ai";

import type {
  ColumnDefinition,
  ColumnId,
  OpenApiParameter,
  ParameterRow,
  ParameterTableGeneratorContext,
  ParameterTableProps,
  SplitterResizeSession,
} from "./libs/types";

import {
  DEFAULT_COLUMNS,
  buildColumnDefsById,
  fitColumnWidths,
  getRightNeighborId,
  getVisibleColumns,
} from "./libs/columns";

import { applyAdjacentSplitterResize } from "./libs/splitterResize";

import { reorder } from "./libs/reorder";

import {
  resolveParameterType,
  resolveParameterValue,
} from "./libs/parameterValue";

import { VariableTextEditor } from "../variableTextEditor";

import styles from "./ParametersTable.module.css";
import {
  createRows,
  areParameterArraysEqual,
  reconcileRows,
  getDisplayValue,
} from "./libs/lib";

const EMPTY_VARIABLES = Object.freeze([]) as readonly never[];
const CHECKBOX_COLUMN_WIDTH = 48;
const RowDragHandle = memo(function RowDragHandle() {
  return (
    <Box
      className={styles.dragHandle}
      aria-label="Drag to reorder"
      role="button"
    >
      <LuGripVertical size={14} />
    </Box>
  );
});

export const ParameterTable = memo(function ParameterTable(
  props: ParameterTableProps,
) {
  const {
    parameters,
    onChange,
    onSelectionChange,
    onRowReorder,
    generateValue,
    faker,
    emptyState,
    showRequired = false,
    showType = false,
    showDescription = false,
    stickyHeader = true,
    height = "100%",
    className,
  } = props;

  const appendLocation = !props.readOnly ? props.autoAppendLocation : undefined;
  const ensureDraft = useCallback((items: ParameterRow[]): ParameterRow[] => {
    if (!appendLocation || items.some(row => !row.parameter.name)) return items;
    return [...items, ...createRows([{ name: "", in: appendLocation, schema: { type: "string" } }])];
  }, [appendLocation]);
  const readOnly = props.readOnly === true;
  const requestMode = props.mode === "request";
  const lockStructure = requestMode && !props.editableParameters;
  const [generationError, setGenerationError] = useState<string | null>(null);
  const generationRef = useRef<AbortController | null>(null);
  const rowsRef = useRef<ParameterRow[]>([]);
  useEffect(() => () => generationRef.current?.abort(), []);
  const [rows, setRows] = useState<ParameterRow[]>(() =>
    ensureDraft(createRows(parameters)),
  );

  rowsRef.current = rows;
  const hasRows = rows.length > 0;
  useEffect(() => {
    generationRef.current?.abort();
  }, [readOnly, requestMode, props.document]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  /**
   * Last parameter array emitted by this component.
   *
   * This is critical for controlled mode.
   *
   * Parent flow:
   *
   * editor
   *   -> local rows
   *   -> onChange(...)
   *   -> parent state
   *   -> parameters prop
   *
   * Without this guard, the parameters effect would recreate every row
   * and consequently destroy editor focus / selection / cursor state.
   */
  const lastEmittedParametersRef = useRef<readonly OpenApiParameter[] | null>(
    null,
  );

  const visibleColumns = useMemo(
    () =>
      getVisibleColumns({
        showRequired,
        showType,
        showDescription,
      }),
    [showRequired, showType, showDescription],
  );

  const columnDefsById = useMemo(
    () => buildColumnDefsById(DEFAULT_COLUMNS),
    [],
  );

  /**
   * Widths are REAL PIXEL WIDTHS of the data columns.
   *
   * Important:
   * the table itself is always width: 100%.
   *
   * The total of data-column widths is normalized against:
   *
   * viewport width - checkbox width
   */
  const [columnWidths, setColumnWidths] = useState<Record<ColumnId, number>>(
    () => {
      const initial: Record<ColumnId, number> = {} as Record<ColumnId, number>;

      for (const column of DEFAULT_COLUMNS) {
        initial[column.id] = column.defaultWidth;
      }

      return initial;
    },
  );

  const widthsByLayoutRef = useRef(new Map<string, Record<ColumnId, number>>());
  const activeLayoutRef = useRef<string | null>(null);
  const currentWidthsRef = useRef(columnWidths);
  currentWidthsRef.current = columnWidths;

  const viewportRef = useRef<HTMLDivElement | null>(null);

  const tableRef = useRef<HTMLTableElement | null>(null);

  const resizeHandleRefs = useRef<Map<ColumnId, HTMLSpanElement>>(new Map());

  /**
   * Controlled parameter synchronization.
   */
  useEffect(() => {
    const lastEmitted = lastEmittedParametersRef.current;

    if (lastEmitted && areParameterArraysEqual(parameters, lastEmitted)) {
      lastEmittedParametersRef.current = null;
      return;
    }

    setRows((previous) => ensureDraft(reconcileRows(previous, parameters)));
    setSelectedIds(new Set());
  }, [parameters, ensureDraft]);

  useEffect(() => {
    onSelectionChange?.([...selectedIds]);
  }, [onSelectionChange, selectedIds]);

  /**
   * Keep data columns filling the table's available width.
   *
   * This does NOT change table width.
   *
   * table = 100%
   *
   * Only the <col> widths are redistributed.
   */
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const layoutKey = visibleColumns.map((column) => column.id).join(",");
    if (activeLayoutRef.current !== null) {
      widthsByLayoutRef.current.set(
        activeLayoutRef.current,
        currentWidthsRef.current,
      );
    }
    activeLayoutRef.current = layoutKey;
    const restored =
      widthsByLayoutRef.current.get(layoutKey) ??
      (Object.fromEntries(
        DEFAULT_COLUMNS.map((column) => [column.id, column.defaultWidth]),
      ) as Record<ColumnId, number>);
    let firstMeasurement = true;
    let lastWidth = -1;
    let disposed = false;
    const synchronize = () => {
      if (disposed) return;
      const width = viewport.clientWidth;
      // ResizeObserver also fires for height changes and sends an initial notification.
      if (!Number.isFinite(width) || width <= 0 || width === lastWidth) return;
      lastWidth = width;
      const baseline = firstMeasurement ? restored : undefined;
      firstMeasurement = false;
      setColumnWidths((previous) =>
        fitColumnWidths(
          baseline ?? previous,
          visibleColumns,
          width - CHECKBOX_COLUMN_WIDTH,
        ),
      );
    };
    // Commit column visibility and widths before the browser paints either layout.
    synchronize();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", synchronize);
      return () => {
        disposed = true;
        window.removeEventListener("resize", synchronize);
      };
    }
    const observer = new ResizeObserver(synchronize);
    observer.observe(viewport);
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, [visibleColumns, hasRows]);

  const [localValues, setLocalValues] = useState<
    import("./libs/types").ParameterValues
  >({});
  const effectiveValues = props.values ?? localValues;
  const controlledValuesRef = useRef(props.values !== undefined);
  controlledValuesRef.current = props.values !== undefined;
  const valuesRef = useRef(effectiveValues);
  valuesRef.current = effectiveValues;
  const onValuesChangeRef = useRef(props.onValuesChange);
  onValuesChangeRef.current = props.onValuesChange;
  const writeValues = (
    nextRows: ParameterRow[],
    changedIds: ReadonlySet<string>,
  ) => {
    const next = { ...valuesRef.current };
    for (const row of nextRows) {
      if (!changedIds.has(row.id)) continue;
      if (Object.prototype.hasOwnProperty.call(row, "generatedValue")) {
        const key = parameterKey(row.parameter);
        next[key] = {
          enabled: next[key]?.enabled ?? true,
          value: row.generatedValue,
        };
      }
    }
    if (!controlledValuesRef.current) valuesRef.current = next;
    setLocalValues(next);
    onValuesChangeRef.current?.(next);
  };
  const editValue = (rowId: string, value: unknown) => {
    if (readOnly) return;
    const next = rowsRef.current.map((row) =>
      row.id === rowId ? { ...row, generatedValue: value } : row,
    );
    rowsRef.current = next;
    setRows(next);
    writeValues(next, new Set([rowId]));
  };

  const allSelected =
    rows.length > 0 && rows.every((row) => selectedIds.has(row.id));

  const someSelected =
    rows.some((row) => selectedIds.has(row.id)) && !allSelected;

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      if (!checked) {
        setSelectedIds(new Set());
        return;
      }

      setSelectedIds(new Set(rows.map((row) => row.id)));
    },
    [rows],
  );

  const handleSelectRow = useCallback((rowId: string, checked: boolean) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);

      if (checked) {
        next.add(rowId);
      } else {
        next.delete(rowId);
      }

      return next;
    });
  }, []);

  /**
   * Single commit path for parameter changes.
   */
  const commitRows = useCallback(
    (nextRows: ParameterRow[]) => {
      if (readOnly || lockStructure) return;
      const previousRows = rowsRef.current;
      const nextValues = { ...valuesRef.current };
      let valuesChanged = false;
      for (const previous of previousRows) {
        const nextRow = nextRows.find((row) => row.id === previous.id);
        const oldKey = parameterKey(previous.parameter);
        const newKey = nextRow && parameterKey(nextRow.parameter);
        if (oldKey === newKey || !Object.prototype.hasOwnProperty.call(nextValues, oldKey)) continue;
        const entry = nextValues[oldKey];
        delete nextValues[oldKey];
        if (newKey) nextValues[newKey] = entry;
        valuesChanged = true;
      }
      nextRows = ensureDraft(nextRows);
      rowsRef.current = nextRows;
      setRows(nextRows);

      const nextParameters = nextRows.filter(row => !appendLocation || row.parameter.name).map((row) => row.parameter);

      lastEmittedParametersRef.current = nextParameters;

      onChange?.(nextParameters);
      if (valuesChanged) {
        valuesRef.current = nextValues;
        setLocalValues(nextValues);
        onValuesChangeRef.current?.(nextValues);
      }
    },
    [onChange, readOnly, lockStructure, ensureDraft, appendLocation],
  );

  /**
   * Reorder is semantically different from editing.
   */
  const commitReorder = useCallback(
    (nextRows: ParameterRow[]) => {
      if (readOnly || lockStructure) return;
      rowsRef.current = nextRows;
      setRows(nextRows);

      const nextParameters = nextRows.map((row) => row.parameter);

      lastEmittedParametersRef.current = nextParameters;

      onChange?.(nextParameters);
      onRowReorder?.(nextParameters);
    },
    [onChange, onRowReorder, readOnly, lockStructure],
  );

  const typeOptions = useMemo(
    () =>
      createListCollection({
        items: [
          {
            label: "string",
            value: "string",
          },
          {
            label: "integer",
            value: "integer",
          },
          ...["number", "boolean", "array", "object", "null"].map((value) => ({
            label: value,
            value,
          })),
        ],
      }),
    [],
  );

  const handleGenerate = useCallback(async () => {
    if (readOnly) return;
    setGenerationError(null);
    generationRef.current?.abort();
    const controller = new AbortController();
    generationRef.current = controller;
    const snapshot = rowsRef.current;
    const valuesSnapshot = valuesRef.current;
    const generated = new Map<string, ParameterRow>();
    await Promise.all(
      snapshot.map(async (row, rowIndex) => {
        if (
          !selectedIds.has(row.id) ||
          (!controlledValuesRef.current &&
            Object.prototype.hasOwnProperty.call(row, "generatedValue"))
        )
          return;
        const key = parameterKey(row.parameter);
        if (
          valuesSnapshot?.[key] ||
          resolveParameterValue(row.parameter, props.document).source !==
            "missing"
        )
          return;
        try {
          const context: ParameterTableGeneratorContext = {
            parameter: row.parameter,
            rowIndex,
            signal: controller.signal,
            document: props.document,
          };
          const value = generateValue
            ? await generateValue(context)
            : faker
              ? await faker.generate(context)
              : await import("./libs/generateValue").then((module) =>
                  module.generateParameterValue(context),
                );
          generated.set(row.id, { ...row, generatedValue: value });
        } catch (error) {
          if (!controller.signal.aborted) {
            setGenerationError(
              error instanceof Error
                ? error.message
                : "Value generation failed.",
            );
            try {
              props.onError?.(error);
            } catch {
              /* Keep other rows usable. */
            }
          }
        }
      }),
    );
    if (controller.signal.aborted) return;
    const originals = new Map(snapshot.map((row) => [row.id, row]));
    const next = rowsRef.current.map((row) => {
      const key = parameterKey(row.parameter);
      return row === originals.get(row.id) &&
        valuesRef.current?.[key] === valuesSnapshot?.[key]
        ? (generated.get(row.id) ?? row)
        : row;
    });
    const changedIds = new Set(
      next
        .filter((row, index) => row !== rowsRef.current[index])
        .map((row) => row.id),
    );
    if (!changedIds.size) return;
    rowsRef.current = next;
    setRows(next);
    writeValues(next, changedIds);
  }, [
    faker,
    generateValue,
    selectedIds,
    readOnly,
    props.onError,
    props.document,
  ]);

  const onDragEnd = useCallback(
    (result: DropResult) => {
      const { destination, source } = result;

      if (!destination) {
        return;
      }

      if (destination.droppableId !== source.droppableId) {
        return;
      }

      if (destination.index === source.index) {
        return;
      }

      const next = reorder(rows, source.index, destination.index);

      commitReorder(next);
    },
    [commitReorder, rows],
  );

  /**
   * Resize session.
   *
   * IMPORTANT:
   * start widths are obtained from REAL DOM geometry.
   *
   * This fixes the classic problem where logical defaults differ from
   * actual browser-rendered widths because table-layout: fixed and
   * width: 100% redistribute available space.
   */
  const resizeSessionRef = useRef<SplitterResizeSession | null>(null);

  const resizeRafRef = useRef<number | null>(null);

  const pendingResizeSnapshotRef = useRef<{
    clientX: number;
    pointerId: number;
  } | null>(null);

  const resizingColumnRef = useRef<ColumnId | null>(null);

  const getActualColumnWidth = useCallback(
    (columnId: ColumnId): number | null => {
      const header = tableRef.current?.querySelector<HTMLElement>(
        `th[data-column="${columnId}"]`,
      );

      if (!header) {
        return null;
      }

      const width = header.getBoundingClientRect().width;

      if (!Number.isFinite(width) || width <= 0) {
        return null;
      }

      return width;
    },
    [],
  );

  const cleanupResize = useCallback(() => {
    resizingColumnRef.current = null;

    pendingResizeSnapshotRef.current = null;

    resizeSessionRef.current = null;

    if (resizeRafRef.current !== null) {
      window.cancelAnimationFrame(resizeRafRef.current);

      resizeRafRef.current = null;
    }

    const handles = resizeHandleRefs.current;

    for (const handle of handles.values()) {
      handle.removeAttribute("data-resizing");
    }
  }, []);

  const onResizeMoveWindow = useCallback((event: PointerEvent) => {
    const session = resizeSessionRef.current;

    if (!session) {
      return;
    }

    if (session.pointerId !== event.pointerId) {
      return;
    }

    pendingResizeSnapshotRef.current = {
      clientX: event.clientX,
      pointerId: event.pointerId,
    };

    if (resizeRafRef.current !== null) {
      return;
    }

    resizeRafRef.current = window.requestAnimationFrame(() => {
      resizeRafRef.current = null;

      const activeSession = resizeSessionRef.current;

      const snapshot = pendingResizeSnapshotRef.current;

      if (!activeSession || !snapshot) {
        return;
      }

      if (snapshot.pointerId !== activeSession.pointerId) {
        return;
      }

      const clientX = snapshot.clientX;

      setColumnWidths((previous) =>
        applyAdjacentSplitterResize({
          session: activeSession,
          clientX,
          widths: previous,
        }),
      );
    });
  }, []);

  const onResizeEndWindow = useCallback(
    (event: PointerEvent) => {
      const session = resizeSessionRef.current;

      if (!session) {
        return;
      }

      if (session.pointerId !== event.pointerId) {
        return;
      }

      if (event.type === "pointerup")
        setColumnWidths((widths) =>
          applyAdjacentSplitterResize({
            session,
            clientX: event.clientX,
            widths,
          }),
        );
      cleanupResize();

      window.removeEventListener("pointermove", onResizeMoveWindow);

      window.removeEventListener("pointerup", onResizeEndWindow);

      window.removeEventListener("pointercancel", onResizeEndWindow);
    },
    [cleanupResize, onResizeMoveWindow],
  );

  useEffect(() => {
    return () => {
      cleanupResize();

      window.removeEventListener("pointermove", onResizeMoveWindow);

      window.removeEventListener("pointerup", onResizeEndWindow);

      window.removeEventListener("pointercancel", onResizeEndWindow);
    };
  }, [cleanupResize, onResizeEndWindow, onResizeMoveWindow]);

  const onResizeStart = useCallback(
    (event: React.PointerEvent<HTMLElement>, leftColumn: ColumnDefinition) => {
      if (event.pointerType === "mouse" && event.button !== 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const rightId = getRightNeighborId(visibleColumns, leftColumn.id);

      if (!rightId) {
        return;
      }

      const leftDefinition = columnDefsById[leftColumn.id];

      const rightDefinition = columnDefsById[rightId];

      if (!leftDefinition || !rightDefinition) {
        return;
      }

      const actualLeftWidth = getActualColumnWidth(leftColumn.id);

      const actualRightWidth = getActualColumnWidth(rightId);

      if (actualLeftWidth === null || actualRightWidth === null) {
        return;
      }

      if (
        actualLeftWidth < leftDefinition.minWidth ||
        actualRightWidth < rightDefinition.minWidth
      ) {
        return;
      }

      const session: SplitterResizeSession = {
        leftId: leftColumn.id,
        rightId,

        pointerId: event.pointerId,

        startClientX: event.clientX,

        startLeftWidth: actualLeftWidth,

        startRightWidth: actualRightWidth,

        leftMinWidth: leftDefinition.minWidth,

        leftMaxWidth: leftDefinition.maxWidth ?? Number.POSITIVE_INFINITY,

        rightMinWidth: rightDefinition.minWidth,

        rightMaxWidth: rightDefinition.maxWidth ?? Number.POSITIVE_INFINITY,
      };

      resizeSessionRef.current = session;

      pendingResizeSnapshotRef.current = {
        clientX: event.clientX,
        pointerId: event.pointerId,
      };

      resizingColumnRef.current = leftColumn.id;

      const leftHandle = resizeHandleRefs.current.get(leftColumn.id);

      leftHandle?.setAttribute("data-resizing", "true");

      window.addEventListener("pointermove", onResizeMoveWindow, {
        passive: true,
      });

      window.addEventListener("pointerup", onResizeEndWindow, {
        passive: true,
      });

      window.addEventListener("pointercancel", onResizeEndWindow, {
        passive: true,
      });
    },
    [
      columnDefsById,
      getActualColumnWidth,
      onResizeEndWindow,
      onResizeMoveWindow,
      visibleColumns,
    ],
  );

  const handleInputChange = useCallback(
    (
      rowId: string,
      updater: (parameter: OpenApiParameter) => OpenApiParameter,
    ) => {
      const currentRows = rowsRef.current;

      const nextRows = currentRows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              parameter: updater(row.parameter),
            }
          : row,
      );

      commitRows(nextRows);
    },
    [commitRows, rows],
  );

  const handleDeleteSelected = useCallback(() => {
    if (selectedIds.size === 0) {
      return;
    }

    const nextRows = rows.filter((row) => !selectedIds.has(row.id));

    setSelectedIds(new Set());
    commitRows(nextRows);
  }, [commitRows, rows, selectedIds]);

  const setResizeHandleRef = useCallback(
    (columnId: ColumnId, node: HTMLSpanElement | null) => {
      if (node) {
        resizeHandleRefs.current.set(columnId, node);
      } else {
        resizeHandleRefs.current.delete(columnId);
      }
    },
    [],
  );

  if (rows.length === 0) {
    return (
      <Box
        className={`${styles.root} ${className ?? ""}`}
        data-sticky-header={stickyHeader}
        style={{ height }}
      >
        {generationError && (
          <Text role="alert" fontSize="sm" p="2" color="var(--color-danger)">
            {generationError}
          </Text>
        )}
        <Box className={styles.toolbar}>
          <Box className={styles.toolbarLeft}>
            <Text className={styles.toolbarTitle}>Parameters</Text>
          </Box>
        </Box>

        <Box className={styles.empty}>
          {emptyState ?? <Text>No parameters defined.</Text>}
        </Box>
      </Box>
    );
  }

  return (
    <Box
      className={`${styles.root} ${className ?? ""}`}
      data-sticky-header={stickyHeader}
      style={{ height }}
    >
      {generationError && (
        <Text role="alert" fontSize="sm" p="2" color="var(--color-danger)">
          {generationError}
        </Text>
      )}
      <Box ref={viewportRef} className={styles.tableViewport}>
        <DragDropContext onDragEnd={onDragEnd}>
          <Droppable droppableId="parameters" direction="vertical">
            {(provided) => (
              <Box
                ref={provided.innerRef}
                {...provided.droppableProps}
                className={styles.tableContainer}
              >
                <Table.Root
                  ref={tableRef}
                  className={styles.table}
                  stickyHeader={stickyHeader ? true : undefined}
                  interactive
                  size="sm"
                >
                  <colgroup>
                    <col className={styles.colCheckbox} />

                    {visibleColumns.map((column) => (
                      <col
                        key={column.id}
                        className={styles.colData}
                        style={{
                          width: columnWidths[column.id],
                        }}
                      />
                    ))}
                  </colgroup>

                  <Table.Header>
                    <Table.Row>
                      <Table.ColumnHeader
                        className={`${styles.headerCell} ${styles.checkboxCell}`}
                      >
                        <Flex className={styles.checkboxCellGroup}>
                          <Checkbox.Root
                            checked={
                              allSelected
                                ? true
                                : someSelected
                                  ? "indeterminate"
                                  : false
                            }
                            onCheckedChange={(details) =>
                              handleSelectAll(details.checked === true)
                            }
                            size="sm"
                            aria-label="Select all parameters"
                            className={styles.checkboxRoot}
                          >
                            <Checkbox.HiddenInput />
                            <Checkbox.Control />
                          </Checkbox.Root>
                        </Flex>
                      </Table.ColumnHeader>

                      {visibleColumns.map((column) => (
                        <Table.ColumnHeader
                          data-column={column.id}
                          key={column.id}
                          data-sticky={column.id === "name" ? "end" : undefined}
                          className={styles.headerCell}
                        >
                          <Box className={styles.headerContent}>
                            <Span className={styles.headerLabel}>
                              {column.label}
                            </Span>

                            {getRightNeighborId(visibleColumns, column.id) && (
                              <Span
                                tabIndex={0}
                                aria-valuenow={Math.round(
                                  columnWidths[column.id],
                                )}
                                aria-valuemin={column.minWidth}
                                onKeyDown={(event) => {
                                  if (
                                    event.key !== "ArrowLeft" &&
                                    event.key !== "ArrowRight"
                                  )
                                    return;
                                  event.preventDefault();
                                  const rightId = getRightNeighborId(
                                    visibleColumns,
                                    column.id,
                                  );
                                  if (!rightId) return;
                                  const right = columnDefsById[rightId];
                                  setColumnWidths((widths) =>
                                    applyAdjacentSplitterResize({
                                      widths,
                                      clientX:
                                        (event.key === "ArrowRight" ? 1 : -1) *
                                        (event.shiftKey ? 32 : 8),
                                      session: {
                                        leftId: column.id,
                                        rightId,
                                        pointerId: 0,
                                        startClientX: 0,
                                        startLeftWidth: widths[column.id],
                                        startRightWidth: widths[rightId],
                                        leftMinWidth: column.minWidth,
                                        leftMaxWidth:
                                          column.maxWidth ?? Infinity,
                                        rightMinWidth: right.minWidth,
                                        rightMaxWidth:
                                          right.maxWidth ?? Infinity,
                                      },
                                    }),
                                  );
                                }}
                                ref={(node: HTMLSpanElement | null) =>
                                  setResizeHandleRef(column.id, node)
                                }
                                className={styles.resizeHandle}
                                role="separator"
                                aria-orientation="vertical"
                                aria-label={`Resize ${column.label} column`}
                                onPointerDown={(event) =>
                                  onResizeStart(event, column)
                                }
                              />
                            )}
                          </Box>
                        </Table.ColumnHeader>
                      ))}
                    </Table.Row>
                  </Table.Header>

                  <Table.Body>
                    {rows.map((row, index) => {
                      const parameter = row.parameter;

                      const displayValue =
                        props.values !== undefined
                          ? resolveParameterValue(parameter, props.document)
                          : getDisplayValue(row, props.document);

                      const type = resolveParameterType(
                        parameter,
                        props.document,
                      );

                      const selected = selectedIds.has(row.id);

                      return (
                        <Draggable
                          key={row.id}
                          draggableId={row.id}
                          index={index}
                          isDragDisabled={readOnly || lockStructure}
                        >
                          {(dragProvided, snapshot) => (
                            <Table.Row
                              ref={dragProvided.innerRef}
                              className={styles.row}
                              data-selected={selected}
                              data-dragging={
                                snapshot.isDragging ? "true" : "false"
                              }
                              {...dragProvided.draggableProps}
                            >
                              <Table.Cell
                                className={`${styles.cell} ${styles.checkboxCell}`}
                              >
                                <Flex className={styles.checkboxCellGroup}>
                                  <Box
                                    {...dragProvided.dragHandleProps}
                                    className={styles.dragHandleWrap}
                                    display={
                                      readOnly || lockStructure
                                        ? "none"
                                        : undefined
                                    }
                                    aria-label={`Drag ${parameter.name ?? ""}`}
                                  >
                                    <RowDragHandle />
                                  </Box>

                                  <Checkbox.Root
                                    size="sm"
                                    checked={selected}
                                    onCheckedChange={(details) =>
                                      handleSelectRow(
                                        row.id,
                                        details.checked === true,
                                      )
                                    }
                                    aria-label={`Select ${
                                      parameter.name ?? "parameter"
                                    }`}
                                    className={styles.checkboxRoot}
                                  >
                                    <Checkbox.HiddenInput />
                                    <Checkbox.Control />
                                  </Checkbox.Root>
                                </Flex>
                              </Table.Cell>

                              {visibleColumns.map((column) => {
                                switch (column.id) {
                                  case "name":
                                    return (
                                      <Table.Cell
                                        key={column.id}
                                        className={`${styles.cell} ${styles.nameCell}`}
                                      >
                                        <Box
                                          className={styles.variableTextEditor}
                                        >
                                          <VariableTextEditor
                                            autoFocus={false}
                                            ariaLabel={`Name for ${parameter.name}`}
                                            readOnly={readOnly || lockStructure}
                                            value={String(parameter.name ?? "")}
                                            onSubmit={() => {}}
                                            placeholder="Name"
                                            variables={props.variables ?? EMPTY_VARIABLES}
                                            allowLineBreaks={false}
                                            submitOnEnter={true}
                                            expansionMode="overlay"
                                            minHeight={28}
                                            safePadding={4}
                                            maxFocusedHeight={360}
                                            onChange={(name) => {
                                              handleInputChange(
                                                row.id,
                                                (p) => ({
                                                  ...p,
                                                  name,
                                                }),
                                              );
                                            }}
                                          />
                                          {
                                            <ParameterSettings
                                              parameter={parameter}
                                              document={props.document}
                                              disabled={readOnly || lockStructure}
                                              onChange={(next) =>
                                                handleInputChange(
                                                  row.id,
                                                  () => next,
                                                )
                                              }
                                            />
                                          }
                                        </Box>
                                      </Table.Cell>
                                    );

                                  case "value":
                                    return (
                                      <Table.Cell
                                        key={column.id}
                                        className={styles.cell}
                                      >
                                        <Box
                                          className={styles.variableTextEditor}
                                        >
                                          {requestMode && (
                                            <Checkbox.Root
                                              className={styles.checkboxRoot}
                                              size="sm"
                                              disabled={
                                                readOnly ||
                                                parameter.in === "path"
                                              }
                                              checked={
                                                parameter.in === "path" ||
                                                (effectiveValues[
                                                  parameterKey(parameter)
                                                ]?.enabled ??
                                                  true)
                                              }
                                              aria-label={`Include ${parameter.name}`}
                                              onCheckedChange={(event) => {
                                                const key =
                                                  parameterKey(parameter);
                                                const next = {
                                                  ...valuesRef.current,
                                                  [key]: {
                                                    value: valuesRef.current?.[
                                                      key
                                                    ]
                                                      ? valuesRef.current[key]
                                                          .value
                                                      : displayValue.value,
                                                    enabled:
                                                      event.checked === true,
                                                  },
                                                };
                                                setLocalValues(next);
                                                onValuesChangeRef.current?.(
                                                  next,
                                                );
                                              }}
                                            >
                                              <Checkbox.HiddenInput />
                                              <Checkbox.Control>
                                                <Checkbox.Indicator />
                                              </Checkbox.Control>
                                            </Checkbox.Root>
                                          )}
                                          <VariableTextEditor
                                            autoFocus={false}
                                            ariaLabel={`Value for ${parameter.name}`}
                                            readOnly={readOnly}
                                            value={parameterValueText(
                                              Object.hasOwn(
                                                effectiveValues,
                                                parameterKey(parameter),
                                              )
                                                ? effectiveValues[
                                                    parameterKey(parameter)
                                                  ].value
                                                : displayValue.value,
                                            )}
                                            onSubmit={() => {}}
                                            placeholder="Value"
                                            variables={props.variables ?? EMPTY_VARIABLES}
                                            allowLineBreaks={true}
                                            expansionMode="overlay"
                                            minHeight={28}
                                            safePadding={4}
                                            maxFocusedHeight={360}
                                            onChange={(value) => {
                                              editValue(row.id, value);
                                            }}
                                          />
                                        </Box>
                                      </Table.Cell>
                                    );

                                  case "type":
                                    return (
                                      <Table.Cell
                                        key={column.id}
                                        className={styles.cell}
                                      >
                                        {requestMode ||
                                        readOnly ||
                                        parameter.content ? (
                                          <Span className={styles.description}>
                                            {type}
                                          </Span>
                                        ) : (
                                          <Select.Root
                                            disabled={readOnly || lockStructure}
                                            collection={typeOptions}
                                            size="xs"
                                            value={[type.split(" (")[0]]}
                                            onValueChange={(event) => {
                                              const newType = event.value[0];

                                              if (!newType) {
                                                return;
                                              }

                                              handleInputChange(
                                                row.id,
                                                (p) => ({
                                                  ...p,
                                                  schema: createSchemaForType(
                                                    newType as InlineSchemaType,
                                                    typeof p.schema === "object"
                                                      ? p.schema
                                                      : undefined,
                                                  ),
                                                }),
                                              );
                                            }}
                                          >
                                            <Select.HiddenSelect />

                                            <Select.Control>
                                              <Select.Trigger
                                                aria-label={`Type for ${parameter.name}`}
                                              >
                                                <Select.ValueText
                                                  placeholder={
                                                    type === "unknown"
                                                      ? "Select type"
                                                      : type
                                                  }
                                                />
                                              </Select.Trigger>

                                              <Select.IndicatorGroup>
                                                <Select.Indicator />
                                              </Select.IndicatorGroup>
                                            </Select.Control>

                                            <Portal>
                                              <Select.Positioner>
                                                <Select.Content className="pdDesignerSelectMenu">
                                                  {typeOptions.items.map(
                                                    (item) => (
                                                      <Select.Item
                                                        key={item.value}
                                                        item={item}
                                                      >
                                                        {item.label}

                                                        <Select.ItemIndicator />
                                                      </Select.Item>
                                                    ),
                                                  )}
                                                </Select.Content>
                                              </Select.Positioner>
                                            </Portal>
                                          </Select.Root>
                                        )}
                                      </Table.Cell>
                                    );

                                  case "required":
                                    return (
                                      <Table.Cell
                                        key={column.id}
                                        className={styles.cell}
                                      >
                                        <Span
                                          className={
                                            parameter.in === "path" ||
                                            parameter.required
                                              ? styles.required
                                              : styles.optional
                                          }
                                        >
                                          {parameter.in === "path" ||
                                          parameter.required
                                            ? "Required"
                                            : "Optional"}
                                        </Span>
                                      </Table.Cell>
                                    );

                                  case "description":
                                    return (
                                      <Table.Cell
                                        key={column.id}
                                        className={styles.cell}
                                      >
                                        <Span className={styles.description}>
                                          {parameter.description ?? "—"}
                                        </Span>
                                      </Table.Cell>
                                    );

                                  default:
                                    return null;
                                }
                              })}
                            </Table.Row>
                          )}
                        </Draggable>
                      );
                    })}

                    {provided.placeholder}
                  </Table.Body>
                </Table.Root>
              </Box>
            )}
          </Droppable>
        </DragDropContext>

        <ActionBar.Root open={selectedIds.size > 0}>
          <Portal>
            <ActionBar.Positioner>
              <ActionBar.Content className={styles.actionBarContent}>
                <Box className={styles.actionBarLeft}>
                  <ActionBar.SelectionTrigger
                    className={styles.actionBarTrigger}
                  >
                    {selectedIds.size} selected
                  </ActionBar.SelectionTrigger>
                </Box>

                <Span className={styles.actionBarDivider} />

                <Button
                  variant="ghost"
                  size="xs"
                  className={styles.actionButton}
                  disabled={readOnly || lockStructure}
                  onClick={handleDeleteSelected}
                >
                  <AiOutlineDelete className={styles.actionIcon} />
                  Delete
                </Button>

                <Span className={styles.actionBarDivider} />

                <Button
                  variant="ghost"
                  size="xs"
                  className={`${styles.actionButton} ${styles.actionButtonAccent}`}
                  disabled={readOnly}
                  onClick={handleGenerate}
                >
                  <LuRefreshCw className={styles.actionIcon} />
                  Generate values
                </Button>
              </ActionBar.Content>
            </ActionBar.Positioner>
          </Portal>
        </ActionBar.Root>
      </Box>
    </Box>
  );
});
