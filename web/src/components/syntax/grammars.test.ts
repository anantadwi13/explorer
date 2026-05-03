import { describe, it, expect } from 'vitest'
import { extToLanguage } from './grammars'

// ExtensionsWithTextKind lists every extension that extToLanguage maps to a
// non-null grammar AND that the server must classify as kind="text". Keep this
// in sync with the Go-side ExtensionsWithTextKind in mime_test.go so a
// contributor adding a language sees both.
const ExtensionsWithTextKind: string[] = [
  '.go', '.ts', '.tsx', '.js', '.jsx', '.py', '.rb', '.rs', '.sh',
  '.html', '.htm', '.xml', '.css', '.scss', '.sql', '.c', '.cpp', '.h',
  '.java', '.yaml', '.yml', '.md', '.markdown',
  // New programming languages
  '.cs', '.kt', '.kts', '.swift', '.scala', '.sc', '.groovy', '.gradle',
  '.m', '.mm', '.fs', '.fsi', '.fsx', '.php', '.phtml', '.dart', '.lua',
  '.pl', '.pm', '.ps1', '.psm1', '.r', '.hs', '.lhs', '.ex', '.exs',
  '.erl', '.hrl', '.clj', '.cljs', '.cljc', '.edn', '.jl',
  // Data / config / query
  '.json', '.toml', '.graphql', '.gql', '.proto',
]

describe('extToLanguage', () => {
  it('maps .go to go', () => expect(extToLanguage('main.go')).toBe('go'))
  it('maps .tsx to typescript', () => expect(extToLanguage('App.tsx')).toBe('typescript'))
  it('maps .kt to kotlin', () => expect(extToLanguage('Main.kt')).toBe('kotlin'))
  it('maps .swift to swift', () => expect(extToLanguage('App.swift')).toBe('swift'))
  it('maps .cs to csharp', () => expect(extToLanguage('Service.cs')).toBe('csharp'))
  it('maps .rb to ruby', () => expect(extToLanguage('app.rb')).toBe('ruby'))
  it('maps .py to python', () => expect(extToLanguage('main.py')).toBe('python'))
  it('maps .lua to lua', () => expect(extToLanguage('script.lua')).toBe('lua'))
  it('maps .json to json', () => expect(extToLanguage('package.json')).toBe('json'))
  it('maps .toml to ini', () => expect(extToLanguage('Cargo.toml')).toBe('ini'))
  it('maps .proto to protobuf', () => expect(extToLanguage('service.proto')).toBe('protobuf'))
  it('maps .txt to null', () => expect(extToLanguage('notes.txt')).toBeNull())
  it('maps .csv to null', () => expect(extToLanguage('data.csv')).toBeNull())
  it('maps no-extension file to null', () => expect(extToLanguage('Dockerfile')).toBeNull())
  it('returns null for empty string', () => expect(extToLanguage('')).toBeNull())

  it('is case-insensitive for extensions', () => {
    expect(extToLanguage('file.R')).toBe('r')
    expect(extToLanguage('file.TS')).toBe('typescript')
    expect(extToLanguage('file.KT')).toBe('kotlin')
  })

  describe('SPA/server alignment: every ExtensionsWithTextKind entry returns non-null', () => {
    for (const ext of ExtensionsWithTextKind) {
      it(`${ext} → non-null language`, () => {
        expect(extToLanguage('file' + ext)).not.toBeNull()
      })
    }
  })
})
