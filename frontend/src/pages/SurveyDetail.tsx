// Survey voting page — shows questions with radio answers, encrypts and submits via castSurveyVote.

import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { useVoting } from '../hooks/useVoting'
import { getPoll, getBlockHeight } from '../lib/fhenix'
import type { PollInfo } from '../types'

const VERIFIER_URL = import.meta.env.VITE_VERIFIER_URL ?? '/api'

export default function SurveyDetail() {
  const { communityId, pollId } = useParams<{ communityId: string; pollId: string }>()
  const { address, isConnected } = useAccount()
  const { castSurvey, status, error } = useVoting()

  const [poll, setPoll] = useState<PollInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [answers, setAnswers] = useState<Record<number, number>>({}) // questionIndex → answerIndex
  const [alreadyVoted, setAlreadyVoted] = useState(false)
  const [isPollClosed, setIsPollClosed] = useState(false)

  useEffect(() => {
    if (!pollId || !communityId) return
    ;(async () => {
      try {
        // Fetch poll metadata from verifier
        const res = await fetch(`${VERIFIER_URL}/communities/${communityId}`)
        const community = await res.json()
        const backendPoll = (community.polls ?? []).find((p: PollInfo) => p.poll_id === pollId)

        // Fetch on-chain data
        const onChainPoll = await getPoll(pollId as `0x${string}`)
        const currentBlock = await getBlockHeight()

        if (backendPoll) {
          setPoll(backendPoll)
        }
        if (onChainPoll?.exists) {
          setIsPollClosed(currentBlock > onChainPoll.endBlock)
          // Check if already voted
          if (address) {
            const { publicClient } = await import('../lib/fhenix')
            const { FHENIX_POLL_ABI, CONTRACT_ADDRESS } = await import('../lib/abi')
            const voted = await publicClient.readContract({
              address: CONTRACT_ADDRESS, abi: FHENIX_POLL_ABI,
              functionName: 'hasVoted', args: [pollId as `0x${string}`, address],
            }) as boolean
            setAlreadyVoted(voted)
          }
        }
      } catch (e) {
        console.error('[SurveyDetail] load error', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [pollId, communityId, address])

  const questions = poll?.questions ?? []
  const allAnswered = questions.length > 0 && questions.every((_, qi) => answers[qi] !== undefined)
  const isDone = status === 'done' || alreadyVoted

  async function handleSubmit() {
    if (!pollId || !allAnswered) return
    // Build flat array: for each question, 1 at chosen answer, 0 elsewhere
    const flat: number[] = []
    for (let qi = 0; qi < questions.length; qi++) {
      const q = questions[qi]
      for (let ai = 0; ai < q.answers.length; ai++) {
        flat.push(answers[qi] === ai ? 1 : 0)
      }
    }
    await castSurvey(pollId as `0x${string}`, flat)
  }

  if (loading) return (
    <div className="max-w-lg mx-auto flex justify-center py-20">
      <div className="w-6 h-6 border-2 border-[#0070F3] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (!poll) return (
    <div className="max-w-lg mx-auto text-center py-20">
      <p className="text-sm text-gray-500">Survey not found.</p>
    </div>
  )

  return (
    <div className="max-w-lg mx-auto w-full space-y-4">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <Link to={`/communities/${communityId}`} className="text-xs text-gray-400 hover:text-gray-600 mb-2 inline-block">← Back</Link>
        <h1 className="text-lg font-semibold text-gray-900">{poll.title}</h1>
        {poll.description && <p className="text-sm text-gray-500 mt-1">{poll.description}</p>}
        <div className="flex gap-2 mt-3">
          <span className="text-xs bg-purple-50 text-purple-600 border border-purple-100 px-2 py-0.5 rounded-full font-medium">Survey</span>
          <span className="text-xs bg-gray-50 text-gray-500 border border-gray-100 px-2 py-0.5 rounded-full font-medium">{questions.length} question{questions.length !== 1 ? 's' : ''}</span>
          {isPollClosed && <span className="text-xs bg-red-50 text-red-500 border border-red-100 px-2 py-0.5 rounded-full font-medium">Closed</span>}
        </div>
      </div>

      {/* Done state */}
      {isDone && (
        <div className="bg-white rounded-2xl border border-green-100 p-6 text-center">
          <div className="w-10 h-10 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-green-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <p className="text-sm font-medium text-gray-900">Response submitted!</p>
          <p className="text-xs text-gray-400 mt-1">Your answers are FHE-encrypted. Only aggregate results will be revealed.</p>
          <Link to={`/communities/${communityId}/polls/${pollId}/results`}
            className="inline-block mt-4 text-xs text-[#0070F3] hover:underline font-medium">View Results →</Link>
        </div>
      )}

      {/* Questions */}
      {!isDone && !isPollClosed && (
        <>
          <div className="space-y-3">
            {questions.map((q, qi) => (
              <div key={qi} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                <p className="text-sm font-medium text-gray-900 mb-3">
                  <span className="text-xs text-gray-400 mr-2">Q{qi + 1}</span>
                  {q.question_text}
                </p>
                <div className="flex flex-col gap-1.5">
                  {q.answers.map((a, ai) => (
                    <button key={ai} type="button"
                      onClick={() => setAnswers(prev => ({ ...prev, [qi]: ai }))}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border text-left transition-all ${
                        answers[qi] === ai
                          ? 'border-[#0070F3] bg-blue-50'
                          : 'border-gray-100 hover:border-gray-200'
                      }`}>
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        answers[qi] === ai ? 'border-[#0070F3]' : 'border-gray-300'
                      }`}>
                        {answers[qi] === ai && <div className="w-2 h-2 rounded-full bg-[#0070F3]" />}
                      </div>
                      <span className="text-sm text-gray-700">{a}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Submit */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-400">
                {Object.keys(answers).length}/{questions.length} answered
              </span>
              {Object.keys(answers).length > 0 && (
                <button onClick={() => setAnswers({})} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
              )}
            </div>
            <button
              onClick={() => void handleSubmit()}
              disabled={!allAnswered || !isConnected || status === 'encrypting' || status === 'signing' || status === 'confirming'}
              className="w-full py-3 bg-[#0070F3] hover:bg-blue-600 text-white font-medium rounded-xl text-sm transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {(status === 'encrypting' || status === 'signing' || status === 'confirming') && (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {status === 'encrypting' ? 'Encrypting…' : status === 'signing' ? 'Signing…' : status === 'confirming' ? 'Confirming…' : !isConnected ? 'Connect Wallet' : 'Submit Response'}
            </button>
            {error && <p className="text-xs text-red-500 mt-2 text-center">{error}</p>}
            <p className="text-xs text-gray-400 mt-2 text-center">Responses are FHE-encrypted. Only aggregate counts are revealed after close.</p>
          </div>
        </>
      )}

      {isPollClosed && !isDone && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
          <p className="text-sm text-gray-500">This survey has closed.</p>
          <Link to={`/communities/${communityId}/polls/${pollId}/results`}
            className="inline-block mt-3 text-xs text-[#0070F3] hover:underline font-medium">View Results →</Link>
        </div>
      )}
    </div>
  )
}
