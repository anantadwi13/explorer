import { createLowlight } from 'lowlight'

import go from 'highlight.js/lib/languages/go'
import typescript from 'highlight.js/lib/languages/typescript'
import javascript from 'highlight.js/lib/languages/javascript'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import bash from 'highlight.js/lib/languages/bash'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import scss from 'highlight.js/lib/languages/scss'
import sql from 'highlight.js/lib/languages/sql'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import java from 'highlight.js/lib/languages/java'
import yaml from 'highlight.js/lib/languages/yaml'
import markdown from 'highlight.js/lib/languages/markdown'
import csharp from 'highlight.js/lib/languages/csharp'
import kotlin from 'highlight.js/lib/languages/kotlin'
import swift from 'highlight.js/lib/languages/swift'
import scala from 'highlight.js/lib/languages/scala'
import groovy from 'highlight.js/lib/languages/groovy'
import objectivec from 'highlight.js/lib/languages/objectivec'
import fsharp from 'highlight.js/lib/languages/fsharp'
import php from 'highlight.js/lib/languages/php'
import dart from 'highlight.js/lib/languages/dart'
import lua from 'highlight.js/lib/languages/lua'
import perl from 'highlight.js/lib/languages/perl'
import powershell from 'highlight.js/lib/languages/powershell'
import r from 'highlight.js/lib/languages/r'
import haskell from 'highlight.js/lib/languages/haskell'
import elixir from 'highlight.js/lib/languages/elixir'
import erlang from 'highlight.js/lib/languages/erlang'
import clojure from 'highlight.js/lib/languages/clojure'
import julia from 'highlight.js/lib/languages/julia'
import json from 'highlight.js/lib/languages/json'
import ini from 'highlight.js/lib/languages/ini'
import graphql from 'highlight.js/lib/languages/graphql'
import protobuf from 'highlight.js/lib/languages/protobuf'

// Exported for rehype-highlight's `languages` option so it uses the same set.
export const languages = {
  go, typescript, javascript, python, ruby, rust, bash, xml, css, scss, sql,
  c, cpp, java, yaml, markdown, csharp, kotlin, swift, scala, groovy,
  objectivec, fsharp, php, dart, lua, perl, powershell, r, haskell, elixir,
  erlang, clojure, julia, json, ini, graphql, protobuf,
}

export const lowlight = createLowlight()

lowlight.register('go', go)
lowlight.register('typescript', typescript)
lowlight.register('javascript', javascript)
lowlight.register('python', python)
lowlight.register('ruby', ruby)
lowlight.register('rust', rust)
lowlight.register('bash', bash)
lowlight.register('xml', xml)
lowlight.register('css', css)
lowlight.register('scss', scss)
lowlight.register('sql', sql)
lowlight.register('c', c)
lowlight.register('cpp', cpp)
lowlight.register('java', java)
lowlight.register('yaml', yaml)
lowlight.register('markdown', markdown)
lowlight.register('csharp', csharp)
lowlight.register('kotlin', kotlin)
lowlight.register('swift', swift)
lowlight.register('scala', scala)
lowlight.register('groovy', groovy)
lowlight.register('objectivec', objectivec)
lowlight.register('fsharp', fsharp)
lowlight.register('php', php)
lowlight.register('dart', dart)
lowlight.register('lua', lua)
lowlight.register('perl', perl)
lowlight.register('powershell', powershell)
lowlight.register('r', r)
lowlight.register('haskell', haskell)
lowlight.register('elixir', elixir)
lowlight.register('erlang', erlang)
lowlight.register('clojure', clojure)
lowlight.register('julia', julia)
lowlight.register('json', json)
lowlight.register('ini', ini)
lowlight.register('graphql', graphql)
lowlight.register('protobuf', protobuf)

// extToLanguage maps a file extension (including the dot, case-insensitive) to
// a highlight.js language id registered above, or null for extensions without a
// grammar (e.g. .txt, .csv). Keep in sync with the Go server's extTable and
// the alignment test in grammars.test.ts.
export function extToLanguage(filename: string): string | null {
  if (!filename) return null
  const dot = filename.lastIndexOf('.')
  if (dot === -1) return null
  const ext = filename.slice(dot).toLowerCase()

  switch (ext) {
    // Existing web / scripting
    case '.go':   return 'go'
    case '.ts':
    case '.tsx':  return 'typescript'
    case '.js':
    case '.jsx':  return 'javascript'
    case '.py':   return 'python'
    case '.rb':   return 'ruby'
    case '.rs':   return 'rust'
    case '.sh':   return 'bash'
    // Markup / styling
    case '.html':
    case '.htm':
    case '.xml':  return 'xml'
    case '.css':  return 'css'
    case '.scss': return 'scss'
    case '.md':
    case '.markdown': return 'markdown'
    // Systems / data
    case '.sql':  return 'sql'
    case '.c':
    case '.h':    return 'c'
    case '.cpp':  return 'cpp'
    case '.java': return 'java'
    case '.yaml':
    case '.yml':  return 'yaml'
    // Data / config / query
    case '.json': return 'json'
    case '.toml': return 'ini'
    case '.graphql':
    case '.gql':  return 'graphql'
    case '.proto': return 'protobuf'
    // New programming languages
    case '.cs':   return 'csharp'
    case '.kt':
    case '.kts':  return 'kotlin'
    case '.swift': return 'swift'
    case '.scala':
    case '.sc':   return 'scala'
    case '.groovy':
    case '.gradle': return 'groovy'
    case '.m':
    case '.mm':   return 'objectivec'
    case '.fs':
    case '.fsi':
    case '.fsx':  return 'fsharp'
    case '.php':
    case '.phtml': return 'php'
    case '.dart': return 'dart'
    case '.lua':  return 'lua'
    case '.pl':
    case '.pm':   return 'perl'
    case '.ps1':
    case '.psm1': return 'powershell'
    case '.r':    return 'r'
    case '.hs':
    case '.lhs':  return 'haskell'
    case '.ex':
    case '.exs':  return 'elixir'
    case '.erl':
    case '.hrl':  return 'erlang'
    case '.clj':
    case '.cljs':
    case '.cljc':
    case '.edn':  return 'clojure'
    case '.jl':   return 'julia'
    case '.zig':  return null  // no zig grammar in highlight.js 11.x
    // No grammar for these text types
    case '.txt':
    case '.csv':
    default:      return null
  }
}
