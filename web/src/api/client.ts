import type { ApiResult, MetaResponse, TreeResponse } from './types'

// Inline preview cap mirrors `inlineSizeCap` in internal/server/api.go and
// the `Inline render size cap falls through to non-previewable` requirement
// in the directory-browser spec. The SPA enforces this client-side: files
// over the cap show the "too large" placeholder without a /raw/ fetch.
export const INLINE_CAP = 5 * 1024 * 1024

async function apiGet<T>(url: string): Promise<ApiResult<T>> {
  let resp: Response
  try {
    resp = await fetch(url)
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: { error: 'internal_error', message: String(e) },
    }
  }

  if (!resp.ok) {
    let error
    try {
      error = await resp.json()
    } catch {
      error = { error: 'internal_error', message: resp.statusText }
    }
    return { ok: false, status: resp.status, error }
  }

  const data = await resp.json() as T
  return { ok: true, data }
}

export function tree(path: string): Promise<ApiResult<TreeResponse>> {
  const encoded = encodeURIComponent(path)
  return apiGet<TreeResponse>(`/api/tree?path=${encoded}`)
}

export function meta(path: string): Promise<ApiResult<MetaResponse>> {
  const encoded = encodeURIComponent(path)
  return apiGet<MetaResponse>(`/api/meta?path=${encoded}`)
}
