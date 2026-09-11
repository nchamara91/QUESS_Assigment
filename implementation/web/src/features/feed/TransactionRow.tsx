import type { TransactionCategory } from '../../api/generated/categoriesApi'
import type { Transaction } from '../../api/generated/transactionsApi'
import { formatDate, formatUsdc } from '../../lib/money'
import { CategoryChip } from '../category/CategoryChip'
import { CategorySelect } from '../category/CategorySelect'

type TransactionRowProps = {
  transaction: Transaction
  categories: TransactionCategory[]
  category: TransactionCategory | undefined
  categoryId: string | null
  pending: boolean
  error: string | undefined
  onSelect: (categoryId: string | null) => void
  onOpen: () => void
}

export function TransactionRow({
  transaction,
  categories,
  category,
  categoryId,
  pending,
  error,
  onSelect,
  onOpen,
}: TransactionRowProps) {
  const counterparty = transaction.counterparty?.name ?? transaction.counterparty_name ?? '—'

  return (
    <li className="transaction-row">
      <button
        type="button"
        className="transaction-row__open"
        onClick={onOpen}
        aria-label={`Open transaction ${transaction.transaction_id}`}
      >
        <span className="transaction-row__meta">
          <span className="transaction-row__kind">{transaction.kind}</span>
          <span className={`status status--${transaction.status}`}>{transaction.status}</span>
        </span>
        <span className="transaction-row__counterparty">{counterparty}</span>
        <span className={`transaction-row__amount transaction-row__amount--${transaction.direction}`}>
          {formatUsdc(transaction.amount_minor)}
        </span>
        <span className="transaction-row__date">{formatDate(transaction.created_at)}</span>
      </button>

      <div className="transaction-row__category">
        <CategoryChip name={category?.name ?? null} color={category?.color ?? null} />
        <CategorySelect
          id={`category-${transaction.transaction_id}`}
          label={`Category for transaction ${transaction.transaction_id}`}
          categories={categories}
          value={categoryId}
          disabled={pending}
          onChange={onSelect}
        />
      </div>

      {error !== undefined && (
        <p role="alert" className="error transaction-row__error">
          {error}
        </p>
      )}
    </li>
  )
}
