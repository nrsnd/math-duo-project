import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { v4 as uuidv4 } from 'uuid'
import { apiGet, apiPost } from '../api'
import ProblemCard from '../components/ProblemCard'

export default function Practice() {
  const [problems, setProblems] = useState<any[] | null>(null)
  const [answers, setAnswers] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const nav = useNavigate()

  useEffect(() => {
    apiGet('/api/practice/adaptive')
      .then((r) => setProblems(r.problems))
      .catch(() => setError('Failed to load practice problems'))
  }, [])

  function updateAnswer(val: any) {
    setAnswers(prev => {
      const idx = prev.findIndex(a => a.problem_id === val.problem_id)
      if (idx >= 0) {
        const copy = prev.slice()
        copy[idx] = { ...prev[idx], ...val }
        return copy
      }
      return [...prev, val]
    })
  }

  async function submit() {
    setSubmitting(true)
    setError(null)
    try {
      const attempt_id = uuidv4()
      const payload = { attempt_id, answers }
      const r = await apiPost(`/api/practice/submit`, payload)
      nav(`/results/adaptive/${attempt_id}`, { state: r })
    } catch (e: any) {
      setError('Submit failed')
    } finally {
      setSubmitting(false)
    }
  }

  if (error) return <div className="error">{error}</div>
  if (!problems) return <div className="muted">Loading…</div>

  return (
    <div>
      <h1>Adaptive Practice</h1>
      <div className="muted">Targeted set of problems based on what you have not solved yet.</div>
      <div style={{marginTop:12}}>
        {problems.map((p: any) => (
          <ProblemCard
            key={p.id}
            problem={p}
            value={answers.find(a => a.problem_id === p.id)}
            onChange={updateAnswer}
          />
        ))}
      </div>
      <button className="btn primary" onClick={submit} disabled={submitting} style={{width:'100%', marginTop:10}}>
        {submitting ? 'Submitting…' : 'Submit Answers'}
      </button>
    </div>
  )
}
