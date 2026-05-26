import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { usePublicClient } from 'wagmi'
import { FORMS_CONTRACT, FORMS_ABI } from '../lib/contract'

const QTYPES = ['SINGLE_CHOICE', 'MULTI_CHOICE', 'SCALE', 'YES_NO', 'RATING']

export default function FormResults() {
  const { formId } = useParams<{ formId: string }>()
  const publicClient = usePublicClient()
  const [results, setResults] = useState<{ qType: number; slotCount: number; tallies: number[] }[]>([])
  const [loading, setLoading] = useState(true)
  const [revealed, setRevealed] = useState(false)
  const [responseCount, setResponseCount] = useState(0)

  useEffect(() => {
    if (!formId || !publicClient) return
    ;(async () => {
      try {
        const form = await publicClient.readContract({ address: FORMS_CONTRACT, abi: FORMS_ABI, functionName: 'getForm', args: [formId as `0x${string}`] }) as any
        if (!form.exists) { setLoading(false); return }
        setRevealed(form.revealed); setResponseCount(Number(form.responseCount))
        if (form.revealed) {
          const res: typeof results = []
          for (let q = 1; q <= form.questionCount; q++) {
            const qData = await publicClient.readContract({ address: FORMS_CONTRACT, abi: FORMS_ABI, functionName: 'getQuestion', args: [formId as `0x${string}`, q] }) as any
            const tallies: number[] = []
            for (let s = 0; s < qData.slotCount; s++) {
              const val = await publicClient.readContract({ address: FORMS_CONTRACT, abi: FORMS_ABI, functionName: 'getRevealedTally', args: [formId as `0x${string}`, q, s] }) as number
              tallies.push(Number(val))
            }
            res.push({ qType: qData.qType, slotCount: qData.slotCount, tallies })
          }
          setResults(res)
        }
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    })()
  }, [formId, publicClient])

  if (loading) return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-[#64e3e5] border-t-transparent rounded-full animate-spin" /></div>

  return (
    <div className="max-w-lg mx-auto space-y-4">
      <Link to="/dashboard" className="text-xs text-[#a7aeb1] hover:text-[#a7aeb1]">← Dashboard</Link>

      <div className="bg-white rounded-2xl border border-[#e0e8e9]  p-5">
        <h1 className="text-lg font-semibold text-[#011823]">Results</h1>
        <div className="flex gap-3 mt-1 text-xs text-[#a7aeb1]">
          <span>{responseCount} responses</span>
          <span>·</span>
          <span className={revealed ? 'text-[#64e3e5]' : 'text-[#a7aeb1]'}>{revealed ? 'Final' : 'Pending'}</span>
        </div>
      </div>

      {!revealed ? (
        <div className="bg-white rounded-2xl border border-[#e0e8e9] p-8 text-center">
          <p className="text-sm text-[#a7aeb1]">Results will appear after the form closes and the Threshold Network reveals aggregates.</p>
        </div>
      ) : (
        results.map((q, qi) => {
          const total = q.tallies.reduce((s, v) => s + v, 0)
          const max = Math.max(...q.tallies, 1)
          const labels = QTYPES[q.qType] === 'YES_NO' ? ['Yes', 'No']
            : QTYPES[q.qType] === 'RATING' ? ['1★','2★','3★','4★','5★']
            : QTYPES[q.qType] === 'SCALE' ? Array.from({length: 10}, (_, i) => `${i+1}`)
            : Array.from({length: q.slotCount}, (_, i) => `Option ${i+1}`)

          return (
            <div key={qi} className="bg-white rounded-2xl border border-[#e0e8e9]  overflow-hidden">
              <div className="px-5 py-3 border-b border-[#e0e8e9] bg-[#f8fafa]">
                <p className="text-sm font-medium text-[#011823]">Q{qi + 1} · {QTYPES[q.qType].replace('_', ' ')}</p>
                {total > 0 && <p className="text-xs text-[#a7aeb1]">{total} responses</p>}
              </div>
              <div className="p-4 space-y-3">
                {q.tallies.map((count, idx) => {
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0
                  return (
                    <div key={idx}>
                      <div className="flex justify-between mb-1">
                        <span className="text-sm text-[#011823]">{labels[idx]}</span>
                        <span className="text-xs font-medium text-[#a7aeb1]">{count} ({pct}%)</span>
                      </div>
                      <div className="h-2.5 bg-[#e0e8e9] rounded-full overflow-hidden">
                        <div className="h-full bg-[#64e3e5] rounded-full transition-all" style={{ width: `${max > 0 ? (count / max) * 100 : 0}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })
      )}

      {revealed && (
        <div className="bg-[#64e3e5] text-[#011823] px-5 py-4 text-sm font-medium rounded-xl text-center">
          Decrypted by Fhenix Threshold Network. Individual responses never revealed.
        </div>
      )}
    </div>
  )
}
