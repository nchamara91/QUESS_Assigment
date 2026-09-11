import { fetchBaseQuery } from '@reduxjs/toolkit/query/react'
import type {
  BaseQueryFn,
  FetchArgs,
  FetchBaseQueryError,
  FetchBaseQueryMeta,
} from '@reduxjs/toolkit/query/react'

type QueryArgs = string | FetchArgs

function paramValue(value: unknown): string | null {
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return null
}

/**
 * RTK Query's base query serializes array params by string coercion, which
 * produces `transaction_id=a,b`. The contracts use `explode: true` (repeated
 * params), so array values must be appended one by one. Doing it once here
 * fixes every operation and keeps the generated files untouched.
 */
export function createApiBaseQuery(
  baseUrl: string,
  getAccessToken: () => string,
): BaseQueryFn<QueryArgs, unknown, FetchBaseQueryError, object, FetchBaseQueryMeta> {
  const rawBaseQuery = fetchBaseQuery({
    baseUrl,
    prepareHeaders: (headers) => {
      const token = getAccessToken()
      if (token) {
        headers.set('Authorization', `Bearer ${token}`)
      }
      return headers
    },
  })

  return async (args, api, extraOptions) => {
    if (typeof args === 'string' || args.params === undefined) {
      return rawBaseQuery(args, api, extraOptions)
    }

    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(args.params as Record<string, unknown>)) {
      if (value === undefined || value === null) {
        continue
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          const serialized = paramValue(item)
          if (serialized !== null) {
            search.append(key, serialized)
          }
        }
      } else {
        const serialized = paramValue(value)
        if (serialized !== null) {
          search.append(key, serialized)
        }
      }
    }

    if (search.size === 0) {
      return rawBaseQuery(args, api, extraOptions)
    }

    const separator = args.url.includes('?') ? '&' : '?'
    return rawBaseQuery(
      { ...args, url: `${args.url}${separator}${search.toString()}`, params: undefined },
      api,
      extraOptions,
    )
  }
}
