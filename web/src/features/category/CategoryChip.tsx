import { colorStyle } from '../../lib/colors'

type CategoryChipProps = {
  name: string | null
  color: string | null
}

/** A coloured chip; a transaction with no category shows a neutral placeholder. */
export function CategoryChip({ name, color }: CategoryChipProps) {
  if (!name) {
    return <span className="chip chip--empty">Uncategorised</span>
  }
  const style = color ? colorStyle(color) : undefined
  return (
    <span
      className="chip"
      style={{
        backgroundColor: style?.background,
        color: style?.foreground,
        borderColor: style?.border,
      }}
    >
      {name}
    </span>
  )
}
