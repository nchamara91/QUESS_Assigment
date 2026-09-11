import { createApi } from '@reduxjs/toolkit/query/react'

import { env } from '../lib/env'
import { createApiBaseQuery } from './baseQuery'

/**
 * The RTK Query api that the generated category hooks are injected into.
 * The generated file must not be edited; everything configurable lives here.
 */
export const emptyCategoriesApi = createApi({
  reducerPath: 'categoriesApi',
  baseQuery: createApiBaseQuery(env.categoriesApiUrl, () => env.accessToken),
  tagTypes: ['Category', 'Assignment'],
  endpoints: () => ({}),
})
