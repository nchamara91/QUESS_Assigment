import { skipToken } from '@reduxjs/toolkit/query'

import type { TransactionCategory } from '../../api/generated/categoriesApi'
import { useGetTransactionQuery } from '../../api/generated/transactionsApi'
import { errorMessage } from '../../lib/errors'
import { formatDate, formatUsdc } from '../../lib/money'
import { CategoryChip } from '../category/CategoryChip'
import { CategorySelect } from '../category/CategorySelect'

type TransactionDrawerProps = {
  transactionId: string | null
  categories: TransactionCategory[]
  categoryId: string | null
  pending: boolean
  error: string | undefined
  onSelect: (categoryId: string | null) => void
  onClose: () => void
}

export function TransactionDrawer({
  transactionId,
  categories,
  categoryId,
  pending,
  error,
  onSelect,
  onClose,
}: TransactionDrawerProps) {
  const detail = useGetTransactionQuery(transactionId ? { transactionId } : skipToken)

  if (transactionId === null) {
    return null
  }

  const transaction = detail.data?.data
  const category = categories.find((item) => item.category_id === categoryId)

  return (
    <aside className="drawer" aria-label="Transaction detail">
      <div className="drawer__header">
        <h2>Transaction detail</h2>
        <button type="button" onClick={onClose} aria-label="Close transaction detail">
          Close
        </button>
      </div>

      {detail.isLoading && <p role="status">Loading transaction…</p>}
      {detail.error !== undefined && (
        <div>
          <p role="alert" className="error">
            {errorMessage(detail.error)}
          </p>
          <button type="button" onClick={() => void detail.refetch()}>
            Retry
          </button>
        </div>
      )}

      {transaction !== undefined && (
        <dl className="drawer__fields">
          <dt>Id</dt>
          <dd>{transaction.transaction_id}</dd>
          <dt>Kind</dt>
          <dd>{transaction.kind}</dd>
          <dt>Direction</dt>
          <dd>{transaction.direction}</dd>
          <dt>Status</dt>
          <dd>{transaction.status}</dd>
          <dt>Amount</dt>
          <dd>{formatUsdc(transaction.amount_minor)}</dd>
          <dt>Counterparty</dt>
          <dd>{transaction.counterparty?.name ?? transaction.counterparty_name ?? '—'}</dd>
          <dt>Date</dt>
          <dd>{formatDate(transaction.created_at)}</dd>
        </dl>
      )}

      <div className="drawer__category">
        <CategoryChip name={category?.name ?? null} color={category?.color ?? null} />
        <CategorySelect
          id={`drawer-category-${transactionId}`}
          label="Category for this transaction"
          categories={categories}
          value={categoryId}
          disabled={pending}
          onChange={onSelect}
        />
        {error !== undefined && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
    </aside>
  )
}
