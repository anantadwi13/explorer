import type { RefObject } from 'react'
import { SearchIcon, CloseIcon } from './icons'
import './SearchBox.css'

interface Props {
  value: string
  onChange: (v: string) => void
  inputRef?: RefObject<HTMLInputElement | null>
}

export default function SearchBox({ value, onChange, inputRef }: Props) {
  return (
    <div className="search">
      <SearchIcon />
      <input
        ref={inputRef}
        type="text"
        placeholder="Search this folder…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Search this folder"
      />
      {value && (
        <button
          className="search-clear"
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          <CloseIcon />
        </button>
      )}
    </div>
  )
}
