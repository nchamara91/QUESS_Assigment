import type { FormEvent } from 'react'

import type {
  TransactionKind,
  TransactionStatus,
} from '../../api/generated/transactionsApi'
import type { FilterDraft } from './filters'

const KIND_OPTIONS: Array<{ value: TransactionKind; label: string }> = [
  { value: 'deposit', label: 'Deposit' },
  { value: 'receive', label: 'Receive' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'withdrawal', label: 'Withdrawal' },
]

const STATUS_OPTIONS: Array<{ value: TransactionStatus; label: string }> = [
  { value: 'initiated', label: 'Initiated' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'failed', label: 'Failed' },
]

type TransactionFiltersProps = {
  value: FilterDraft
  hasAppliedFilters: boolean
  onChange: (next: FilterDraft) => void
  onApply: () => void
  onClear: () => void
}

export function TransactionFilters({
  value,
  hasAppliedFilters,
  onChange,
  onApply,
  onClear,
}: TransactionFiltersProps) {
  const toggleStatus = (status: TransactionStatus): void => {
    const statuses = value.statuses.includes(status)
      ? value.statuses.filter((item) => item !== status)
      : [...value.statuses, status]
    onChange({ ...value, statuses })
  }

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    onApply()
  }

  return (
    <form className="transaction-filters" onSubmit={submit}>
      <div className="transaction-filters__primary">
        <label className="filter-field filter-field--search">
          <span>Search</span>
          <input
            type="search"
            value={value.search}
            placeholder="ID, reference or wallet"
            onChange={(event) => onChange({ ...value, search: event.target.value })}
          />
        </label>

        <label className="filter-field">
          <span>Kind</span>
          <select
            value={value.kind}
            onChange={(event) =>
              onChange({ ...value, kind: event.target.value as TransactionKind | '' })
            }
          >
            <option value="">All kinds</option>
            {KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="filter-field filter-field--statuses">
          <legend>Statuses</legend>
          <div className="status-options">
            {STATUS_OPTIONS.map((option) => (
              <label key={option.value} className="status-option">
                <input
                  type="checkbox"
                  checked={value.statuses.includes(option.value)}
                  onChange={() => toggleStatus(option.value)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="transaction-filters__secondary">
        <label className="filter-field">
          <span>Date from</span>
          <input
            type="date"
            value={value.dateFrom}
            onChange={(event) => onChange({ ...value, dateFrom: event.target.value })}
          />
        </label>
        <label className="filter-field">
          <span>Date to</span>
          <input
            type="date"
            value={value.dateTo}
            onChange={(event) => onChange({ ...value, dateTo: event.target.value })}
          />
        </label>
        <label className="filter-field">
          <span>Min USDC</span>
          <input
            type="number"
            min="0"
            step="0.000001"
            inputMode="decimal"
            value={value.amountMin}
            placeholder="0.00"
            onChange={(event) => onChange({ ...value, amountMin: event.target.value })}
          />
        </label>
        <label className="filter-field">
          <span>Max USDC</span>
          <input
            type="number"
            min="0"
            step="0.000001"
            inputMode="decimal"
            value={value.amountMax}
            placeholder="No limit"
            onChange={(event) => onChange({ ...value, amountMax: event.target.value })}
          />
        </label>
      </div>

      <div className="transaction-filters__actions">
        <button type="submit" className="filter-apply">
          Apply filters
        </button>
        <button type="button" className="filter-clear" onClick={onClear} disabled={!hasAppliedFilters}>
          Clear all
        </button>
      </div>
    </form>
  )
}
