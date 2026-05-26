import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccount, useWalletClient } from 'wagmi'
import { keccak256, stringToHex, encodePacked } from 'viem'
import { arbitrumSepolia } from '../../lib/chains'
import { getGasFees } from '../../lib/gas'
import { publicClient } from '../../lib/fhenix'
import { pinFormMetadata } from '../../lib/pinata'
import { FORMS_CONTRACT_ADDRESS, FHENIX_FORMS_ABI } from '../../lib/formsAbi'

type QType = 'SINGLE_CHOICE' | 'MULTI_CHOICE' | 'SCALE' | 'YES_NO' | 'RATING'

interface QuestionDraft {
  type: QType
  text: string
  options: string[] // for SINGLE/MULTI
}

const QTYPE_NUM: Record<QType, number> = { SINGLE_CHOICE: 0, MULTI_CHOICE: 1, SCALE: 2, YES_NO: 3, RATING: 4 }
const SLOT_COUNT: Record<QType, number | null> = { SINGLE_CHOICE: null, MULTI_CHOICE: null, SCALE: 10, YES_NO: 2, RATING: 5 }

const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'
const BLOCKS_PER_DAY = 7_200

export default function FormBuilder() {
  const navigate = useNavigate()
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [durationDays, setDurationDays] = useState(7)
  const [questions, setQuestions] = useState<QuestionDraft[]>([
    { type: 'SINGLE_CHOICE', text: '', options: ['', ''] }
  ])
  const [status, setStatus] = useState<'idle' | 'deploying' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const [createdFormId, setCreatedFormId] = useState('')
  const [txHash, setTxHash] = useState('')

  function addQuestion() {
    if (questions.length >= 20) return
    setQuestions([...questions, { type: 'SINGLE_CHOICE', text: '', options: ['', ''] }])
  }

  function updateQuestion(idx: number, patch: Partial<QuestionDraft>) {
    const copy = [...questions]
    copy[idx] = { ...copy[idx], ...patch }
    setQuestions(copy)
  }

  function removeQuestion(idx: number) {
    if (questions.length <= 1) return
    setQuestions(questions.filter((_, i) => i !== idx))
  }

  const isValid = title.trim() !== '' && questions.every(q =>
    q.text.trim() !== '' &&
    (q.type === 'SINGLE_CHOICE' || q.type === 'MULTI_CHOICE'
      ? q.options.length >= 2 && q.options.every(o => o.trim() !== '')
      : true)
  )

  async function handleDeploy() {
    if (!isConnected || !address || !walletClient || !isValid) return
    setStatus('deploying'); setError('')

    try {
      const formId = keccak256(encodePacked(['address', 'string', 'uint256'], [address, title, BigInt(Date.now())]))
      const durationBlocks = DEV_MODE ? durationDays : durationDays * BLOCKS_PER_DAY

      // Pin metadata
      const metadata = { formId, title, description, questions: questions.map((q, i) => ({
        question_id: i + 1, type: q.type, text: q.text, options: q.options,
      }))}
      const cid = await pinFormMetadata(metadata)
      const metadataHash = keccak256(stringToHex(cid || title))

      // Build contract args
      const qTypes = questions.map(q => QTYPE_NUM[q.type])
      const slotCounts = questions.map(q => SLOT_COUNT[q.type] ?? q.options.length)
      const labelHashes = questions.map(q => keccak256(stringToHex(q.text)))

      const { maxFeePerGas, maxPriorityFeePerGas } = await getGasFees()
      const writeContract = walletClient.writeContract as (...a: any[]) => Promise<`0x${string}`>
      const hash = await writeContract({
        chain: arbitrumSepolia, account: address,
        address: FORMS_CONTRACT_ADDRESS, abi: FHENIX_FORMS_ABI,
        functionName: 'createForm',
        args: [formId, metadataHash, durationBlocks, questions.length, qTypes, slotCounts, labelHashes],
        maxFeePerGas, maxPriorityFeePerGas,
      })

      setTxHash(hash)
      await publicClient.waitForTransactionReceipt({ hash })
      setCreatedFormId(formId)
      setStatus('done')
    } catch (e: any) {
      setError(e.message ?? String(e))
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <div className="max-w-lg mx-auto w-full py-12 text-center">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Form Created!</h2>
          <p className="text-sm text-gray-500 mb-4">{title}</p>
          <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 mb-4">
            <p className="text-xs text-gray-400 mb-1">Shareable link:</p>
            <p className="text-sm font-mono text-gray-700 break-all">{window.location.origin}/forms/{createdFormId}</p>
          </div>
          <button onClick={() => navigator.clipboard.writeText(`${window.location.origin}/forms/${createdFormId}`)}
            className="text-sm text-[#0070F3] hover:underline mb-4 block mx-auto">Copy link</button>
          {txHash && (
            <a href={`https://sepolia.arbiscan.io/tx/${txHash}`} target="_blank" rel="noreferrer"
              className="text-xs text-gray-400 hover:underline">View on Arbiscan ↗</a>
          )}
          <div className="flex gap-3 justify-center mt-6">
            <button onClick={() => navigate('/forms')} className="px-5 py-2.5 bg-[#011823] text-white text-sm font-medium rounded-full hover:bg-[#011823]/90">
              Dashboard
            </button>
            <button onClick={() => navigate(`/forms/${createdFormId}`)} className="px-5 py-2.5 border border-gray-200 text-gray-700 text-sm font-medium rounded-full hover:border-gray-300">
              Preview Form
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto w-full py-6">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="px-4 sm:px-6 pt-6 pb-4 border-b border-gray-100">
          <h1 className="text-lg font-semibold text-gray-900">Create Form</h1>
          <p className="text-xs text-gray-400 mt-1">Responses are FHE-encrypted. Only aggregates revealed.</p>
        </div>

        <div className="px-4 sm:px-6 py-5 space-y-5">
          {/* Title & Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Team Feedback Q2"
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0070F3]/20" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this form about?" rows={2}
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#0070F3]/20" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide">
              {DEV_MODE ? 'Duration (blocks)' : 'Duration (days)'}
            </label>
            {DEV_MODE ? (
              <div className="flex gap-2 flex-wrap">
                {[1, 5, 10, 50].map(n => (
                  <button key={n} type="button" onClick={() => setDurationDays(n)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${durationDays === n ? 'border-[#011823] bg-[#011823] text-white' : 'border-gray-200 text-gray-600'}`}>
                    {n}blk
                  </button>
                ))}
              </div>
            ) : (
              <input type="number" min={1} max={90} value={durationDays} onChange={e => setDurationDays(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0070F3]/20" />
            )}
          </div>

          {/* Questions */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">Questions</label>
            <div className="space-y-3">
              {questions.map((q, qi) => (
                <div key={qi} className="border border-gray-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded">Q{qi + 1}</span>
                    <select value={q.type} onChange={e => {
                      const type = e.target.value as QType
                      const opts = (type === 'SINGLE_CHOICE' || type === 'MULTI_CHOICE') ? ['', ''] : []
                      updateQuestion(qi, { type, options: opts })
                    }} className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white">
                      <option value="SINGLE_CHOICE">Single Choice</option>
                      <option value="MULTI_CHOICE">Multi Choice</option>
                      <option value="SCALE">Scale (1–10)</option>
                      <option value="YES_NO">Yes / No</option>
                      <option value="RATING">Rating (1–5)</option>
                    </select>
                    {questions.length > 1 && (
                      <button type="button" onClick={() => removeQuestion(qi)} className="ml-auto text-red-400 hover:text-red-600 text-sm">✕</button>
                    )}
                  </div>
                  <input value={q.text} onChange={e => updateQuestion(qi, { text: e.target.value })}
                    placeholder="Question text" className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0070F3]/20" />

                  {(q.type === 'SINGLE_CHOICE' || q.type === 'MULTI_CHOICE') && (
                    <div className="space-y-1.5 ml-4">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <div className={`w-3.5 h-3.5 border-2 border-gray-300 shrink-0 ${q.type === 'SINGLE_CHOICE' ? 'rounded-full' : 'rounded-sm'}`} />
                          <input value={opt} onChange={e => {
                            const opts = [...q.options]; opts[oi] = e.target.value
                            updateQuestion(qi, { options: opts })
                          }} placeholder={`Option ${oi + 1}`}
                            className="flex-1 px-2 py-1 text-sm border border-gray-200 rounded-lg focus:outline-none" />
                          {q.options.length > 2 && (
                            <button type="button" onClick={() => updateQuestion(qi, { options: q.options.filter((_, i) => i !== oi) })}
                              className="text-red-400 hover:text-red-600 text-xs">✕</button>
                          )}
                        </div>
                      ))}
                      {q.options.length < 10 && (
                        <button type="button" onClick={() => updateQuestion(qi, { options: [...q.options, ''] })}
                          className="text-xs text-[#0070F3] hover:underline ml-5">+ Add Option</button>
                      )}
                    </div>
                  )}

                  {q.type === 'SCALE' && <p className="text-xs text-gray-400 ml-4">Respondents pick a value from 1 to 10</p>}
                  {q.type === 'YES_NO' && <p className="text-xs text-gray-400 ml-4">Respondents answer Yes or No</p>}
                  {q.type === 'RATING' && <p className="text-xs text-gray-400 ml-4">Respondents rate 1 to 5 stars</p>}
                </div>
              ))}
            </div>
            {questions.length < 20 && (
              <button type="button" onClick={addQuestion}
                className="w-full mt-3 py-2.5 border border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-500 hover:border-[#0070F3] hover:text-[#0070F3] transition-colors">
                + Add Question
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-4 border-t border-gray-100">
          {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
          <button onClick={() => void handleDeploy()}
            disabled={!isValid || !isConnected || status === 'deploying'}
            className="w-full py-3.5 bg-[#0070F3] hover:bg-blue-600 text-white font-medium rounded-xl text-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
            {status === 'deploying' && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {status === 'deploying' ? 'Deploying…' : !isConnected ? 'Connect Wallet' : 'Create Form'}
          </button>
        </div>
      </div>
    </div>
  )
}
