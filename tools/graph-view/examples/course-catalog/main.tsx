import React from 'react'
import { createRoot } from 'react-dom/client'
import { themeChoiceOf } from '@temporal-architect/graph-view'
import { App } from './App'

// `?theme=dark` pins the pane's theme; anything else is "system".
const initialTheme = themeChoiceOf(new URLSearchParams(location.search).get('theme'))

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App initialTheme={initialTheme} />
  </React.StrictMode>,
)
