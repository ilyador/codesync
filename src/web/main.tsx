import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ModalProvider } from './hooks/useModal.tsx'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ModalProvider>
      <App />
    </ModalProvider>
  </StrictMode>,
)
