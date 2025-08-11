type Props = {
  problem: any
  value: any
  onChange: (val: any) => void
}

export default function ProblemCard({ problem, value, onChange }: Props) {
  return (
    <div className="card">
      <div style={{fontWeight:600, marginBottom:8}}>{problem.prompt}</div>
      {problem.type === 'mcq' ? (
        <div style={{display:'grid', gap:8}}>
          {problem.options.map((opt: any) => (
            <label key={opt.id} style={{display:'flex', gap:8, alignItems:'center'}}>
              <input
                type="radio"
                name={`p-${problem.id}`}
                checked={value?.option_id === opt.id}
                onChange={() => onChange({ problem_id: problem.id, option_id: opt.id })}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>
      ) : (
        <input
          type="text"
          inputMode="numeric"
          placeholder="Type your answer"
          value={value?.value || ''}
          onChange={(e) => onChange({ problem_id: problem.id, value: e.target.value })}
          style={{width:'100%', padding:'10px 12px', borderRadius:10, border:'1px solid #e5e7eb'}}
        />
      )}
    </div>
  )
}
