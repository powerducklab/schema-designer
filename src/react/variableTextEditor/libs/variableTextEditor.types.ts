export interface EndpointVariable {
  name: string;
  value?: string;
  description?: string;
  type?: string;
  color?: string;
  backgroundColor?: string;
}

export interface VariableTokenMatch {
  token: string;
  name: string;
  from: number;
  to: number;
  variable?: EndpointVariable;
}

export interface VariableTextPart {
  key: string;
  text: string;
  token?: VariableTokenMatch;
}

export interface VariableTokenPresentation {
  className: string;
  tokenColor?: string;
  tokenBgColor?: string;
}

export interface VariableTextEditorProps {
  value: string;
  variables?: readonly EndpointVariable[] | null;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  autoFocus?: boolean;
  allowLineBreaks?: boolean;
  submitOnEnter?: boolean;
  minHeight?: number;
  /** Expand over neighboring content while preserving the original row height. */
  expansionMode?: "inline" | "overlay";
  safePadding?: number;
  maxFocusedHeight?: number;
  maxLength?: number;
  /**
   * Visual chrome.
   * - "embedded" (default): borderless and transparent, meant to live inside
   *   an outer bordered container such as the request URL bar or a parameter
   *   table cell. Focus never paints an extra inner border (no layout shift).
   * - "field": a standalone input that mirrors the baseUi TextInput — its own
   *   subtle border, rounded corners and accent focus ring — used for bare
   *   credential fields. The 1px border is always reserved, so focusing never
   *   changes the geometry.
   */
  variant?: "field" | "embedded";
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}
