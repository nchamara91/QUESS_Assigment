import { skipToken } from '@reduxjs/toolkit/query'
import { useMemo, useState } from 'react'

import type { TransactionCategoryAssignment } from '../../api/generated/categoriesApi'
import {
  useListTransactionCategoriesQuery,
  useLookupTransactionCategoryAssignmentsQuery,
} from '../../api/generated/categoriesApi'
import type { ListTransactionsApiArg } from '../../api/generated/transactionsApi'
import { useListTransactionsQuery } from '../../api/generated/transactionsApi'
import { errorMessage } from '../../lib/errors'
import { ManageCategoriesDialog } from '../category/ManageCategoriesDialog'
import { useCategorisation } from '../category/useCategorisation'
import { TransactionDrawer } from './TransactionDrawer'
import { TransactionFilters } from './TransactionFilters'
import {
  EMPTY_FILTERS,
  hasActiveFilters,
  toAppliedFilters,
  type AppliedFilters,
  type FilterDraft,
} from './filters'
import { visiblePages } from './pagination'
import { TransactionRow } from './TransactionRow'

const PAGE_SIZE = 20

export function FeedPage() {
  const [page, setPage] = useState(1)
  const [filters, setFilters] = useState<FilterDraft>({ ...EMPTY_FILTERS })
  const [appliedFilters, setAppliedFilters] = useState<AppliedFilters>({})
  const [openTransactionId, setOpenTransactionId] = useState<string | null>(null)
  const [manageOpen, setManageOpen] = useState(false)

  const feedArgs: ListTransactionsApiArg = useMemo(
    () => ({ pageSize: PAGE_SIZE, page, sortOrder: 'desc', ...appliedFilters }),
    [appliedFilters, page],
  )
  const feed = useListTransactionsQuery(feedArgs)
  const categoriesQuery = useListTransactionCategoriesQuery({})
  const items = useMemo(() => feed.data?.data.items ?? [], [feed.data])
  const pageMeta = feed.data?.data.page
  const totalPages = pageMeta === undefined ? 1 : Math.max(1, Math.ceil(pageMeta.total / pageMeta.page_size))
  const pageControls = visiblePages(page, totalPages)

  // One assignments lookup for the current page, never one per row.
  const transactionIds = useMemo(() => items.map((item) => item.transaction_id), [items])
  const assignmentsQuery = useLookupTransactionCategoryAssignmentsQuery(
    transactionIds.length > 0 ? { transactionId: transactionIds } : skipToken,
  )

  const assignments = useMemo(() => {
    const map = new Map<string, TransactionCategoryAssignment>()
    for (const assignment of assignmentsQuery.data?.data.items ?? []) {
      map.set(assignment.transaction_id, assignment)
    }
    return map
  }, [assignmentsQuery.data])

  const categories = useMemo(() => categoriesQuery.data?.data.items ?? [], [categoriesQuery.data])
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.category_id, category])),
    [categories],
  )
  const changes = useCategorisation(assignments)
  const filtersAreActive = hasActiveFilters(appliedFilters)

  const applyFilters = (): void => {
    setAppliedFilters(toAppliedFilters(filters))
    setPage(1)
  }

  const clearFilters = (): void => {
    setFilters({ ...EMPTY_FILTERS })
    setAppliedFilters({})
    setPage(1)
  }

  return (
    <main className="page">
      <header className="page__header">
        <div className="page__title-group">
          <span className="page__eyebrow">Cash management</span>
          <h1>Transactions</h1>
          <p className="page__subtitle">Review activity and keep every payment in context.</p>
        </div>
        <button type="button" onClick={() => setManageOpen(true)}>
          Manage categories
        </button>
      </header>

      <TransactionFilters
        value={filters}
        hasAppliedFilters={filtersAreActive}
        onChange={setFilters}
        onApply={applyFilters}
        onClear={clearFilters}
      />

      {categoriesQuery.error !== undefined && (
        <div className="error-block">
          <p role="alert" className="error">
            Categories could not be loaded: {errorMessage(categoriesQuery.error)}
          </p>
          <button type="button" onClick={() => void categoriesQuery.refetch()}>
            Retry
          </button>
        </div>
      )}

      {feed.isLoading && <p role="status">Loading transactions</p>}

      {feed.error !== undefined && (
        <div className="error-block">
          <p role="alert" className="error">
            Transactions could not be loaded: {errorMessage(feed.error)}
          </p>
          <button type="button" onClick={() => void feed.refetch()}>
            Retry
          </button>
        </div>
      )}

      {!feed.isLoading && feed.error === undefined && items.length === 0 && (
        <p className="empty">
          {filtersAreActive ? 'No transactions match these filters.' : 'No transactions yet.'}
        </p>
      )}

      {pageMeta !== undefined && pageMeta.total > 0 && (
        <div className="feed-summary">
          <span>
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, pageMeta.total)} of{' '}
            {pageMeta.total} transactions
          </span>
          {feed.isFetching && <span className="feed-summary__refresh">Updating…</span>}
        </div>
      )}

      <ul className="feed">
        {items.map((transaction) => {
          const categoryId = changes.categoryIdFor(transaction.transaction_id)
          return (
            <TransactionRow
              key={transaction.transaction_id}
              transaction={transaction}
              categories={categories}
              category={categoryId !== null ? categoryById.get(categoryId) : undefined}
              categoryId={categoryId}
              pending={changes.pendingFor(transaction.transaction_id)}
              error={changes.errorFor(transaction.transaction_id)}
              onSelect={(next) => changes.setCategory(transaction.transaction_id, next)}
              onOpen={() => setOpenTransactionId(transaction.transaction_id)}
            />
          )
        })}
      </ul>

      {pageMeta !== undefined && totalPages > 1 && (
        <nav className="pagination" aria-label="Transaction pages">
          <button
            type="button"
            className="pagination__arrow"
            disabled={page === 1 || feed.isFetching}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            aria-label="Previous page"
          >
            ← <span>Previous</span>
          </button>
          <div className="pagination__pages">
            {pageControls.map((control, index) =>
              control === 'ellipsis' ? (
                <span key={`ellipsis-${index}`} className="pagination__ellipsis" aria-hidden="true">
                  …
                </span>
              ) : (
                <button
                  key={control}
                  type="button"
                  className={control === page ? 'pagination__page pagination__page--active' : 'pagination__page'}
                  aria-current={control === page ? 'page' : undefined}
                  aria-label={`Go to page ${control}`}
                  onClick={() => setPage(control)}
                  disabled={feed.isFetching}
                >
                  {control}
                </button>
              ),
            )}
          </div>
          <button
            type="button"
            className="pagination__arrow"
            disabled={page === totalPages || feed.isFetching}
            onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            aria-label="Next page"
          >
            <span>Next</span> →
          </button>
        </nav>
      )}

      <TransactionDrawer
        transactionId={openTransactionId}
        categories={categories}
        categoryId={openTransactionId !== null ? changes.categoryIdFor(openTransactionId) : null}
        pending={openTransactionId !== null ? changes.pendingFor(openTransactionId) : false}
        error={openTransactionId !== null ? changes.errorFor(openTransactionId) : undefined}
        onSelect={(next) => {
          if (openTransactionId !== null) {
            changes.setCategory(openTransactionId, next)
          }
        }}
        onClose={() => setOpenTransactionId(null)}
      />

      <ManageCategoriesDialog open={manageOpen} onClose={() => setManageOpen(false)} />
    </main>
  )
}
