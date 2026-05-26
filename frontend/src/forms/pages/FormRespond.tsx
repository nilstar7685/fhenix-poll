import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAccount, useWalletClient } from 'wagmi'
import { Encryptable } from '@cofhe/sdk'
import { arbitrumSepolia } from '../../lib/chains'
import { getGasFees } from '../../lib/gas'
import { getBlockHeight, publicClient } from '../../lib/fhenix'
import { useCofheClient } from '../../hooks/useCofheClient'
import { FORMS_CONTRACT_ADDRESS, FHENIX_FORMS_ABI } from '../../lib/formsAbi'

const VERIFIER = import.meta.env.VITE_VERIFIER_URL ?? '/api'

interface FormQuestion {
  question_id: number
  type: string
  text: string
  options: string[]
  slotCount: number
}

interface FormMeta {
  formId: string
  title: string
  description?: string
  questions: FormQuestion[]
}

export default function FormRespond() {
  const { formId } = useParams<{ formId: string }>()
  const { address, isConnected } = useAccount()
  const { data: walletClient } = useWalletClient()
  const { cofheClient, isReady } = useCofheClient()

  const [meta, setMeta] = useState<FormMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<Record<number, number | number[]>>({}) // qIdx → selected slot(s)
  const [status, setStatus] = useState<'idle' | 'encrypting' | 'submitting' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')
  const [alreadyResponded, setAlreadyResponded] = useState(false)
  const [formClosed, setFormClosed] = useState(false)
  const [responseCount, setResponseCount] = useState(0)

  useEffect(() => {
    if (!formId) return
    ;(async () => {
      try {
        // Read on-chain form
        const form = await publicClient.readContract({
          address: FORMS_CONTRACT_ADDRESS, abi: FHENIX_FORMS_ABI,
          functionName: 'getForm', args: [formId as `0x${string}`],
        }) as any
        if (!form.exists) { setLoading(false); return }

        setResponseCount(Number(form.responseCount))
        const currentBlock = await getBlockHeight()
        setFormClosed(currentBlock > form.endBlock)

        if (address) {
          const responded = await publicClient.readContract({
            address: FORMS_CONTRACT_ADDRESS, abi: FHENIX_FORMS_ABI,
            functionName: 'hasResponded', args: [formId as `0x${string}`, address],
          }) as boolean
          setAlreadyResponded(responded)
        }

        // Read questions from on-chain + try to get labels from IPFS via verifier
        const qs: FormQuestion[] = []
        for (let i = 1; i <= form.questionCount; i++) {
          const q = await publicClient.readContract({
            address: FORMS_CONTRACT_ADDRESS, abi: FHENIX_FORMS_ABI,
            functionName: 'getQuestion', args: [formId as `0x${string}`, i],
          }) as any
          qs.push({ question_id: i, type: ['SINGLE_CHOICE','MULTI_CHOICE','SCALE','YES_NO','RATING'][q.qType], text: `Question ${i}`, options: [], slotCount: q.slotCount })
        }

        // Try fetching metadata from verifier (has labels)
        try {
          const res = await fetch(`${VERIFIER}/communities/0x0000000000000000000000000000000000000000`)
          // Fallback: metadata might be in a different endpoint. For now use on-chain data.
        } catch {}

        setMeta({ formId, title: 'Form', description: '', questions: qs })
      } catch (e: any) {
        console.error('[FormRespond]', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [formId, address])

  const questions = meta?.questions ?? []
  const current = questions[currentQ]
  const totalQ = questions.length
  const progress = totalQ > 0 ? ((currentQ + 1) / totalQ) * 100 : 0

  function selectAnswer(qIdx: number, value: number | number[]) {
    setAnswers(prev => ({ ...prev, [qIdx]: value }))
  }

  function isAnswered(qIdx: number): boolean {
    const a = answers[qIdx]
    if (a === undefined) return false
    if (Array.isArray(a)) return a.length > 0
    return true
  }

  async function handleSubmit() {
    if (!formId || !walletClient || !address || !isReady) return
    setStatus('encrypting'); setError('')

    try {
      // Build flat array
      const flat: number[] = []
      for (let qi = 0; qi < questions.length; qi++) {
        const q = questions[qi]
        const ans = answers[qi]
        if (q.type === 'SINGLE_CHOICE' || q.type === 'YES_NO' || q.type === 'RATING' || q.type === 'SCALE') {
          for (let s = 0; s < q.slotCount; s++) {
            flat.push(s === (ans as number) ? 1 : 0)
          }
        } else if (q.type === 'MULTI_CHOICE') {
          const selected = (ans as number[]) ?? []
          for (let s = 0; s < q.slotCount; s++) {
            flat.push(selected.includes(s) ? 1 : 0)
          }
        }
      }

      // Encrypt
      const encrypted = await cofheClient
        .encryptInputs(flat.map(v => Encryptable.uint32(BigInt(v))))
        .execute()

      const encoded = encrypted.map(e => ({
        ctHash: e.ctHash, securityZone: e.securityZone, utype: e.utype, signature: e.signature as `0x${string}`,
      }))

      setStatus('submitting')
      const { maxFeePerGas, maxPriorityFeePerGas } = await getGasFees()
      const writeContract = walletClient.writeContract as (...a: any[]) => Promise<`0x${string}`>
      const hash = await writeContract({
        chain: arbitrumSepolia, account: address,
        address: FORMS_CONTRACT_ADDRESS, abi: FHENIX_FORMS_ABI,
        functionName: 'submitResponse', args: [formId as `0x${string}`, encoded],
        maxFeePerGas, maxPriorityFeePerGas,
      })
      await publicClient.waitForTransactionReceipt({ hash })
      setStatus('done')
    } catch (e: any) {
      setError(e.message ?? String(e))
      setStatus('error')
    }
  }

  if (loading) return (
    <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-[#0070F3] border-t-transparent rounded-full animate-spin" /></div>
  )

  if (!meta) return (
    <div className="max-w-md mx-auto text-center py-20"><p className="text-sm text-gray-500">Form not found.</p></div>
  )

  if (status === 'done' || alreadyResponded) return (
    <div className="max-w-md mx-auto py-12 text-center">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
        <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Response Submitted!</h2>
        <p className="text-sm text-gray-500 mb-4">Your answers are FHE-encrypted. Only aggregate results will be revealed.</p>
        <Link to={`/forms/${formId}/results`} className="text-sm text-[#0070F3] hover:underline">View Results →</Link>
      </div>
    </div>
  )

  if (formClosed) return (
    <div className="max-w-md mx-auto py-12 text-center">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
        <p className="text-sm text-gray-500 mb-3">This form has closed.</p>
        <Link to={`/forms/${formId}/results`} className="text-sm text-[#0070F3] hover:underline">View Results →</Link>
      </div>
    </div>
  )

  return (
    <div className="max-w-md mx-auto w-full py-6">
      {/* Progress bar */}
      <div className="h-1 bg-gray-100 rounded-full mb-6 overflow-hidden">
        <div className="h-full bg-[#0070F3] rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      {/* Question card */}
      {current && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 min-h-[300px] flex flex-col">
          <p className="text-xs text-gray-400 mb-2">{currentQ + 1} of {totalQ}</p>
          <h2 className="text-lg font-semibold text-gray-900 mb-6">{current.text}</h2>

          <div className="flex-1 flex flex-col gap-2">
            {(current.type === 'SINGLE_CHOICE' || current.type === 'YES_NO') && (
              <>
                {(current.type === 'YES_NO' ? ['Yes', 'No'] : current.options.length > 0 ? current.options : Array.from({length: current.slotCount}, (_, i) => `Option ${i+1}`)).map((label, idx) => (
                  <button key={idx} onClick={() => selectAnswer(currentQ, idx)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                      answers[currentQ] === idx ? 'border-[#0070F3] bg-blue-50' : 'border-gray-100 hover:border-gray-200'
                    }`}>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${answers[currentQ] === idx ? 'border-[#0070F3]' : 'border-gray-300'}`}>
                      {answers[currentQ] === idx && <div className="w-2.5 h-2.5 rounded-full bg-[#0070F3]" />}
                    </div>
                    <span className="text-sm text-gray-700">{label}</span>
                  </button>
                ))}
              </>
            )}

            {current.type === 'MULTI_CHOICE' && (
              <>
                {(current.options.length > 0 ? current.options : Array.from({length: current.slotCount}, (_, i) => `Option ${i+1}`)).map((label, idx) => {
                  const selected = (answers[currentQ] as number[] | undefined) ?? []
                  const isSelected = selected.includes(idx)
                  return (
                    <button key={idx} onClick={() => {
                      const prev = (answers[currentQ] as number[] | undefined) ?? []
                      selectAnswer(currentQ, isSelected ? prev.filter(i => i !== idx) : [...prev, idx])
                    }}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all ${
                        isSelected ? 'border-[#0070F3] bg-blue-50' : 'border-gray-100 hover:border-gray-200'
                      }`}>
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${isSelected ? 'border-[#0070F3] bg-[#0070F3]' : 'border-gray-300'}`}>
                        {isSelected && <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                      </div>
                      <span className="text-sm text-gray-700">{label}</span>
                    </button>
                  )
                })}
              </>
            )}

            {(current.type === 'SCALE' || current.type === 'RATING') && (
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                {Array.from({length: current.slotCount}, (_, i) => (
                  <button key={i} onClick={() => selectAnswer(currentQ, i)}
                    className={`w-10 h-10 rounded-xl border-2 text-sm font-semibold transition-all ${
                      answers[currentQ] === i ? 'border-[#0070F3] bg-[#0070F3] text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>
                    {current.type === 'RATING' ? '★'.repeat(i + 1).slice(0, 1) : i + 1}
                  </button>
                ))}
                {current.type === 'SCALE' && <p className="w-full text-center text-xs text-gray-400 mt-2">1 = lowest, 10 = highest</p>}
                {current.type === 'RATING' && <p className="w-full text-center text-xs text-gray-400 mt-2">1 = poor, 5 = excellent</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center gap-3 mt-4">
        {currentQ > 0 && (
          <button onClick={() => setCurrentQ(q => q - 1)}
            className="px-5 py-3 bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium rounded-xl text-sm">
            Back
          </button>
        )}
        <div className="flex-1" />
        {currentQ < totalQ - 1 ? (
          <button onClick={() => setCurrentQ(q => q + 1)} disabled={!isAnswered(currentQ)}
            className="px-5 py-3 bg-[#0070F3] text-white font-medium rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors">
            Next
          </button>
        ) : (
          <button onClick={() => void handleSubmit()}
            disabled={!isAnswered(currentQ) || !isConnected || status === 'encrypting' || status === 'submitting'}
            className="px-5 py-3 bg-[#0070F3] text-white font-medium rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors flex items-center gap-2">
            {(status === 'encrypting' || status === 'submitting') && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {status === 'encrypting' ? 'Encrypting…' : status === 'submitting' ? 'Submitting…' : !isConnected ? 'Connect Wallet' : 'Submit'}
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-500 mt-3 text-center">{error}</p>}
      <p className="text-xs text-gray-400 text-center mt-4">{responseCount} response{responseCount !== 1 ? 's' : ''} so far · FHE-encrypted</p>
    </div>
  )
}
