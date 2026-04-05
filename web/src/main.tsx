import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import './index.css'
import Dashboard from './pages/Dashboard'
import CanvasPage from './pages/CanvasPage'
import ReviewPage from './pages/ReviewPage'
import SessionPage from './pages/SessionPage'

function ReportRedirect() {
  const { sessionId } = useParams<{ sessionId: string }>()
  return <Navigate to={`/session/${sessionId}`} replace />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/canvas" element={<CanvasPage />} />
        <Route path="/session/:sessionId" element={<SessionPage />} />
        <Route path="/report/:sessionId" element={<ReportRedirect />} />
        <Route path="/review" element={<ReviewPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
