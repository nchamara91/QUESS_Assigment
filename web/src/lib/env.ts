/**
 * Runtime configuration, read from Vite's environment.
 *
 * The two API URLs are what switch the page between "mock alone" and
 * "mock + our backend"; nothing else needs to change.
 */
export const env = {
  transactionsApiUrl: import.meta.env.VITE_TRANSACTIONS_API_URL ?? 'http://localhost:8080',
  categoriesApiUrl: import.meta.env.VITE_CATEGORIES_API_URL ?? 'http://localhost:8081',
  accessToken: import.meta.env.VITE_ACCESS_TOKEN ?? '',
} as const
