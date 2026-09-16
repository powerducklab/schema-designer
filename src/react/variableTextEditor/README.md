# @powerduckie/variable-text-editor

> CodeMirror 6 based variable interpolation text editor for template / endpoint variable scenarios, with hover tooltip, auto-completion, max-length protection, controlled value, accessibility support and security hardening.

## Features

- ✅ Variable syntax support: `{var}` / `{{var}}`
- ✅ Real-time variable autocomplete triggered after `{` / `{{`
- ✅ Variable token highlight & custom inline color / background color
- ✅ Hover popover with variable metadata (type, description, value)
- ✅ Controlled component, compatible with React 18+
- ✅ Max length guard for typing / paste / drop / beforeinput
- ✅ Enter submit + Shift+Enter line break configurable
- ✅ Auto height expand on focus with line wrapping
- ✅ Full accessibility: aria-label, aria-disabled, aria-readonly
- ✅ SSR-safe CSS color validation & CSS attribute escaping (XSS mitigation)
- ✅ Clean compartment-based CodeMirror state reconfiguration
- ✅ Memory safety: proper cleanup of timers, rAF, ResizeObserver, editor instance
- ✅ TypeScript strict typing out of box

## Install

```
# npm
npm install @powerduckie/variable-text-editor @codemirror/state @codemirror/view @codemirror/autocomplete @codemirror/commands
# yarn
yarn add @powerduckie/variable-text-editor @codemirror/state @codemirror/view @codemirror/autocomplete @codemirror/commands
# pnpm
pnpm add @powerduckie/variable-text-editor @codemirror/state @codemirror/view @codemirror/autocomplete @codemirror/commands
```

> Peer dependencies: `react >=18`, `@chakra-ui/react`

## Quick Start

```
import { VariableTextEditor } from "@powerduckie/variable-text-editor";
import type { EndpointVariable } from "@powerduckie/variable-text-editor";
import { useState } from "react";

const sampleVars: EndpointVariable[] = [
  {
    name: "apiBaseUrl",
    type: "environment",
    value: "https://api.example.com",
    description: "Backend API base address"
  },
  {
    name: "userToken",
    type: "secret",
    description: "User authorization token"
  }
];

export default function Demo() {
  const [value, setValue] = useState("Call {{apiBaseUrl}} with {userToken}");
  return (
    <VariableTextEditor
      value={value}
      variables={sampleVars}
      onChange={setValue}
      placeholder="Type template with {var} or {{var}}"
      ariaLabel="Template variable editor"
      submitOnEnter={false}
      minHeight={40}
      maxFocusedHeight={240}
      maxLength={2000}
    />
  );
}
```

## Props

| Prop             | Type                                  | Default                  | Description                                         |
| ---------------- | ------------------------------------- | ------------------------ | --------------------------------------------------- |
| value            | `string`                              | required                 | Controlled editor content                           |
| variables        | `readonly EndpointVariable[] \| null` | `[]`                     | Variable metadata list for highlight & autocomplete |
| disabled         | `boolean`                             | `false`                  | Fully disable editor                                |
| readOnly         | `boolean`                             | `false`                  | Read-only mode (still interactive for tooltip)      |
| placeholder      | `string`                              | `""`                     | Empty state placeholder                             |
| ariaLabel        | `string`                              | `"Variable text editor"` | Accessibility label                                 |
| className        | `string`                              | `undefined`              | Custom root css class                               |
| autoFocus        | `boolean`                             | `false`                  | Auto focus after mount                              |
| submitOnEnter    | `boolean`                             | `false`                  | Trigger onSubmit when Enter pressed                 |
| minHeight        | `number`                              | `40`                     | Minimum editor height (px)                          |
| maxFocusedHeight | `number`                              | `240`                    | Max expand height when focused                      |
| maxLength        | `number`                              | `16384`                  | Global character limit for all input sources        |
| onChange         | `(value: string) => void`             | `undefined`              | Content change callback                             |
| onSubmit         | `(value: string) => void`             | `undefined`              | Submit callback (Enter)                             |
| onFocus          | `() => void`                          | `undefined`              | Focus handler                                       |
| onBlur           | `() => void`                          | `undefined`              | Blur handler                                        |

### EndpointVariable Type

```
interface EndpointVariable {
  name: string;
  value?: string;
  description?: string;
  type?: string; // secret / environment / request / dynamic / unknown
  color?: string;
  backgroundColor?: string;
}
```

## Utility Exports

```
import {
  findVariableTokens,
  splitVariableText,
  createVariableMap,
  sanitizePlainText,
  truncateInsertion,
  normalizeMaximumLength,
  escapeCssAttrValue
} from "@powerduckie/variable-text-editor/utils";
```

- `findVariableTokens`: Scan string and extract all `{var}` / `{{var}}` tokens with position mapping
- `splitVariableText`: Split raw text into plain text segments + variable token segments for rendering
- `sanitizePlainText`: Normalize line breaks to whitespace for one-line template use case
- `escapeCssAttrValue`: Safe escaping for CSS attribute selectors (XSS prevention)

## Security Notes (P0/P1 Hardening)

1. **Input length enforcement**: Applies to typing, paste, drag-drop, beforeinput to prevent payload flooding
2. **CSS value sanitization**: Validates custom `color` / `backgroundColor` before injecting inline styles
3. **CSS attribute escaping**: Variable position attributes used for tooltip positioning are properly escaped
4. **Transaction filtering**: External value updates bypass max-length guard only for controlled sync
5. **Clean teardown**: All timers, rAF, ResizeObserver and editor instance destroyed on unmount to avoid memory leak / stale state
6. **No unsafe innerHTML**: Token decoration uses CodeMirror mark decorations only, never raw HTML injection

## Styling

Create `VariableTextEditor.module.css` (matching the component reference):

```
.root {
  position: relative;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 6px;
  min-height: var(--editor-min-height);
}
.root[data-focused] {
  border-color: #3182ce;
  box-shadow: 0 0 0 1px #3182ce;
}
.root[data-disabled] {
  background: #f7fafc;
  opacity: 0.7;
}
.variableToken {
  border-radius: var(--space-1);
  padding: 0 3px;
}
.variableToken_secret {
  background: #fefcbf;
  color: #744210;
}
.variableToken_environment {
  background: #e6fffa;
  color: #234e52;
}
.variableToken_request {
  background: #ebf8ff;
  color: #2a4365;
}
.variableToken_dynamic {
  background: #f0fff4;
  color: #22543d;
}
.variableToken_unknown {
  background: #f7fafc;
  color: #718096;
}
.hoverPopover {
  position: fixed;
  z-index: 9999;
  max-width: var(--popover-max-width, 360px);
  padding: 12px;
  background: white;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
}
.hoverPopoverArrow {
  position: absolute;
  left: var(--popover-arrow-left);
}
.popoverName { font-weight: 600; }
.popoverType { font-size: 12px; color: #718096; margin: 4px 0; }
.popoverValue { font-family: monospace; font-size:13px; margin:6px 0; }
.popoverDescription { font-size:13px; color: #4a5568; }
```

## Limitations

- Designed for **single-line template scenario** (line breaks normalized to space on paste/drop)
- Variable pattern only supports `{name}` / `{{name}}`; nested braces are not parsed
- Depends on Chakra UI `Box`; you can fork and replace with native div if needed
- Autocomplete only triggers after `{` / `{{` prefix

## License

MIT
