import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

import type {
  TransactionCategory,
  TransactionCategoryColor,
} from '../../api/generated/categoriesApi'
import {
  useCreateTransactionCategoryMutation,
  useDeleteTransactionCategoryMutation,
  useListTransactionCategoriesQuery,
  useUpdateTransactionCategoryMutation,
} from '../../api/generated/categoriesApi'
import type { ApiError } from '../../lib/errors'
import { errorMessage, validationMessages } from '../../lib/errors'

const COLORS: TransactionCategoryColor[] = [
  'slate',
  'blue',
  'teal',
  'green',
  'amber',
  'orange',
  'red',
  'purple',
]

type ManageCategoriesDialogProps = {
  open: boolean
  onClose: () => void
}

/** System categories are read-only; custom ones can be renamed, recoloured and deleted. */
export function ManageCategoriesDialog({ open, onClose }: ManageCategoriesDialogProps) {
  const { data, isLoading, error } = useListTransactionCategoriesQuery({}, { skip: !open })

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) {
    return null
  }

  const categories = data?.data.items ?? []

  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="manage-categories-title">
        <div className="dialog__header">
          <h2 id="manage-categories-title">Manage categories</h2>
          <button type="button" onClick={onClose} aria-label="Close categories dialog">
            Close
          </button>
        </div>

        {isLoading && <p role="status">Loading categories…</p>}
        {error !== undefined && (
          <p role="alert" className="error">
            {errorMessage(error)}
          </p>
        )}

        <ul className="category-list">
          {categories.map((category) =>
            category.kind === 'system' ? (
              <li key={category.category_id} className="category-row">
                <span>{category.name}</span>
                <span className="muted">System</span>
              </li>
            ) : (
              <CustomCategoryRow key={category.category_id} category={category} />
            ),
          )}
        </ul>

        <CreateCategoryForm />
      </div>
    </div>
  )
}

function CustomCategoryRow({ category }: { category: TransactionCategory }) {
  const [name, setName] = useState(category.name)
  const [color, setColor] = useState<TransactionCategoryColor>(category.color)
  const [message, setMessage] = useState<string | null>(null)
  const [updateCategory, { isLoading: saving }] = useUpdateTransactionCategoryMutation()
  const [deleteCategory, { isLoading: deleting }] = useDeleteTransactionCategoryMutation()

  const save = async (): Promise<void> => {
    setMessage(null)
    try {
      await updateCategory({
        categoryId: category.category_id,
        transactionCategoryUpdate: { name, color },
      }).unwrap()
    } catch (err) {
      const field = validationMessages(err as ApiError).name
      setMessage(field ?? errorMessage(err as ApiError))
    }
  }

  const remove = async (): Promise<void> => {
    setMessage(null)
    try {
      await deleteCategory({ categoryId: category.category_id }).unwrap()
    } catch (err) {
      setMessage(errorMessage(err as ApiError))
    }
  }

  return (
    <li className="category-row">
      <label className="visually-hidden" htmlFor={`name-${category.category_id}`}>
        Name
      </label>
      <input
        id={`name-${category.category_id}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={40}
      />
      <label className="visually-hidden" htmlFor={`color-${category.category_id}`}>
        Colour
      </label>
      <select
        id={`color-${category.category_id}`}
        value={color}
        onChange={(event) => setColor(event.target.value as TransactionCategoryColor)}
      >
        {COLORS.map((token) => (
          <option key={token} value={token}>
            {token}
          </option>
        ))}
      </select>
      <button type="button" onClick={() => void save()} disabled={saving || deleting}>
        Save
      </button>
      <button type="button" onClick={() => void remove()} disabled={saving || deleting}>
        Delete
      </button>
      {message !== null && (
        <p role="alert" className="error">
          {message}
        </p>
      )}
    </li>
  )
}

function CreateCategoryForm() {
  const [name, setName] = useState('')
  const [color, setColor] = useState<TransactionCategoryColor>('blue')
  const [message, setMessage] = useState<string | null>(null)
  const [createCategory, { isLoading }] = useCreateTransactionCategoryMutation()

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setMessage(null)
    try {
      await createCategory({ transactionCategoryCreate: { name, color } }).unwrap()
      setName('')
      setColor('blue')
    } catch (err) {
      const field = validationMessages(err as ApiError).name
      setMessage(field ?? errorMessage(err as ApiError))
    }
  }

  return (
    <form className="category-create" onSubmit={(event) => void submit(event)}>
      <h3>New custom category</h3>
      <label htmlFor="new-category-name">Name</label>
      <input
        id="new-category-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        maxLength={40}
        required
        aria-describedby={message !== null ? 'new-category-error' : undefined}
      />
      <label htmlFor="new-category-color">Colour</label>
      <select
        id="new-category-color"
        value={color}
        onChange={(event) => setColor(event.target.value as TransactionCategoryColor)}
      >
        {COLORS.map((token) => (
          <option key={token} value={token}>
            {token}
          </option>
        ))}
      </select>
      <button type="submit" disabled={isLoading}>
        Add category
      </button>
      {message !== null && (
        <p role="alert" id="new-category-error" className="error">
          {message}
        </p>
      )}
    </form>
  )
}
