import { useLocation, useNavigate, useParams, Link } from 'react-router-dom'

export default function Results() {
  const { state } = useLocation() as any
  const { lessonId } = useParams()
  const nav = useNavigate()

  if (!state) {
    return (
      <div className="card">
        <div className="error">No results to show.</div>
        <button className="btn" onClick={() => nav(`/lesson/${lessonId}`)}>Back</button>
      </div>
    )
  }

  const r = state

  return (
    <div>
      <h1>Results</h1>
      <div className="card" style={{textAlign:'center'}}>
        <div style={{fontSize:14}} className="muted">XP Gained</div>
        <div style={{fontSize:40, fontWeight:800, margin:'6px 0'}}>{r.xp_gained}</div>
        <div className="muted">Total XP: {r.total_xp}</div>
        <div style={{marginTop:12}}>
          <div><strong>Streak:</strong> {r.streak.current} (best {r.streak.best})</div>
          <div className="muted">Change: {r.streak.change}</div>
        </div>
        <div style={{marginTop:12}}>
          <div className="progress"><span style={{width:`${r.lesson_progress.percent}%`}}/></div>
          <div className="muted" style={{marginTop:6}}>
            Progress: {r.lesson_progress.solved_count}/{r.lesson_progress.total_count} ({r.lesson_progress.percent}%)
          </div>
        </div>
      </div>

      <div className="card">
        <div style={{fontWeight:600, marginBottom:8}}>Per-question</div>
        {r.results.map((x: any) => (
          <div key={x.problem_id} style={{padding:'10px 0', borderTop:'1px solid #eee'}}>
            <div style={{display:'flex', justifyContent:'space-between'}}>
              <div>#{x.problem_id}</div>
              <div style={{fontWeight:600}}>{x.correct ? '✅ Correct' : '❌ Incorrect'}</div>
            </div>
            {x.explanation && (
              <div className="muted" style={{marginTop:6}}>
                <strong>Explanation:</strong> {x.explanation}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{display:'flex', gap:8}}>
        {lessonId && <Link className="btn" to={`/lesson/${lessonId}`}>Try Again</Link>}
        <Link className="btn primary" to="/">Back to Lessons</Link>
      </div>
    </div>
  )
}
