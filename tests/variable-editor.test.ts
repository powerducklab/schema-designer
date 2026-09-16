import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import {
  CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import {
  createVariableMap,
  createVariableCompletionSource,
  findVariableTokens,
  createMinimalChange,
} from "../src/react/variableTextEditor/libs/variableTextEditor.utils";

describe("variable editor compatibility", () => {
  it("normalizes lookup names without mutating host variables", () => {
    const variable = Object.freeze({ name: " token ", value: "secret" });
    expect(createVariableMap([variable]).get("token")?.name).toBe("token");
    expect(variable.name).toBe(" token ");
  });

  it.each([
    ["{{to}}", 4, "{{token}}"],
    ["{to}", 3, "{token}"],
    ["{{to}", 4, "{{token}}"],
  ])(
    "replaces existing closing braces in %s",
    async (text, position, expected) => {
      const state = EditorState.create({ doc: text as string });
      const result = (await createVariableCompletionSource([{ name: "token" }])(
        new CompletionContext(state, position as number, true),
      )) as CompletionResult;
      const completion = result.options[0];
      const next = state.update({
        changes: {
          from: result.from,
          to: result.to ?? (position as number),
          insert: completion.apply as string,
        },
      }).state;
      expect(next.doc.toString()).toBe(expected);
    },
  );

  it("keeps repeated token occurrences distinct and applies minimal external changes", () => {
    const text = "{{id}}/{{id}}";
    expect(
      findVariableTokens(text, [{ name: "id" }]).map((token) => token.from),
    ).toEqual([0, 7]);
    const change = createMinimalChange(text, "{{id}}/next/{{id}}");
    expect(
      text.slice(0, change.from) + change.insert + text.slice(change.to),
    ).toBe("{{id}}/next/{{id}}");
  });
});
