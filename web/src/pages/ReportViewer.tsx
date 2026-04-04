import { useParams } from 'react-router-dom'

export default function ReportViewer() {
  const { sessionId } = useParams<{ sessionId: string }>()
  return (
    <div className="flex h-screen bg-surface text-text font-sans items-center justify-center">
      <p className="text-muted">Report: {sessionId} — 即將完成</p>
    </div>
  )
}
