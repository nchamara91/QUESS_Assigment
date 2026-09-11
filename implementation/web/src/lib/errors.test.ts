import type { FetchBaseQueryError } from '@reduxjs/toolkit/query'
import { describe, expect, it } from 'vitest'

import { errorCode, errorMessage, validationMessages } from './errors'

function apiError(status: number, data: unknown): FetchBaseQueryError {
  return { status, data }
}

describe('errorMessage', () => {
  it('explains a missing transaction in words, not a status code', () => {
    const message = errorMessage(apiError(404, { error: { code: 'transaction_not_found', message: 'gone' } }))
    expect(message).toMatch(/no longer available/i)
    expect(message).not.toMatch(/404/)
  })

  it('explains an unavailable transactions service and says nothing changed', () => {
    const message = errorMessage(
      apiError(503, { error: { code: 'transactions_unavailable', message: 'down' } }),
    )
    expect(message).toMatch(/unavailable/i)
    expect(message).toMatch(/nothing was changed/i)
  })

  it('prefers the server message for a 409 the user can act on', () => {
    const message = errorMessage(
      apiError(409, {
        error: { code: 'transaction_category_name_taken', message: 'A category named Taxes exists.' },
      }),
    )
    expect(message).toBe('A category named Taxes exists.')
  })

  it('handles a network failure', () => {
    expect(errorMessage({ status: 'FETCH_ERROR', error: 'boom' })).toMatch(/could not be reached/i)
  })
})

describe('errorCode', () => {
  it('reads the stable code', () => {
    expect(errorCode(apiError(409, { error: { code: 'system_category_immutable' } }))).toBe(
      'system_category_immutable',
    )
  })
})

describe('validationMessages', () => {
  it('returns the first message per field of a 422 map', () => {
    const messages = validationMessages(
      apiError(422, {
        type: 'ValidationError',
        correlation_id: 'x',
        error: { name: [{ code: 'blank', message: 'Name must not be blank.' }] },
      }),
    )
    expect(messages).toEqual({ name: 'Name must not be blank.' })
  })
})
