import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useWrap } from './useWrap'

afterEach(() => {
  localStorage.clear()
})

describe('useWrap', () => {
  it('defaults to wrap=true when localStorage has no value', () => {
    const { result } = renderHook(() => useWrap())
    expect(result.current[0]).toBe(true)
  })

  it('reads "off" from localStorage as wrap=false', () => {
    localStorage.setItem('explorer.wrap', 'off')
    const { result } = renderHook(() => useWrap())
    expect(result.current[0]).toBe(false)
  })

  it('reads "on" from localStorage as wrap=true', () => {
    localStorage.setItem('explorer.wrap', 'on')
    const { result } = renderHook(() => useWrap())
    expect(result.current[0]).toBe(true)
  })

  it('falls back to wrap=true for unrecognized stored values', () => {
    localStorage.setItem('explorer.wrap', 'maybe')
    const { result } = renderHook(() => useWrap())
    expect(result.current[0]).toBe(true)
  })

  it('persists toggles to localStorage and updates state', () => {
    const { result } = renderHook(() => useWrap())
    expect(result.current[0]).toBe(true)
    act(() => result.current[1](false))
    expect(result.current[0]).toBe(false)
    expect(localStorage.getItem('explorer.wrap')).toBe('off')
    act(() => result.current[1](true))
    expect(result.current[0]).toBe(true)
    expect(localStorage.getItem('explorer.wrap')).toBe('on')
  })
})
