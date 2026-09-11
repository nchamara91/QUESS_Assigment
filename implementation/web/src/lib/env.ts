/**
 * Runtime configuration.
 *
 * The container writes `window.__APP_CONFIG__` at startup (so the API URLs can
 * change without a rebuild); `import.meta.env` is the Vite dev/build fallback.
 * The two API URLs are what switch the page between "mock alone" and
 * "mock + our backend"; nothing else needs to change.
 */
const runtime = window.__APP_CONFIG__ ?? {}

export const env = {
  transactionsApiUrl:
    runtime.transactionsApiUrl || import.meta.env.VITE_TRANSACTIONS_API_URL || 'http://localhost:8080',
  categoriesApiUrl:
    runtime.categoriesApiUrl || import.meta.env.VITE_CATEGORIES_API_URL || 'http://localhost:8081',
  accessToken: runtime.accessToken || import.meta.env.VITE_ACCESS_TOKEN || '',
} as const
