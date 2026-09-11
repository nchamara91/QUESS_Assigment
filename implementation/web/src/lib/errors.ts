import type { SerializedError } from '@reduxjs/toolkit'
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query'

export type ApiError = FetchBaseQueryError | SerializedError | undefined

type ErrorBody = {
  error?: {
    code?: string
    message?: string
  }
}

/** Messages we choose ourselves; everything else falls back to the server or a generic line. */
const CODE_MESSAGES: Record<string, string> = {
  unauthorized: 'Your session has expired. Refresh the page and sign in again.',
  organization_context_forbidden: 'You do not have access to this organisation.',
  transaction_not_found: 'This transaction is no longer available.',
  transaction_category_not_found: 'That category no longer exists.',
  transactions_unavailable: 'The transactions service is unavailable. Nothing was changed.',
  validation_error: 'That value is not valid.',
  internal_error: 'Something went wrong on our side. Try again.',
  mock_failure: 'The service is having trouble right now. Try again.',
}

const GENERIC = 'Something went wrong. Try again.'

function isFetchBaseQueryError(error: unknown): error is FetchBaseQueryError {
  return typeof error === 'object' && error !== null && 'status' in error
}

function bodyOf(error: FetchBaseQueryError): ErrorBody | undefined {
  const data: unknown = error.data
  if (typeof data === 'object' && data !== null) {
    return data
  }
  return undefined
}

/**
 * Turn any RTK Query error into one sentence for the user. The server's own
 * message wins for the two 409 conflicts the user can act on, because the
 * contract promises a useful one and the field needs it.
 */
export function errorMessage(error: ApiError): string {
  if (error === undefined) {
    return GENERIC
  }
  if (isFetchBaseQueryError(error)) {
    const body = bodyOf(error)
    const code = body?.error?.code
    if (code === 'transaction_category_name_taken' || code === 'transaction_category_limit_reached') {
      return body?.error?.message ?? GENERIC
    }
    if (code !== undefined) {
      const message = CODE_MESSAGES[code]
      if (message !== undefined) {
        return message
      }
    }
    if (error.status === 'FETCH_ERROR' || error.status === 'TIMEOUT_ERROR') {
      return 'The service could not be reached. Check your connection and try again.'
    }
    return GENERIC
  }
  return error.message ?? GENERIC
}

/** The machine-readable code, if the server sent one. Used by field-level hints. */
export function errorCode(error: ApiError): string | undefined {
  return isFetchBaseQueryError(error) ? bodyOf(error)?.error?.code : undefined
}

type ValidationBody = {
  type?: string
  error?: Record<string, Array<{ code?: string; message?: string }> | undefined>
}

/**
 * The first message per field for a 422 validation map, so a form can put the
 * server's own words next to the input that caused them.
 */
export function validationMessages(error: ApiError): Record<string, string> {
  if (!isFetchBaseQueryError(error) || typeof error.data !== 'object' || error.data === null) {
    return {}
  }
  const body = error.data as ValidationBody
  if (body.type !== 'ValidationError' || body.error === undefined) {
    return {}
  }
  const messages: Record<string, string> = {}
  for (const [field, issues] of Object.entries(body.error)) {
    const first = issues?.[0]
    if (first?.message) {
      messages[field] = first.message
    }
  }
  return messages
}
