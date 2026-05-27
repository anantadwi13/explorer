import type {
  ApiResult,
  BlameResponse,
  GitCommit,
  GitCommits,
  GitInfo,
  GitPatch,
  GitPatchSource,
  GitRefs,
  GitStatus,
  MetaResponse,
  TreeResponse,
} from './types'

// Inline preview cap mirrors `inlineSizeCap` in internal/server/api.go and
// the `Inline render size cap falls through to non-previewable` requirement
// in the web-ui spec. The SPA enforces this client-side: files over the cap
// show the "too large" placeholder without a /raw/ fetch.
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

// --- git-reader helpers ---
// Refs and shas can contain slashes (`feature/x`) so every parameter that
// can carry one is passed through URLSearchParams' built-in encoding.

export function getGitInfo(): Promise<ApiResult<GitInfo>> {
  return apiGet<GitInfo>('/api/git/info')
}

export function getGitRefs(): Promise<ApiResult<GitRefs>> {
  return apiGet<GitRefs>('/api/git/refs')
}

export interface CommitsParams {
  ref?: string
  cursor?: string
  limit?: number
  path?: string
}

export function getGitCommits(params: CommitsParams = {}): Promise<ApiResult<GitCommits>> {
  const qs = new URLSearchParams()
  if (params.ref) qs.set('ref', params.ref)
  if (params.cursor) qs.set('cursor', params.cursor)
  if (params.limit) qs.set('limit', String(params.limit))
  if (params.path) qs.set('path', params.path)
  const query = qs.toString()
  return apiGet<GitCommits>('/api/git/commits' + (query ? '?' + query : ''))
}

export interface BlameParams {
  path: string
  ref?: string
}

export function getGitBlame(params: BlameParams): Promise<ApiResult<BlameResponse>> {
  const qs = new URLSearchParams()
  qs.set('path', params.path)
  if (params.ref) qs.set('ref', params.ref)
  return apiGet<BlameResponse>('/api/git/blame?' + qs.toString())
}

export interface CommitParams {
  sha: string
  fileOffset?: number
  fileLimit?: number
}

export function getGitCommit(params: CommitParams): Promise<ApiResult<GitCommit>> {
  const qs = new URLSearchParams()
  qs.set('sha', params.sha)
  if (params.fileOffset !== undefined) qs.set('file_offset', String(params.fileOffset))
  if (params.fileLimit !== undefined) qs.set('file_limit', String(params.fileLimit))
  return apiGet<GitCommit>('/api/git/commit?' + qs.toString())
}

export function getGitStatus(): Promise<ApiResult<GitStatus>> {
  return apiGet<GitStatus>('/api/git/status')
}

export interface PatchParams {
  source: GitPatchSource
  sha?: string // required iff source === 'commit'
  path: string
  hunkOffset?: number
  hunkLimit?: number
}

export function getGitPatch(params: PatchParams): Promise<ApiResult<GitPatch>> {
  const qs = new URLSearchParams()
  qs.set('source', params.source)
  if (params.sha) qs.set('sha', params.sha)
  qs.set('path', params.path)
  if (params.hunkOffset !== undefined) qs.set('hunk_offset', String(params.hunkOffset))
  if (params.hunkLimit !== undefined) qs.set('hunk_limit', String(params.hunkLimit))
  return apiGet<GitPatch>('/api/git/patch?' + qs.toString())
}
