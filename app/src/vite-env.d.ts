/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend address. Leave empty to use the relative path /api/v1, which requires front and back ends to be same-origin. */
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
