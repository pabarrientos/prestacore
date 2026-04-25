'use client'

import { useTheme } from 'next-themes'
import { useEffect } from 'react'

export function ThemeFavicon() {
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    const updateFavicon = () => {
      const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
      if (!favicon) return
      favicon.href = resolvedTheme === 'dark' ? '/icon-dark.svg' : '/icon-light.svg'
    }

    // 1. Actualizar inmediatamente (para navegación SPA)
    updateFavicon()

    // 2. Re-actualizar cuando el theme cambia
    // (resolvedTheme cambia cuando el usuario togglea el theme)

    // 3. MutationObserver para captar cambios en el <head>
    const observer = new MutationObserver(updateFavicon)
    observer.observe(document.head, { childList: true })

    // 4.También cuando el tab vuelve a estar visible (navegación history)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') updateFavicon()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [resolvedTheme])

  return null
}
