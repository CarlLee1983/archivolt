import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Dashboard from './pages/Dashboard'
import CanvasPage from './pages/CanvasPage'
import ReportViewer from './pages/ReportViewer'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/canvas" element={<CanvasPage />} />
        <Route path="/report/:sessionId" element={<ReportViewer />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
