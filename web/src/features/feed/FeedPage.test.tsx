import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { act } from 'react'
import { Provider } from 'react-redux'
import { axe } from 'vitest-axe'
import { beforeEach, describe, expect, it } from 'vitest'

import categoriesFixture from '../../../../fixtures/categories.org-a.system.json'
import { createStore } from '../../api/store'
import { CATEGORIES_API, CORRELATION_ID, assignmentRequests, server } from '../../test/server'
import { FeedPage } from './FeedPage'

function renderPage(): ReturnType<typeof render> {
  const store = createStore()
  return render(
    <Provider store={store}>
      <FeedPage />
    </Provider>,
  )
}

async function firstRow(): Promise<HTMLElement> {
  const rows = await screen.findAllByRole('listitem')
  const row = rows[0]
  if (row === undefined) {
    throw new Error('expected at least one transaction row')
  }
  return row
}

describe('FeedPage', () => {
  beforeEach(() => {
    assignmentRequests.length = 0
  })

  it('renders the feed and makes exactly one assignments lookup for the page', async () => {
    renderPage()
    await firstRow()
    await waitFor(() => {
      expect(assignmentRequests).toHaveLength(1)
    })
    expect(assignmentRequests[0]).toHaveLength(20)
  })

  it('has no critical accessibility violations', async () => {
    const { container } = renderPage()
    await firstRow()
    const results = await act(async () => axe(container))
    expect(results.violations).toEqual([])
  })

  it('rolls an optimistic category change back on failure and explains why', async () => {
    serverFailure()
    const user = userEvent.setup()
    renderPage()
    const row = await firstRow()
    const select = within(row).getByRole('combobox')
    const category = categoriesFixture.items[0]
    if (category === undefined) {
      throw new Error('fixture has no categories')
    }

    await user.selectOptions(select, category.category_id)
    // Optimistic: the new value is shown before the server answers.
    expect(select).toHaveValue(category.category_id)

    await waitFor(() => {
      expect(within(row).getByRole('alert')).toHaveTextContent(/unavailable/i)
    })
    // Rolled back to the server state.
    expect(select).toHaveValue('')
  })
})

function serverFailure(): void {
  server.use(
    http.put(`${CATEGORIES_API}/api/v1/app/transactions/:transactionId/category`, async () => {
      await delay(50)
      return HttpResponse.json(
        {
          type: 'ServiceUnavailableError',
          correlation_id: CORRELATION_ID,
          error: { code: 'transactions_unavailable', message: 'down' },
        },
        { status: 503 },
      )
    }),
  )
}
