import type { EnvelopeTransactionList, Transaction } from '../api/generated/transactionsApi'

/**
 * Merge one fetched page into the rows already on screen.
 *
 * Page 1 replaces (a refresh or a restart of the feed starts over); later pages
 * append. Rows are de-duplicated by `transaction_id`, so a feed that shifts
 * between fetches — a new transaction lands on top and pushes page 2 down —
 * cannot show the same row twice.
 */
export function accumulatePage(
  previous: Transaction[],
  payload: EnvelopeTransactionList,
): Transaction[] {
  const merged =
    payload.data.page.page === 1 ? payload.data.items : [...previous, ...payload.data.items]

  const seen = new Set<string>()
  return merged.filter((transaction) => {
    if (seen.has(transaction.transaction_id)) {
      return false
    }
    seen.add(transaction.transaction_id)
    return true
  })
}
