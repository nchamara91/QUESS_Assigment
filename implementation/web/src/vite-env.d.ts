/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TRANSACTIONS_API_URL?: string
  readonly VITE_CATEGORIES_API_URL?: string
  readonly VITE_ACCESS_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Written by docker-entrypoint.sh in the container, by public/config.js in dev. */
interface Window {
  __APP_CONFIG__?: {
    transactionsApiUrl?: string
    categoriesApiUrl?: string
    accessToken?: string
  }
}
