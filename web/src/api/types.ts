export interface TreeEntry {
  name: string
  type: 'dir' | 'file'
  size?: number
  mtime?: string
  mime?: string
  kind?: 'markdown' | 'text' | 'image' | ''
}

export interface TreeResponse {
  entries: TreeEntry[]
}

export interface MetaResponse {
  size: number
  mtime: string
  mime: string
  kind: 'markdown' | 'text' | 'image' | ''
}

export interface ApiError {
  error: 'not_found' | 'permission_denied' | 'outside_root' | 'not_regular' | 'too_large' | 'not_utf8' | 'internal_error'
  message: string
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError; status: number }
