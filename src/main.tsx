import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'react-grid-layout/css/styles.css'
import './index.css'
import App from './App.tsx'

// Versão de teste: marca a tela e o título para não confundir com o app instalado.
if (import.meta.env.DEV) {
  document.documentElement.classList.add('dev')
  document.title = 'Bullet Point — TESTE'
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
