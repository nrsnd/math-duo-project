import { useEffect, useState } from 'react'
import { apiGet } from '../api'

export default function Profile() {
  const [p, setP] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiGet('/api/profile').then(setP).catch(() => setError('Failed to load profile'))
  }, [])

  if (error) return <div className="error">{error}</div>
  if (!p) return <div className="muted">Loading…</div>

  return (
    <div>
      <h1>Profile</h1>
      <div className="card" style={{display:'grid', gap:8}}>
        <div><strong>Total XP:</strong> {p.total_xp}</div>
        <div><strong>Current Streak:</strong> {p.current_streak}</div>
        <div><strong>Best Streak:</strong> {p.best_streak}</div>
        <div><strong>Overall Progress:</strong> {p.progress_percentage}%</div>
      </div>
    </div>
  )
}
