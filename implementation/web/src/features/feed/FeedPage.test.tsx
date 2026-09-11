import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { delay, http, HttpResponse } from 'msw'
import { act } from 'react'
import { Provider } from 'react-redux'
import { axe } from 'vitest-axe'
import { beforeEach, describe, expect, it } from 'vitest'

import categoriesFixture from '../../../../../fixtures/categories.org-a.system.json'
import { createStore } from '../../api/store'
import {
  CATEGORIES_API,
  CORRELATION_ID,
  assignmentRequests,
  requestCounters,
  server,
} from '../../test/server'
import { FeedPage } from './FeedPage'

type User = ReturnType<typeof userEvent.setup>

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

/** Select a category on the first row and assert the optimistic value is shown. */
async function changeCategoryOnFirstRow(user: User): Promise<HTMLElement> {
  const row = await firstRow()
  const select = within(row).getByRole('combobox')
  const category = categoriesFixture.items[0]
  if (category === undefined) {
    throw new Error('fixture has no categories')
  }
  await user.selectOptions(select, category.category_id)
  expect(select).toHaveValue(category.category_id)
  return row
}

function failAssignmentWith(status: number, code: string): void {
  server.use(
    http.put(`${CATEGORIES_API}/api/v1/app/transactions/:transactionId/category`, async () => {
      await delay(50)
      return HttpResponse.json(
        {
          type: 'Error',
          correlation_id: CORRELATION_ID,
          error: { code, message: 'injected failure' },
        },
        { status },
      )
    }),
  )
}

describe('FeedPage', () => {
  beforeEach(() => {
    assignmentRequests.length = 0
    requestCounters.categoryList = 0
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

  it('rolls an optimistic category change back on a 503 and explains why', async () => {
    failAssignmentWith(503, 'transactions_unavailable')
    const user = userEvent.setup()
    renderPage()
    const row = await changeCategoryOnFirstRow(user)

    await waitFor(() => {
      expect(within(row).getByRole('alert')).toHaveTextContent(/unavailable/i)
    })
    expect(within(row).getByRole('combobox')).toHaveValue('')
  })

  it('rolls an optimistic category change back on a 404 and explains why', async () => {
    failAssignmentWith(404, 'transaction_not_found')
    const user = userEvent.setup()
    renderPage()
    const row = await changeCategoryOnFirstRow(user)

    await waitFor(() => {
      expect(within(row).getByRole('alert')).toHaveTextContent(/no longer available/i)
    })
    expect(within(row).getByRole('combobox')).toHaveValue('')
  })

  it('refetches the category list after adding a category', async () => {
    const user = userEvent.setup()
    renderPage()
    await firstRow()

    await user.click(screen.getByRole('button', { name: 'Manage categories' }))
    const initialRequests = requestCounters.categoryList
    await user.type(screen.getByRole('textbox', { name: 'Name' }), 'Marketing')
    await user.click(screen.getByRole('button', { name: 'Add category' }))

    await waitFor(() => {
      expect(requestCounters.categoryList).toBeGreaterThan(initialRequests)
    })
  })

  it('manage dialog: focus moves in, axe is clean, Escape closes and focus returns', async () => {
    const user = userEvent.setup()
    renderPage()
    await firstRow()

    const trigger = screen.getByRole('button', { name: 'Manage categories' })
    await user.click(trigger)

    const dialog = screen.getByRole('dialog', { name: 'Manage categories' })
    expect(screen.getByRole('button', { name: 'Close categories dialog' })).toHaveFocus()

    const results = await act(async () => axe(dialog))
    expect(results.violations).toEqual([])

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(trigger).toHaveFocus()
    })
  })
})
