import { useState, useEffect } from 'react'

export type ThemeChoice = 'light' | 'dark' | 'system'

function resolvedTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return choice
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(() => {
    const stored = localStorage.getItem('explorer.theme')
    if (stored === 'light' || stored === 'dark') return stored
    return 'system'
  })

  useEffect(() => {
    const theme = resolvedTheme(choice)
    document.documentElement.setAttribute('data-theme', theme)
    if (choice === 'system') {
      localStorage.removeItem('explorer.theme')
    } else {
      localStorage.setItem('explorer.theme', choice)
    }
  }, [choice])

  // Respond to OS theme changes when in system mode
  useEffect(() => {
    if (choice !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      document.documentElement.setAttribute('data-theme', resolvedTheme('system'))
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [choice])

  return { choice, setChoice }
}
