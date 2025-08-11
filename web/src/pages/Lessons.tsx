import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiGet } from '../api'

type Lesson = {
  id: number; title: string; description: string;
  progress: { solved_count: number; total_count: number; percent: number; completed: boolean }
}

export default function Lessons() {
  const [lessons, setLessons] = useState<Lesson[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    apiGet('/api/lessons').then(setLessons).catch(e => setError('Failed to load lessons'))
  }, [])

  if (error) return <div className="error">{error}</div>
  if (!lessons) return <div className="muted">Loading lessons…</div>

  return (
    <div>
      <h1>Lessons</h1>
      {lessons.map(l => (
        <div key={l.id} className="card">
          <h3 style={{margin:'0 0 6px'}}>{l.title}</h3>
          <div className="muted">{l.description}</div>
          <div style={{display:'flex', alignItems:'center', gap:8, marginTop:8}}>
            <div className="progress"><span style={{width:`${l.progress.percent}%`}}/></div>
            <div className="muted" style={{minWidth:60, textAlign:'right'}}>{l.progress.percent}%</div>
          </div>
          <div style={{display:'flex', gap:8, marginTop:10}}>
            <Link to={`/lesson/${l.id}`} className="btn primary">Start</Link>
            {l.progress.completed && <span className="muted">✓ Completed</span>}
          </div>
        </div>
      ))}
    </div>
  )
}
