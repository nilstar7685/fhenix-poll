// Create Survey Wizard — 3 steps: Survey Setup → Questions → Deploy.
// Matches CreatePollWizard layout exactly.

import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useWriteContract } from '../hooks/useWriteContract'
import { useConnection } from 'wagmi'
import { arbitrumSepolia } from '../lib/chains'
import { getBlockHeight, pollIdFromTitle, publicClient } from '../lib/fhenix'
import { keccak256, stringToHex } from 'viem'
import { getGasFees } from '../lib/gas'
import { listCommunities, confirmPoll } from '../lib/verifier'
import { pinPollMetadata } from '../lib/pinata'
import { FHENIX_POLL_ABI, CONTRACT_ADDRESS } from '../lib/abi'
import type { CommunityConfig } from '../types'

const BLOCKS_PER_DAY = 7_200
const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true'
const MAX_QUESTIONS = 20

type DeployStatus = 'idle' | 'pinning' | 'deploying' | 'done' | 'error'

const inputCls = "block w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-900 transition-all"
const labelCls = "block text-xs font-semibold text-gray-700 mb-1.5 uppercase tracking-wide"
const STEP_LABELS = ['Survey Setup', 'Questions', 'Deploy']

interface QuestionDraft { text: string; answers: string[] }

function WizardStepper({ step }: { step: number }) {
  return (
    <div className="flex items-center w-full mb-8">
      {STEP_LABELS.map((label, i) => {
        const done = i < step - 1; const active = i === step - 1
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium shrink-0 ring-4 ring-white z-10
              ${done   ? 'bg-[#10B981] text-white' : ''}
              ${active ? 'bg-[#0070F3] text-white shadow-sm' : ''}
              ${!done && !active ? 'bg-white border-2 border-gray-200 text-gray-400' : ''}
            `}>
              {done ? (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              ) : i + 1}
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div className={`flex-1 h-[2px] -mx-1 ${i < step - 1 ? 'bg-[#10B981]' : 'bg-gray-200'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function CreateSurveyWizard() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { address, isConnected } = useConnection()
  const { writeContractAsync } = useWriteContract()

  const [step, setStep] = useState(1)
  const [communities, setCommunities] = useState<CommunityConfig[]>([])

  // Step 1
  const [communityId, setCommunityId] = useState('')
  const [selectedCommunity, setSelectedCommunity] = useState<CommunityConfig | null>(null)
  const [notCreator, setNotCreator] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [durationDays, setDurationDays] = useState(7)

  // Step 2
  const [questions, setQuestions] = useState<QuestionDraft[]>([{ text: '', answers: ['', ''] }])

  // Step 3
  const [deployStatus, setDeployStatus] = useState<DeployStatus>('idle')
  const [deployMessage, setDeployMessage] = useState('')
  const [deployError, setDeployError] = useState('')
  const [createdTxHash, setCreatedTxHash] = useState('')

  useEffect(() => { listCommunities().then(setCommunities).catch(() => null) }, [])

  useEffect(() => {
    const preselect = searchParams.get('community')
    if (preselect && communities.length > 0 && !communityId) {
      const c = communities.find(c => c.community_id === preselect)
      if (c) { setCommunityId(preselect); setSelectedCommunity(c) }
    }
  }, [communities, searchParams])

  const step1Valid = communityId.trim() !== '' && title.trim() !== '' && !notCreator
  const step2Valid = questions.length >= 1 && questions.every(q =>
    q.text.trim() !== '' && q.answers.length >= 2 && q.answers.every(a => a.trim() !== '')
  )

  async function handleDeploy() {
    if (!isConnected || !address || !selectedCommunity) return
    setDeployStatus('pinning'); setDeployError('')

    try {
      const blockHeight = await getBlockHeight()
      const durationBlocks = DEV_MODE ? durationDays : durationDays * BLOCKS_PER_DAY
      const pollId = pollIdFromTitle(selectedCommunity.community_id as `0x${string}`, title + Date.now())

      setDeployMessage('Pinning survey metadata to IPFS…')
      await pinPollMetadata({
        poll_id: pollId,
        community_id: selectedCommunity.community_id,
        title,
        description: description.trim() || undefined,
        options: [],
        required_credential_type: selectedCommunity.credential_type,
        created_at_block: blockHeight,
        end_block: blockHeight + durationBlocks,
        poll_type: 'survey',
        questions: questions.map((q, i) => ({ question_id: i + 1, question_text: q.text, answers: q.answers })),
      })

      setDeployStatus('deploying')
      setDeployMessage('Creating survey on-chain… (wallet signature required)')

      const { maxFeePerGas, maxPriorityFeePerGas } = await getGasFees()
      const answerCounts = questions.map(q => q.answers.length)
      const labelHashes = questions.map(q => keccak256(stringToHex(q.text)))

      const hash = await writeContractAsync({
        chain: arbitrumSepolia, account: address,
        address: CONTRACT_ADDRESS, abi: FHENIX_POLL_ABI,
        functionName: 'createSurvey',
        args: [
          pollId,
          selectedCommunity.community_id as `0x${string}`,
          selectedCommunity.credential_type,
          durationBlocks,
          questions.length,
          answerCounts,
          labelHashes,
        ],
        maxFeePerGas, maxPriorityFeePerGas,
      })

      setCreatedTxHash(hash)
      setDeployMessage('Waiting for confirmation…')
      await publicClient.waitForTransactionReceipt({ hash })

      await confirmPoll({
        poll_id: pollId,
        community_id: selectedCommunity.community_id,
        title,
        description: description.trim() || undefined,
        options: [],
        required_credential_type: selectedCommunity.credential_type,
        created_at_block: blockHeight,
        end_block: blockHeight + durationBlocks,
        poll_type: 'survey',
        questions: questions.map((q, i) => ({ question_id: i + 1, question_text: q.text, answers: q.answers })),
      })

      setDeployStatus('done')
      setDeployMessage('Survey created successfully!')
    } catch (e: unknown) {
      setDeployError(e instanceof Error ? e.message : String(e))
      setDeployStatus('error')
    }
  }

  return (
    <div className="max-w-lg mx-auto w-full">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col" >

        <div className="shrink-0 px-4 sm:px-8 pt-8 pb-2">
          <WizardStepper step={step} />
          <h2 className="text-2xl font-semibold tracking-tight text-gray-900 text-center mb-4">
            {STEP_LABELS[step - 1]}
          </h2>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-4 sm:px-8 py-4">

          {/* Step 1 — Setup */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Community *</label>
                <select className={inputCls} value={communityId}
                  onChange={e => {
                    const id = e.target.value
                    setCommunityId(id)
                    const c = communities.find(c => c.community_id === id) ?? null
                    setSelectedCommunity(c)
                    setNotCreator(!!(c?.creator && address && c.creator.toLowerCase() !== address.toLowerCase()))
                  }}>
                  <option value="">Select community…</option>
                  {communities.map(c => <option key={c.community_id} value={c.community_id}>{c.name}</option>)}
                </select>
                {notCreator && (
                  <p className="text-xs text-red-500 mt-1">You are not the creator of this community and cannot create surveys in it.</p>
                )}
              </div>
              <div>
                <label className={labelCls}>Survey Title *</label>
                <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="e.g. Team Satisfaction Q2 2026" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="What is this survey about?" rows={2} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>{DEV_MODE ? 'Duration (blocks)' : 'Duration (days)'}</label>
                {DEV_MODE ? (
                  <div className="flex gap-2">
                    {[1, 5, 10, 50].map(n => (
                      <button key={n} type="button" onClick={() => setDurationDays(n)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${durationDays === n ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                        {n}blk
                      </button>
                    ))}
                  </div>
                ) : (
                  <input type="number" min={1} max={90} value={durationDays}
                    onChange={e => setDurationDays(Number(e.target.value))} className={inputCls} />
                )}
              </div>
            </div>
          )}

          {/* Step 2 — Questions */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
                Add questions with 2–10 answer options each. Responses are FHE-encrypted — only aggregate counts are revealed after the survey closes.
              </p>

              {questions.map((q, qi) => (
                <div key={qi} className="border border-gray-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded">Q{qi + 1}</span>
                    <input type="text" placeholder="Question text"
                      value={q.text}
                      onChange={e => {
                        const copy = [...questions]; copy[qi] = { ...copy[qi], text: e.target.value }
                        setQuestions(copy)
                      }}
                      className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900/10"
                    />
                    {questions.length > 1 && (
                      <button type="button" onClick={() => setQuestions(questions.filter((_, i) => i !== qi))}
                        className="text-red-400 hover:text-red-600 text-sm font-bold">✕</button>
                    )}
                  </div>
                  {q.answers.map((a, ai) => (
                    <div key={ai} className="flex items-center gap-2 ml-8">
                      <div className="w-3 h-3 rounded-full border-2 border-gray-300 shrink-0" />
                      <input type="text" placeholder={`Answer ${ai + 1}`}
                        value={a}
                        onChange={e => {
                          const copy = [...questions]
                          const answers = [...copy[qi].answers]; answers[ai] = e.target.value
                          copy[qi] = { ...copy[qi], answers }
                          setQuestions(copy)
                        }}
                        className="flex-1 px-2.5 py-1 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gray-900/10"
                      />
                      {q.answers.length > 2 && (
                        <button type="button" onClick={() => {
                          const copy = [...questions]
                          copy[qi] = { ...copy[qi], answers: q.answers.filter((_, i) => i !== ai) }
                          setQuestions(copy)
                        }} className="text-red-400 hover:text-red-600 text-xs font-bold">✕</button>
                      )}
                    </div>
                  ))}
                  {q.answers.length < 10 && (
                    <button type="button" onClick={() => {
                      const copy = [...questions]
                      copy[qi] = { ...copy[qi], answers: [...q.answers, ''] }
                      setQuestions(copy)
                    }} className="ml-8 text-xs text-[#0070F3] hover:text-blue-700 font-medium">+ Add Answer</button>
                  )}
                </div>
              ))}

              {questions.length < MAX_QUESTIONS && (
                <button type="button"
                  onClick={() => setQuestions([...questions, { text: '', answers: ['', ''] }])}
                  className="w-full py-2.5 border border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-500 hover:border-[#0070F3] hover:text-[#0070F3] transition-colors"
                >+ Add Question</button>
              )}
            </div>
          )}

          {/* Step 3 — Deploy */}
          {step === 3 && (
            <div className="flex flex-col items-center justify-center py-8">
              {deployStatus === 'done' ? (
                <>
                  <div className="w-14 h-14 bg-green-50 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-7 h-7 text-[#10B981]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">Survey Created!</h3>
                  <p className="text-sm text-gray-500 mb-4">{title}</p>
                  {createdTxHash && (
                    <a href={`https://sepolia.arbiscan.io/tx/${createdTxHash}`} target="_blank" rel="noreferrer"
                      className="text-xs text-[#0070F3] hover:underline mb-4">View on Arbiscan ↗</a>
                  )}
                  <button onClick={() => navigate(`/communities/${communityId}`)}
                    className="px-6 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-full hover:bg-gray-800 transition-colors">
                    Back to Community
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-600 mb-2">{deployMessage || 'Ready to deploy survey on-chain.'}</p>
                  {deployError && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mt-2 max-w-sm text-center">{deployError}</p>}
                  {(deployStatus === 'pinning' || deployStatus === 'deploying') && (
                    <div className="w-6 h-6 border-2 border-[#0070F3] border-t-transparent rounded-full animate-spin mt-4" />
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer navigation */}
        {deployStatus !== 'done' && (
          <div className="shrink-0 px-4 sm:px-8 pb-8 pt-4 border-t border-gray-100">
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden mb-4">
              <div className="h-full bg-[#0070F3] rounded-full transition-all" style={{ width: `${(step / STEP_LABELS.length) * 100}%` }} />
            </div>
            <div className="flex items-center gap-3">
            {step > 1 && (deployStatus === 'idle' || deployStatus === 'error') && (
              <button onClick={() => setStep(s => s - 1)}
                className="px-6 py-3.5 bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium rounded-xl text-sm transition-colors shrink-0">
                Back
              </button>
            )}

            {step < 3 ? (
              (() => {
                const disabled = step === 1 ? !step1Valid : !step2Valid
                return (
                  <button
                    disabled={disabled}
                    onClick={() => setStep(s => s + 1)}
                    className="flex-1 py-3.5 font-medium rounded-xl text-sm shadow-sm text-white transition-colors"
                    style={{ background: disabled ? '#93c5fd' : '#0070F3', cursor: disabled ? 'not-allowed' : 'pointer' }}
                  >Continue</button>
                )
              })()
            ) : (
              (deployStatus === 'idle' || deployStatus === 'error') && (
                <button onClick={() => void handleDeploy()} disabled={!isConnected}
                  className="flex-1 py-3.5 bg-[#0070F3] hover:bg-blue-600 text-white font-medium rounded-xl text-sm transition-colors shadow-sm disabled:opacity-60">
                  {isConnected ? 'Deploy Survey' : 'Connect Wallet'}
                </button>
              )
            )}
          </div>
          </div>
        )}
      </div>
    </div>
  )
}
