import { createApi } from '@reduxjs/toolkit/query/react'

import { env } from '../lib/env'
import { createApiBaseQuery } from './baseQuery'

/**
 * The RTK Query api that the generated transactions hooks are injected into.
 * The generated file must not be edited; everything configurable lives here.
 */
export const emptyTransactionsApi = createApi({
  reducerPath: 'transactionsApi',
  baseQuery: createApiBaseQuery(env.transactionsApiUrl, () => env.accessToken),
  tagTypes: ['Transaction', 'Assignment'],
  endpoints: () => ({}),
})
