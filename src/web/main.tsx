import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ModalProvider } from './hooks/useModal.tsx'
import { FilePreviewProvider } from './components/FilePreview.tsx'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ModalProvider>
        <FilePreviewProvider>
          <App />
        </FilePreviewProvider>
      </ModalProvider>
    </BrowserRouter>
  </StrictMode>,
)
