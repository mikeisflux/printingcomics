import { useEffect, useState, type CSSProperties } from 'react';

/**
 * A quantity box that accepts whatever digits are typed — top row or number
 * pad — and only snaps to the allowed range when the field is left.
 *
 * The old `<input type="number">` clamped on every keystroke, so with a
 * minimum above the first digit typed ("2" → 25) a customer could never
 * reach the number they wanted, and the browser's own number handling got in
 * the way of the number pad. This is a plain text field with a numeric
 * keyboard on phones; ↑/↓ still step the value.
 */
export function QuantityInput({ value, min = 1, max, onChange, style, ariaLabel = 'Quantity' }: {
  value: number;
  min?: number;
  max?: number;
  onChange: (qty: number) => void;
  style?: CSSProperties;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(String(value));
  // Follow programmatic changes (product switch, +/− buttons, AI fill).
  useEffect(() => { setText(String(value)); }, [value]);

  const clamp = (n: number) => Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, n));

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      autoComplete="off"
      aria-label={ariaLabel}
      value={text}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^0-9]/g, '');
        setText(digits);
        const n = parseInt(digits, 10);
        if (Number.isFinite(n) && n >= min && (max === undefined || n <= max)) onChange(n);
      }}
      onBlur={() => {
        const n = parseInt(text, 10);
        const next = Number.isFinite(n) ? clamp(n) : min;
        setText(String(next));
        if (next !== value) onChange(next);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp') { e.preventDefault(); onChange(clamp(value + 1)); }
        if (e.key === 'ArrowDown') { e.preventDefault(); onChange(clamp(value - 1)); }
      }}
      style={style}
    />
  );
}
