import type { TransactionCategory } from '../../api/generated/categoriesApi'

type CategorySelectProps = {
  id: string
  /** Accessible name for the control. */
  label: string
  categories: TransactionCategory[]
  value: string | null
  disabled?: boolean
  onChange: (categoryId: string | null) => void
}

/**
 * A native select, deliberately: it is keyboard- and screen-reader-native, so
 * the inline selector is usable without re-implementing combobox semantics.
 */
export function CategorySelect({
  id,
  label,
  categories,
  value,
  disabled = false,
  onChange,
}: CategorySelectProps) {
  return (
    <div className="category-select">
      <label className="visually-hidden" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => {
          const next = event.target.value
          onChange(next === '' ? null : next)
        }}
      >
        <option value="">Uncategorised</option>
        {categories.map((category) => (
          <option key={category.category_id} value={category.category_id}>
            {category.name}
          </option>
        ))}
      </select>
    </div>
  )
}
