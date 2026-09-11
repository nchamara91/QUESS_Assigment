import { skipToken } from '@reduxjs/toolkit/query'
import { useEffect, useMemo, useState } from 'react'

import type { TransactionCategoryAssignment } from '../../api/generated/categoriesApi'
import {
  useListTransactionCategoriesQuery,
  useLookupTransactionCategoryAssignmentsQuery,
} from '../../api/generated/categoriesApi'
import type { Transaction } from '../../api/generated/transactionsApi'
import { useListTransactionsQuery } from '../../api/generated/transactionsApi'
import { errorMessage } from '../../lib/errors'
import { accumulatePage } from '../../lib/paging'
import { ManageCategoriesDialog } from '../category/ManageCategoriesDialog'
import { useCategorisation } from '../category/useCategorisation'
import { TransactionDrawer } from './TransactionDrawer'
import { TransactionRow } from './TransactionRow'

const PAGE_SIZE = 20

export function FeedPage() {
  const [page, setPage] = useState(1)
  const [items, setItems] = useState<Transaction[]>([])
  const [openTransactionId, setOpenTransactionId] = useState<string | null>(null)
  const [manageOpen, setManageOpen] = useState(false)

  const feed = useListTransactionsQuery({ pageSize: PAGE_SIZE, page, sortOrder: 'desc' })
  const categoriesQuery = useListTransactionCategoriesQuery({})

  useEffect(() => {
    const payload = feed.data
    if (payload === undefined) {
      return
    }
    setItems((previous) => accumulatePage(previous, payload))
  }, [feed.data])

  // One assignments lookup per loaded page, never one per row.
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
        <p className="empty">No transactions yet.</p>
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

      {feed.data?.data.page.has_more === true && (
        <button
          type="button"
          className="load-more"
          onClick={() => setPage((previous) => previous + 1)}
          disabled={feed.isFetching}
        >
          {feed.isFetching ? 'Loading…' : 'Load more'}
        </button>
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
