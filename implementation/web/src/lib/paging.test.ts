import { describe, expect, it } from 'vitest'

import type { EnvelopeTransactionList, Transaction } from '../api/generated/transactionsApi'
import { accumulatePage } from './paging'

function transaction(id: string): Transaction {
  return {
    transaction_id: id,
    kind: 'receive',
    direction: 'in',
    status: 'confirmed',
    amount_minor: 1_250_000,
    asset: 'USDC',
    recipient_context: { can_save: false, recipient_id: null },
  }
}

function page(pageNumber: number, items: Transaction[]): EnvelopeTransactionList {
  return {
    correlation_id: '00000000-0000-4000-8000-000000000000',
    data: {
      items,
      page: { page: pageNumber, page_size: 20, total: 40, has_more: pageNumber < 2 },
    },
  }
}

describe('accumulatePage', () => {
  it('replaces the rows when page 1 arrives', () => {
    const stale = [transaction('txn_a'), transaction('txn_b')]
    const fresh = [transaction('txn_c')]

    expect(accumulatePage(stale, page(1, fresh))).toEqual([transaction('txn_c')])
  })

  it('appends a later page to the rows already on screen', () => {
    const first = [transaction('txn_a')]
    const second = [transaction('txn_b'), transaction('txn_c')]

    expect(accumulatePage(first, page(2, second))).toEqual([
      transaction('txn_a'),
      transaction('txn_b'),
      transaction('txn_c'),
    ])
  })

  it('collapses a row that appears twice because the feed shifted between fetches', () => {
    const first = [transaction('txn_a'), transaction('txn_b')]
    // the feed moved: page 2 starts where page 1 ended
    const second = [transaction('txn_b'), transaction('txn_c')]

    expect(accumulatePage(first, page(2, second)).map((item) => item.transaction_id)).toEqual([
      'txn_a',
      'txn_b',
      'txn_c',
    ])
  })
})
