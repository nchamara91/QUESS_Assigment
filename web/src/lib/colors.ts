import type { TransactionCategoryColor } from '../api/generated/categoriesApi'

/** The eight palette tokens from the contract, mapped to CSS custom properties. */
export type ColorToken = TransactionCategoryColor

export type ColorStyle = {
  /** Design-token variable names, resolved by index.css. */
  background: string
  foreground: string
  border: string
}

const TOKENS: Record<ColorToken, ColorStyle> = {
  slate: { background: 'var(--chip-slate-bg)', foreground: 'var(--chip-slate-fg)', border: 'var(--chip-slate-border)' },
  blue: { background: 'var(--chip-blue-bg)', foreground: 'var(--chip-blue-fg)', border: 'var(--chip-blue-border)' },
  teal: { background: 'var(--chip-teal-bg)', foreground: 'var(--chip-teal-fg)', border: 'var(--chip-teal-border)' },
  green: { background: 'var(--chip-green-bg)', foreground: 'var(--chip-green-fg)', border: 'var(--chip-green-border)' },
  amber: { background: 'var(--chip-amber-bg)', foreground: 'var(--chip-amber-fg)', border: 'var(--chip-amber-border)' },
  orange: { background: 'var(--chip-orange-bg)', foreground: 'var(--chip-orange-fg)', border: 'var(--chip-orange-border)' },
  red: { background: 'var(--chip-red-bg)', foreground: 'var(--chip-red-fg)', border: 'var(--chip-red-border)' },
  purple: { background: 'var(--chip-purple-bg)', foreground: 'var(--chip-purple-fg)', border: 'var(--chip-purple-border)' },
}

/**
 * A colour the client does not know still renders legibly: the fallback is a
 * neutral token rather than an invisible or unreadable chip.
 */
const FALLBACK: ColorStyle = {
  background: 'var(--chip-unknown-bg)',
  foreground: 'var(--chip-unknown-fg)',
  border: 'var(--chip-unknown-border)',
}

export function colorStyle(color: string): ColorStyle {
  return (TOKENS as Record<string, ColorStyle | undefined>)[color] ?? FALLBACK
}
