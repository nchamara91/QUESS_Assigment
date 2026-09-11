import { configureStore } from '@reduxjs/toolkit'

import { categoriesApi } from './generated/categoriesApi'
import { transactionsApi } from './generated/transactionsApi'

function makeStore() {
  return configureStore({
    reducer: {
      [transactionsApi.reducerPath]: transactionsApi.reducer,
      [categoriesApi.reducerPath]: categoriesApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(transactionsApi.middleware, categoriesApi.middleware),
  })
}

export type AppStore = ReturnType<typeof makeStore>
export type RootState = ReturnType<AppStore['getState']>
export type AppDispatch = AppStore['dispatch']

/** A fresh store, used by tests so they never share cache between cases. */
export function createStore(): AppStore {
  return makeStore()
}

/** The application store singleton. */
export const store = makeStore()
