import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { PresentationProvider } from './context/PresentationContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <PresentationProvider>
        <App />
      </PresentationProvider>
    </BrowserRouter>
  </StrictMode>,
)
