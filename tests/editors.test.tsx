// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
  act,
} from "@testing-library/react";
import { ChakraProvider, createSystem, defaultConfig } from "@chakra-ui/react";
import { useState } from "react";
import { InlineSchemaEditor } from "../src/react/inlineSchemaEditor/InlineSchemaEditor";
import { SchemaValueEditor } from "../src/react/inlineSchemaEditor/components/SchemaValueEditor";
import { SchemaTreeEditor } from "../src/react/schemaTreeEditor/SchemaTreeEditor";
import { ParameterTable } from "../src/react/parametersTable/ParametersTable";
import type { SchemaValue } from "../src/core/types";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    value: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as any;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  globalThis.requestAnimationFrame = (callback) =>
    setTimeout(() => callback(0), 0) as any;
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
});
afterEach(cleanup);
const system = createSystem(defaultConfig, {
  disableLayers: true,
  preflight: false,
});
function provider(element: React.ReactNode) {
  return <ChakraProvider value={system}>{element}</ChakraProvider>;
}

describe("interactive editing", () => {
  it("keeps incomplete object input until it becomes valid", () => {
    const onChange = vi.fn();
    render(
      provider(
        <SchemaValueEditor value={{}} type="object" onChange={onChange} />,
      ),
    );
    const input = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: '{"key":' } });
    expect(input.value).toBe('{"key":');
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '{"key":false}' } });
    expect(onChange).toHaveBeenCalledWith({ key: false });
  });
  it("honors advanced and composition visibility flags", () => {
    render(
      provider(
        <InlineSchemaEditor
          value={{ type: "string" }}
          showAdvanced={false}
          showComposition={false}
          showLiveJson={false}
          onChange={() => {}}
        />,
      ),
    );
    expect(screen.queryByRole("tab", { name: "Advanced" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Validation" }));
    expect(screen.queryByText("Add allOf item")).toBeNull();
  });
  it("edits boolean schemas without converting them to objects", () => {
    function Host() {
      const [value, setValue] = useState<SchemaValue>(false);
      return <InlineSchemaEditor value={value} onChange={setValue} />;
    }
    render(provider(<Host />));
    fireEvent.click(screen.getByRole("button", { name: "Allow all values" }));
    expect(screen.getByText("Any value is allowed")).toBeTruthy();
  });
  it("does not dispatch mutations while disabled", () => {
    const onChange = vi.fn();
    render(
      provider(
        <InlineSchemaEditor value={false} disabled onChange={onChange} />,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Allow all values" }));
    expect(onChange).not.toHaveBeenCalled();
  });
  it("preserves extensions when editing through the controlled value API", () => {
    const onChange = vi.fn();
    render(
      provider(
        <InlineSchemaEditor
          value={{ type: "string", "x-extension": false }}
          onChange={onChange}
          showLiveJson={false}
        />,
      ),
    );
    const description = screen.getByRole("textbox", { name: "Description" });
    expect(description).toBeTruthy();
    fireEvent.change(description!, { target: { value: "Updated" } });
    expect(onChange).toHaveBeenLastCalledWith({
      type: "string",
      "x-extension": false,
      description: "Updated",
    });
  });
  it("opens Inline settings from a tree row by default", async () => {
    render(
      provider(
        <SchemaTreeEditor
          value={{ properties: { field: { type: "string" } } }}
          onChange={() => {}}
        />,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Advanced settings" }));
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: "Advanced" })).toBeTruthy(),
    );
  });
  it("renders scalar and boolean roots", () => {
    render(provider(<SchemaTreeEditor value={false} onChange={() => {}} />));
    expect(screen.getByText("No values are allowed")).toBeTruthy();
  });
  it("separates request enablement from batch selection", async () => {
    const onValuesChange = vi.fn();
    render(
      provider(
        <ParameterTable
          parameters={[{ name: "id", in: "query", example: 0 }]}
          mode="request"
          onValuesChange={onValuesChange}
        />,
      ),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Include id" }).closest("label")!,
    );
    await waitFor(() =>
      expect(onValuesChange).toHaveBeenCalledWith({
        '["query","id"]': { value: 0, enabled: false },
      }),
    );
    expect(
      (screen.getByRole("checkbox", { name: "Select id" }) as HTMLInputElement)
        .checked,
    ).toBe(false);
  });
  it("does not overwrite a controlled value edited during async generation", async () => {
    let finish!: (value: unknown) => void;
    const generateValue = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const onValuesChange = vi.fn();
    const parameters = [
      { name: "token", in: "query" as const, schema: { type: "string" } },
    ];
    const view = render(
      provider(
        <ParameterTable
          parameters={parameters}
          mode="request"
          values={{}}
          onValuesChange={onValuesChange}
          generateValue={generateValue}
        />,
      ),
    );
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select token" }).closest("label")!,
    );
    const generate = await screen.findByRole("button", {
      name: "Generate values",
    });
    fireEvent.click(generate);
    await waitFor(() => expect(generateValue).toHaveBeenCalledOnce());
    const edited = {
      '["query","token"]': { value: "{{session_token}}", enabled: true },
    };
    view.rerender(
      provider(
        <ParameterTable
          parameters={parameters}
          mode="request"
          values={edited}
          onValuesChange={onValuesChange}
          generateValue={generateValue}
        />,
      ),
    );
    await act(async () => {
      finish("stale generated token");
    });
    expect(onValuesChange).not.toHaveBeenCalled();
    expect(
      screen.getByRole("textbox", { name: "Value for token" }).textContent,
    ).toBe("{{session_token}}");
  });
  it("does not resurrect generated values after a controlled reset", async () => {
    const parameters = [
      { name: "token", in: "query" as const, schema: { type: "string" } },
    ];
    const generateValue = vi.fn().mockResolvedValue("generated");
    const onValuesChange = vi.fn();
    const table = (
      values: import("../src/react/parametersTable/libs/types").ParameterValues,
    ) =>
      provider(
        <ParameterTable
          parameters={parameters}
          mode="request"
          values={values}
          onValuesChange={onValuesChange}
          generateValue={generateValue}
        />,
      );
    const view = render(table({}));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select token" }).closest("label")!,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Generate values" }),
    );
    await waitFor(() =>
      expect(onValuesChange).toHaveBeenCalledWith({
        '["query","token"]': { value: "generated", enabled: true },
      }),
    );
    view.rerender(
      table({ '["query","token"]': { value: "generated", enabled: true } }),
    );
    expect(
      screen.getByRole("textbox", { name: "Value for token" }).textContent,
    ).toBe("generated");
    view.rerender(table({}));
    expect(
      screen.getByRole("textbox", { name: "Value for token" }).textContent,
    ).not.toContain("generated");
    fireEvent.click(screen.getByRole("button", { name: "Generate values" }));
    await waitFor(() => expect(generateValue).toHaveBeenCalledTimes(2));
  });
});

describe("compact editor presentation", () => {
  it("expands nested branches again after collapsing all", () => {
    render(
      provider(
        <SchemaTreeEditor
          value={{
            type: "object",
            properties: {
              account: {
                type: "object",
                properties: {
                  address: {
                    type: "object",
                    properties: { city: { type: "string" } },
                  },
                },
              },
            },
          }}
          onChange={() => {}}
        />,
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByDisplayValue("city")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(screen.queryByDisplayValue("city")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand all" }));
    expect(screen.getByDisplayValue("city")).toBeTruthy();
  });

  it("defaults to key and value columns and restores optional columns", () => {
    const parameters = [
      { name: "limit", in: "query" as const, schema: { type: "integer" } },
    ];
    const view = render(provider(<ParameterTable parameters={parameters} />));
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    view.rerender(
      provider(
        <ParameterTable
          parameters={parameters}
          showType
          showRequired
          showDescription
        />,
      ),
    );
    expect(screen.getAllByRole("columnheader")).toHaveLength(6);
  });
});

describe("variable editor public entry", () => {
  it("preserves the editor DOM across external updates and toggles read-only", async () => {
    const { VariableTextEditor } =
      await import("../src/react/variableTextEditor");
    const changed = vi.fn();
    const view = render(
      provider(
        <VariableTextEditor
          value="{{host}}/v1"
          ariaLabel="Endpoint"
          onChange={changed}
        />,
      ),
    );
    const editor = screen.getByRole("textbox", { name: "Endpoint" });
    view.rerender(
      provider(
        <VariableTextEditor
          value="{{host}}/v2"
          ariaLabel="Endpoint"
          onChange={changed}
          readOnly
        />,
      ),
    );
    expect(screen.getByRole("textbox", { name: "Endpoint" })).toBe(editor);
    expect(editor.textContent).toBe("{{host}}/v2");
    expect(editor.getAttribute("aria-readonly")).toBe("true");
    expect(changed).not.toHaveBeenCalled();
    view.unmount();
  });
});

it("restores column widths and keeps input instances when toggling visibility", () => {
  const width = vi
    .spyOn(Element.prototype, "clientWidth", "get")
    .mockReturnValue(1000);
  try {
    const parameters = [
      { name: "limit", in: "query" as const, schema: { type: "integer" } },
    ];
    const table = (expanded: boolean) =>
      provider(
        <ParameterTable
          parameters={parameters}
          showType={expanded}
          showRequired={expanded}
          showDescription={expanded}
        />,
      );
    const view = render(table(true));
    const editor = screen.getByRole("textbox", { name: "Name for limit" });
    const widths = () =>
      Array.from(view.container.querySelectorAll("col")).map(
        (column) => column.style.width,
      );
    const before = widths();
    view.rerender(table(false));
    view.rerender(table(true));
    expect(widths()).toEqual(before);
    expect(screen.getByRole("textbox", { name: "Name for limit" })).toBe(
      editor,
    );
  } finally {
    width.mockRestore();
  }
});

it("cancels a tree name draft on Escape without committing it", () => {
  const changed = vi.fn();
  render(
    provider(
      <SchemaTreeEditor
        value={{ properties: { original: { type: "string" } } }}
        onChange={changed}
      />,
    ),
  );
  const input = screen.getByDisplayValue("original");
  act(() => input.focus());
  fireEvent.change(input, { target: { value: "unwanted" } });
  fireEvent.keyDown(input, { key: "Escape" });
  expect(changed).not.toHaveBeenCalled();
  expect((input as HTMLInputElement).value).toBe("original");
});

it("measures columns when an empty table receives rows", () => {
  const width = vi
    .spyOn(Element.prototype, "clientWidth", "get")
    .mockReturnValue(1000);
  try {
    const view = render(provider(<ParameterTable parameters={[]} />));
    view.rerender(
      provider(
        <ParameterTable parameters={[{ name: "limit", in: "query" }]} />,
      ),
    );
    const total = Array.from(view.container.querySelectorAll("col")).reduce(
      (sum, col) => sum + (parseFloat(col.style.width) || 48),
      0,
    );
    expect(total).toBeCloseTo(1000, 1);
  } finally {
    width.mockRestore();
  }
});

it("discards pending generation after entering read-only mode", async () => {
  let finish!: (value: string) => void;
  const generateValue = vi.fn(
    () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  );
  const changed = vi.fn();
  const parameters = [{ name: "token", in: "query" as const }];
  const table = (readOnly: boolean) =>
    provider(
      <ParameterTable
        parameters={parameters}
        generateValue={generateValue}
        onValuesChange={changed}
        readOnly={readOnly}
      />,
    );
  const view = render(table(false));
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select token" }).closest("label")!,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "Generate values" }),
  );
  await waitFor(() => expect(generateValue).toHaveBeenCalledTimes(1));
  view.rerender(table(true));
  await act(async () => finish("stale"));
  expect(changed).not.toHaveBeenCalled();
});

it("emits an empty edit and retains CodeMirror across presentation changes", async () => {
  const { VariableTextEditor } =
    await import("../src/react/variableTextEditor");
  const { EditorView } = await import("@codemirror/view");
  const changed = vi.fn();
  const view = render(
    provider(
      <VariableTextEditor
        value="{{host}}"
        onChange={changed}
        ariaLabel="Audit input"
      />,
    ),
  );
  const input = screen.getByRole("textbox", { name: "Audit input" });
  const editor = EditorView.findFromDOM(input)!;
  act(() =>
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: "" },
    }),
  );
  expect(changed).toHaveBeenLastCalledWith("");
  view.rerender(
    provider(
      <VariableTextEditor
        value=""
        onChange={changed}
        ariaLabel="Audit input"
        placeholder="New placeholder"
        minHeight={40}
      />,
    ),
  );
  expect(screen.getByRole("textbox", { name: "Audit input" })).toBe(input);
  expect(EditorView.findFromDOM(input)).toBe(editor);
});

it("updates variable colors without another document edit", async () => {
  const { VariableTextEditor } =
    await import("../src/react/variableTextEditor");
  const element = (color: string) =>
    provider(
      <VariableTextEditor
        value="{{host}}"
        variables={[{ name: "host", color }]}
      />,
    );
  const view = render(element("red"));
  expect(
    (view.container.querySelector("[data-variable-name]") as HTMLElement).style
      .color,
  ).toBe("red");
  view.rerender(element("blue"));
  expect(
    (view.container.querySelector("[data-variable-name]") as HTMLElement).style
      .color,
  ).toBe("blue");
});

it("blocks paste into a read-only variable editor", async () => {
  const { VariableTextEditor } =
    await import("../src/react/variableTextEditor");
  const changed = vi.fn();
  render(
    provider(<VariableTextEditor value="locked" readOnly onChange={changed} />),
  );
  const input = screen.getByRole("textbox");
  fireEvent.paste(input, { clipboardData: { getData: () => "unexpected" } });
  expect(input.textContent).toBe("locked");
  expect(changed).not.toHaveBeenCalled();
});

it("resizes adjacent columns with the keyboard while keeping total width", () => {
  const width = vi
    .spyOn(Element.prototype, "clientWidth", "get")
    .mockReturnValue(1000);
  try {
    const view = render(
      provider(<ParameterTable parameters={[{ name: "x", in: "query" }]} />),
    );
    const widths = () =>
      Array.from(view.container.querySelectorAll("col"))
        .slice(1)
        .map((col) => parseFloat(col.style.width));
    const before = widths();
    fireEvent.keyDown(
      screen.getByRole("separator", { name: "Resize Name column" }),
      { key: "ArrowRight" },
    );
    const after = widths();
    expect(after[0]).toBeCloseTo(before[0] + 8);
    expect(after[0] + after[1]).toBeCloseTo(before[0] + before[1]);
    expect(
      screen.queryByRole("separator", { name: "Resize Value column" }),
    ).toBeNull();
  } finally {
    width.mockRestore();
  }
});

it("renames and deletes editable request parameters without orphaning values", async () => {
  const { EditorView } = await import("@codemirror/view");
  const changed = vi.fn();
  function Host() {
    const [parameters, setParameters] = useState([{name:"token",in:"header" as const,schema:{type:"string" as const}}]);
    const [values,setValues] = useState<any>({'["header","token"]':{value:"{{session}}",enabled:true},'["query","other"]':{value:"keep",enabled:true}});
    return <ParameterTable mode="request" editableParameters parameters={parameters} onChange={setParameters as any} values={values} onValuesChange={next=>{changed(next);setValues(next);}} variables={[{name:"session",value:"fixture",type:"environment"}]}/>;
  }
  render(provider(<Host/>));
  const input=screen.getByRole("textbox",{name:"Name for token"});
  const editor=EditorView.findFromDOM(input)!;
  act(()=>editor.dispatch({changes:{from:0,to:editor.state.doc.length,insert:"X-Token"}}));
  await waitFor(()=>expect(changed).toHaveBeenCalledWith({'["header","X-Token"]':{value:"{{session}}",enabled:true},'["query","other"]':{value:"keep",enabled:true}}));
  fireEvent.click(screen.getByLabelText("Select X-Token"));
  fireEvent.click(await screen.findByRole("button",{name:"Delete"}));
  await waitFor(()=>expect(changed).toHaveBeenLastCalledWith({'["query","other"]':{value:"keep",enabled:true}}));
});

it("removes a variable's resolved color when a script unsets it",async()=>{
 const {VariableTextEditor}=await import("../src/react/variableTextEditor");
 const view=render(provider(<VariableTextEditor value="{{token}}" variables={[{name:"token",color:"green",type:"environment"}]}/>));
 expect((view.container.querySelector('[data-variable-name="token"]') as HTMLElement).style.color).toBe("green");
 view.rerender(provider(<VariableTextEditor value="{{token}}" variables={[]}/>));
 expect((view.container.querySelector('[data-variable-name="token"]') as HTMLElement).style.color).toBe("");
});

it('request tables promote the draft and append a new blank row', async () => {
  const { EditorView } = await import('@codemirror/view');
  const changed = vi.fn();
  function Host() {
    const [parameters,setParameters] = useState<any[]>([]);
    return <ParameterTable mode="request" editableParameters autoAppendLocation="query" parameters={parameters} onChange={next=>{changed(next);setParameters(next);}}/>;
  }
  render(provider(<Host/>));
  expect(screen.queryByText('No parameters defined.')).toBeNull();
  expect(changed).not.toHaveBeenCalled();
  const input = screen.getByRole('textbox', {name:'Name for'});
  const editor = EditorView.findFromDOM(input)!;
  act(()=>editor.dispatch({changes:{from:0,insert:'search'}}));
  await waitFor(()=>expect(changed).toHaveBeenLastCalledWith([{name:'search',in:'query',schema:{type:'string'}}]));
  expect(screen.getByRole('textbox',{name:'Name for search'})).toBe(input);
  expect(screen.getByRole('textbox',{name:'Name for',exact:true})).not.toBe(input);
});

it("parks an overlay editor in a body-level fixed layer while focused", async () => {
  const { VariableTextEditor } = await import(
    "../src/react/variableTextEditor"
  );
  const rect = {
    top: 120,
    left: 100,
    bottom: 148,
    right: 500,
    width: 400,
    height: 28,
    x: 100,
    y: 120,
    toJSON() {},
  } as unknown as DOMRect;
  const spy = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockReturnValue(rect);
  try {
    render(
      provider(
        <VariableTextEditor
          value=""
          expansionMode="overlay"
          minHeight={28}
          onChange={() => {}}
        />,
      ),
    );

    const input = screen.getByRole("textbox") as HTMLElement;
    act(() => input.focus());

    await waitFor(() => {
      const layer = document.querySelector(
        "[data-pd-overlay-layer]",
      ) as HTMLElement;
      expect(layer?.style.display).toBe("block");
    });

    const layer = document.querySelector(
      "[data-pd-overlay-layer]",
    ) as HTMLElement;
    // The CodeMirror host is moved out of the (possibly transformed) table cell.
    expect(layer.querySelector(".cm-editor")).not.toBeNull();

    await act(async () => {
      fireEvent.blur(input);
    });
    await waitFor(() => expect(layer.style.display).toBe("none"));
    // Editor is returned to its anchor after blur.
    expect(layer.querySelector(".cm-editor")).toBeNull();
  } finally {
    spy.mockRestore();
  }
});
