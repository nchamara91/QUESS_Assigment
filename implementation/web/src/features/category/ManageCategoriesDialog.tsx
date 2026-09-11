import { useEffect, useRef, useState } from 'react'
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

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

type ManageCategoriesDialogProps = {
  open: boolean
  onClose: () => void
}

/** System categories are read-only; custom ones can be renamed, recoloured and deleted. */
export function ManageCategoriesDialog({ open, onClose }: ManageCategoriesDialogProps) {
  const { data, isLoading, isFetching, error, refetch } = useListTransactionCategoriesQuery({}, { skip: !open })
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    // Remember where the user came from and land focus inside the dialog, so
    // keyboard and screen-reader users are not stranded on the page behind it.
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeButtonRef.current?.focus()
    return () => {
      restoreFocusRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab') {
        return
      }
      const root = dialogRef.current
      if (root === null) {
        return
      }
      const focusable = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE))
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (first === undefined || last === undefined) {
        return
      }
      const active = document.activeElement
      if (!root.contains(active)) {
        // focus somehow left the modal dialog: pull it back in
        event.preventDefault()
        first.focus()
        return
      }
      if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) {
    return null
  }

  const categories = data?.data.items ?? []
  const systemCategories = categories.filter((category) => category.kind === 'system')
  const customCategories = categories.filter((category) => category.kind === 'custom')
  const refresh = (): void => {
    void refetch()
  }

  return (
    <div className="dialog-backdrop">
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-categories-title"
        ref={dialogRef}
      >
        <div className="dialog__header">
          <div className="dialog__heading">
            <span className="dialog__eyebrow">Workspace settings</span>
            <h2 id="manage-categories-title">Manage categories</h2>
            <p className="dialog__description">
              Organise your feed with labels your whole team can understand.
            </p>
          </div>
          <div className="dialog__header-actions">
            {isFetching && <span className="dialog__refresh" role="status">Refreshing</span>}
            <button
              type="button"
              ref={closeButtonRef}
              onClick={onClose}
              aria-label="Close categories dialog"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        </div>

        <div className="dialog__body">
          {isLoading && <p role="status">Loading categories</p>}
          {error !== undefined && (
            <p role="alert" className="error">
              {errorMessage(error)}
            </p>
          )}

          <section className="category-section" aria-labelledby="system-categories-heading">
            <div className="category-section__heading">
              <div>
                <h3 id="system-categories-heading">System categories</h3>
                <p>Built-in labels that keep your reporting consistent.</p>
              </div>
              <span className="count-badge">{systemCategories.length} fixed</span>
            </div>
            <ul className="category-list">
              {systemCategories.map((category) => (
                <li key={category.category_id} className="category-row category-row--system">
                  <span className="category-row__name">{category.name}</span>
                  <span className="muted">Always available</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="category-section" aria-labelledby="custom-categories-heading">
            <div className="category-section__heading">
              <div>
                <h3 id="custom-categories-heading">Custom categories</h3>
                <p>Tailor the feed to the way your organisation works.</p>
              </div>
              <span className="count-badge">{customCategories.length} / 50</span>
            </div>
            {customCategories.length > 0 ? (
              <ul className="category-list">
                {customCategories.map((category) => (
                  <CustomCategoryRow key={category.category_id} category={category} onChanged={refresh} />
                ))}
              </ul>
            ) : (
              <div className="category-empty">
                <span className="category-empty__icon" aria-hidden="true">＋</span>
                <div>
                  <strong>No custom categories yet</strong>
                  <p>Create one below to make your feed feel like yours.</p>
                </div>
              </div>
            )}
          </section>

          <CreateCategoryForm onCreated={refresh} />
        </div>
      </div>
    </div>
  )
}

function CustomCategoryRow({
  category,
  onChanged,
}: {
  category: TransactionCategory
  onChanged: () => void
}) {
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
      onChanged()
    } catch (err) {
      const field = validationMessages(err as ApiError).name
      setMessage(field ?? errorMessage(err as ApiError))
    }
  }

  const remove = async (): Promise<void> => {
    setMessage(null)
    try {
      await deleteCategory({ categoryId: category.category_id }).unwrap()
      onChanged()
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

function CreateCategoryForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<TransactionCategoryColor>('blue')
  const [message, setMessage] = useState<string | null>(null)
  const [createCategory, { isLoading }] = useCreateTransactionCategoryMutation()

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    setMessage(null)
    try {
      await createCategory({ transactionCategoryCreate: { name, color } }).unwrap()
      onCreated()
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
