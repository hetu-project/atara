/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 后端地址。留空则用相对路径 /api/v1，要求前后端同源。 */
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
