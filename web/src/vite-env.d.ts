/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TRANSACTIONS_API_URL?: string
  readonly VITE_CATEGORIES_API_URL?: string
  readonly VITE_ACCESS_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
