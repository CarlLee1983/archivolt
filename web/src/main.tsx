import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import './index.css'
import Dashboard from './pages/Dashboard'
import CanvasPage from './pages/CanvasPage'
import ReportViewer from './pages/ReportViewer'
import ReviewPage from './pages/ReviewPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/canvas" element={<CanvasPage />} />
        <Route path="/report/:sessionId" element={<ReportViewer />} />
        <Route path="/review" element={<ReviewPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
