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
  error:
    | 'not_found'
    | 'permission_denied'
    | 'outside_root'
    | 'not_regular'
    | 'too_large'
    | 'not_utf8'
    | 'internal_error'
    | 'bad_request'
    | 'not_a_repo'
    | 'unknown_ref'
  message: string
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError; status: number }

// --- git-reader types ---
// These mirror the JSON shapes in internal/server/git/*.go. The discriminated
// union on `is_repo` keeps the non-repo branch a single field.

export type GitInfo =
  | { is_repo: false }
  | {
      is_repo: true
      head_ref: string | null
      head_sha: string | null
      detached: boolean
    }

export interface GitRefEntry {
  name: string
  sha: string
}

export interface GitRefs {
  branches: GitRefEntry[]
  tags: GitRefEntry[]
}

export interface GitCommitSummary {
  sha: string
  short_sha: string
  author_name: string
  author_email: string
  author_time: string // RFC 3339
  subject: string
  body: string
}

export interface GitCommits {
  commits: GitCommitSummary[]
  next_cursor: string | null
}

export type GitFileStatus = 'A' | 'M' | 'D' | 'R'

export interface GitFileHeader {
  status: GitFileStatus
  old_path: string | null
  new_path: string | null
  additions: number
  deletions: number
  is_binary: boolean
  old_size?: number
  new_size?: number
}

export interface GitCommit {
  sha: string
  short_sha: string
  author_name: string
  author_email: string
  author_time: string
  committer_name: string
  committer_email: string
  committer_time: string
  subject: string
  body: string
  parents: string[]
  total_files: number
  total_additions: number
  total_deletions: number
  files: GitFileHeader[]
  next_file_offset: number | null
}

export interface GitUntracked {
  path: string
}

export interface GitStatus {
  staged: GitFileHeader[]
  unstaged: GitFileHeader[]
  untracked: GitUntracked[]
  conflicted?: GitUntracked[]
}

export type GitDiffLineType = 'context' | 'add' | 'del'

export interface GitDiffLine {
  type: GitDiffLineType
  text: string
}

export interface GitHunk {
  old_start: number
  old_lines: number
  new_start: number
  new_lines: number
  header: string
  lines: GitDiffLine[]
}

export interface GitPatch {
  path: string
  is_binary: boolean
  total_hunks: number
  hunks: GitHunk[]
  next_hunk_offset: number | null
  more_available: boolean
}

export type GitPatchSource = 'commit' | 'staged' | 'unstaged'
