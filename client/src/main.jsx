import React from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App.jsx'
import { ThemeProvider, applyTheme } from './theme.jsx'
import './styles.css'

applyTheme((() => {
  try {
    const value = localStorage.getItem('mariachitotal-theme')
    return ['light', 'dark', 'system'].includes(value) ? value : 'system'
  } catch {
    return 'system'
  }
})())

registerSW({ immediate: true })

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </React.StrictMode>
)
