import type { ApiResult, FileResponse, TreeResponse } from './types'

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

export function file(path: string): Promise<ApiResult<FileResponse>> {
  const encoded = encodeURIComponent(path)
  return apiGet<FileResponse>(`/api/file?path=${encoded}`)
}
