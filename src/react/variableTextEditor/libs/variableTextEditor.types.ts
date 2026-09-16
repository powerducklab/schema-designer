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
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
}
