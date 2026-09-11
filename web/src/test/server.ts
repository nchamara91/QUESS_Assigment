import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

import categoriesFixture from '../../../fixtures/categories.org-a.system.json'
import transactionsFixture from '../../../fixtures/transactions.org-a.json'

export const CORRELATION_ID = '00000000-0000-4000-8000-000000000000'
export const TRANSACTIONS_API = 'http://localhost:8080'
export const CATEGORIES_API = 'http://localhost:8081'

/** Every assignments lookup, so a test can assert there is exactly one per page. */
export const assignmentRequests: string[][] = []

const transactions = transactionsFixture.transactions

export const handlers = [
  http.get(`${TRANSACTIONS_API}/api/v1/app/transactions`, ({ request }) => {
    const url = new URL(request.url)
    const page = Number(url.searchParams.get('page') ?? '1')
    const pageSize = Number(url.searchParams.get('page_size') ?? '20')
    const start = (page - 1) * pageSize
    const items = transactions.slice(start, start + pageSize)
    return HttpResponse.json({
      data: {
        items,
        page: {
          page,
          page_size: pageSize,
          total: transactions.length,
          has_more: start + pageSize < transactions.length,
        },
        amount_filter: null,
      },
      correlation_id: CORRELATION_ID,
    })
  }),

  http.get(`${TRANSACTIONS_API}/api/v1/app/transactions/:transactionId`, ({ params }) => {
    const found = transactions.find((item) => item.transaction_id === params.transactionId)
    if (found === undefined) {
      return HttpResponse.json(
        {
          type: 'NotFoundError',
          correlation_id: CORRELATION_ID,
          error: { code: 'transaction_not_found', message: 'No such transaction.' },
        },
        { status: 404 },
      )
    }
    return HttpResponse.json({ data: found, correlation_id: CORRELATION_ID })
  }),

  http.get(`${CATEGORIES_API}/api/v1/app/transaction-categories`, () =>
    HttpResponse.json({
      data: { items: categoriesFixture.items },
      correlation_id: CORRELATION_ID,
    }),
  ),

  http.get(`${CATEGORIES_API}/api/v1/app/transaction-category-assignments`, ({ request }) => {
    const url = new URL(request.url)
    const ids = url.searchParams.getAll('transaction_id')
    assignmentRequests.push(ids)
    return HttpResponse.json({
      data: {
        items: ids.map((transactionId) => ({
          transaction_id: transactionId,
          category_id: null,
          assigned_at: null,
          assigned_by: null,
        })),
      },
      correlation_id: CORRELATION_ID,
    })
  }),

  http.put(`${CATEGORIES_API}/api/v1/app/transactions/:transactionId/category`, async ({ params, request }) => {
    const body = (await request.json()) as { category_id: string | null }
    return HttpResponse.json({
      data: {
        transaction_id: params.transactionId,
        category_id: body.category_id,
        assigned_at: new Date().toISOString(),
        assigned_by: 'idp|owner-a',
      },
      correlation_id: CORRELATION_ID,
    })
  }),
]

export const server = setupServer(...handlers)
