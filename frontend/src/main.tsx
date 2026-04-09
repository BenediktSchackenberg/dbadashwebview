import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { PresentationProvider } from './context/PresentationContext'
import { ToastProvider } from './context/ToastContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <PresentationProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </PresentationProvider>
    </BrowserRouter>
  </StrictMode>,
)
