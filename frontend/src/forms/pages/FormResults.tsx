import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { publicClient, getBlockHeight } from '../../lib/fhenix'
import { FORMS_CONTRACT_ADDRESS, FHENIX_FORMS_ABI } from '../../lib/formsAbi'

interface QuestionResult {
  questionId: number
  type: string
  slotCount: number
  tallies: number[]
}

export default function FormResults() {
  const { formId } = useParams<{ formId: string }>()
  const [results, setResults] = useState<QuestionResult[]>([])
  const [loading, setLoading] = useState(true)
  const [revealed, setRevealed] = useState(false)
  const [responseCount, setResponseCount] = useState(0)
  const [formClosed, setFormClosed] = useState(false)

  useEffect(() => {
    if (!formId) return
    ;(async () => {
      try {
        const form = await publicClient.readContract({
          address: FORMS_CONTRACT_ADDRESS, abi: FHENIX_FORMS_ABI,
          functionName: 'getForm', args: [formId as `0x${string}`],
        }) as any
        if (!form.exists) { setLoading(false); return }

        setRevealed(form.revealed)
        setResponseCount(Number(form.responseCount))
        const currentBlock = await getBlockHeight()
        setFormClosed(currentBlock > form.endBlock)

        if (form.revealed) {
          const qResults: QuestionResult[] = []
          for (let q = 1; q <= form.questionCount; q++) {
            const qData = await publicClient.readContract({
              address: FORMS_CONTRACT_ADDRESS, abi: FHENIX_FORMS_ABI,
              functionName: 'getQuestion', args: [formId as `0x${string}`, q],
            }) as any

            const tallies: number[] = []
            for (let s = 0; s < qData.slotCount; s++) {
              const val = await publicClient.readContract({
                address: FORMS_CONTRACT_ADDRESS, abi: FHENIX_FORMS_ABI,
                functionName: 'getRevealedTally', args: [formId as `0x${string}`, q, s],
              }) as number
              tallies.push(Number(val))
            }
            qResults.push({
              questionId: q,
              type: ['SINGLE_CHOICE','MULTI_CHOICE','SCALE','YES_NO','RATING'][qData.qType],
              slotCount: qData.slotCount,
              tallies,
            })
          }
          setResults(qResults)
        }
      } catch (e) {
        console.error('[FormResults]', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [formId])

  if (loading) return (
    <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-[#0070F3] border-t-transparent rounded-full animate-spin" /></div>
  )

  return (
    <div className="max-w-lg mx-auto w-full py-6 space-y-4">
      <Link to="/forms" className="text-xs text-gray-400 hover:text-gray-600">← All Forms</Link>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h1 className="text-lg font-semibold text-gray-900">Form Results</h1>
        <div className="flex gap-3 mt-2 text-xs text-gray-400">
          <span>{responseCount} response{responseCount !== 1 ? 's' : ''}</span>
          <span>·</span>
          <span className={revealed ? 'text-green-500' : formClosed ? 'text-amber-500' : 'text-gray-400'}>
            {revealed ? 'Results final' : formClosed ? 'Awaiting reveal' : 'Still accepting responses'}
          </span>
        </div>
      </div>

      {!revealed && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <p className="text-sm text-gray-500">
            {formClosed
              ? 'Form closed. Results will be revealed once the tally runner processes them.'
              : 'Form is still open. Results will be available after it closes.'}
          </p>
        </div>
      )}

      {revealed && results.length > 0 && (
        <div className="space-y-4">
          {results.map((q) => {
            const total = q.tallies.reduce((s, v) => s + v, 0)
            const maxVal = Math.max(...q.tallies, 1)
            const labels = q.type === 'YES_NO' ? ['Yes', 'No']
              : q.type === 'RATING' ? ['1★','2★','3★','4★','5★']
              : q.type === 'SCALE' ? Array.from({length: 10}, (_, i) => String(i + 1))
              : Array.from({length: q.slotCount}, (_, i) => `Option ${i + 1}`)

            return (
              <div key={q.questionId} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
                  <p className="text-sm font-medium text-gray-900">
                    <span className="text-xs text-gray-400 mr-2">Q{q.questionId}</span>
                    {q.type.replace('_', ' ').toLowerCase()}
                  </p>
                  {total > 0 && <p className="text-xs text-gray-400 mt-0.5">{total} response{total !== 1 ? 's' : ''}</p>}
                </div>
                <div className="p-4 space-y-2.5">
                  {q.tallies.map((count, idx) => {
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0
                    return (
                      <div key={idx}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm text-gray-700">{labels[idx] ?? `Slot ${idx}`}</span>
                          <span className="text-xs font-medium text-gray-500">{count} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-[#0070F3] rounded-full transition-all"
                            style={{ width: `${maxVal > 0 ? (count / maxVal) * 100 : 0}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
          <div className="bg-[#0070F3] text-white px-5 py-3.5 text-sm font-medium rounded-xl">
            FHE decryption by the Fhenix Threshold Network. Individual responses were never revealed.
          </div>
        </div>
      )}
    </div>
  )
}
