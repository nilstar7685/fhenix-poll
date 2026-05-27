import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getBlockHeight, getVoteCount } from '../lib/fhenix'
import type { PollInfo } from '../types'

interface Props {
  communityId: string
  communityName: string
  poll: PollInfo
}

// Arbitrum Sepolia: ~0.25s per block

function getDeadlineInfo(endBlock: number, startBlock: number, currentBlock: number) {
  if (currentBlock === 0) return { text: `ends #${endBlock.toLocaleString()}`, cls: 'text-gray-400 bg-gray-50 border-gray-100', closed: false, closingSoon: false }

  const blocksLeft = endBlock - currentBlock
  if (blocksLeft <= 0) {
    return { text: 'Closed', cls: 'text-gray-400 bg-gray-50 border-gray-100', closed: true, closingSoon: false }
  }

  // Convert blocks to time — Arbitrum Sepolia ~0.25s/block
  const secsLeft = blocksLeft * 0.25
  const closingSoon = secsLeft < 86400

  const d = Math.floor(secsLeft / 86400)
  const h = Math.floor((secsLeft % 86400) / 3600)
  const m = Math.floor((secsLeft % 3600) / 60)
  const text = d > 0 ? `${d}d ${h}h left` : h > 0 ? `${h}h ${m}m left` : `${m}m left`

  const cls = secsLeft < 3600 ? 'text-red-500 bg-red-50 border-red-100'
    : secsLeft < 86400 ? 'text-amber-600 bg-amber-50 border-amber-100'
    : 'text-gray-500 bg-gray-50 border-gray-100'

  return { text, cls, closed: false, closingSoon }
}

export default function PollCard({ communityId, communityName, poll }: Props) {
  const [currentBlock, setCurrentBlock] = useState(0)
  const [voteCount, setVoteCount] = useState<number | null>(null)

  useEffect(() => {
    getBlockHeight().then(setCurrentBlock).catch(() => null)
    getVoteCount(poll.poll_id as `0x${string}`).then(setVoteCount).catch(() => null)
  }, [poll.poll_id])

  // Refresh countdown every 30s
  useEffect(() => {
    const interval = setInterval(() => {
      getBlockHeight().then(setCurrentBlock).catch(() => null)
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  const rootOptions = poll.options.filter(o => o.parent_option_id === 0)
  const startBlock = poll.end_block ? poll.end_block - (poll.end_block - (currentBlock || poll.end_block)) : 0
  const deadline = poll.end_block ? getDeadlineInfo(poll.end_block, startBlock, currentBlock) : null

  return (
    <Link
      to={poll.poll_type === 'survey' ? `/communities/${communityId}/surveys/${poll.poll_id}` : `/communities/${communityId}/polls/${poll.poll_id}`}
      className="border border-gray-100 bg-white rounded-[1.25rem] p-5 hover:border-gray-200 hover:shadow-[0_4px_20px_-10px_rgba(0,0,0,0.08)] transition-all group flex flex-col justify-between min-h-[160px] block"
    >
      <div className="pt-1">
        <div className="flex justify-between items-start gap-3">
          <h3 className="text-base font-medium text-gray-900 leading-snug">{poll.title}</h3>
          <div className="flex items-center gap-1.5 shrink-0">
            {deadline?.closingSoon && !deadline.closed && (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
              </span>
            )}
            {deadline?.text && (
              <span className={`text-xs font-medium border px-2 py-0.5 rounded-full ${deadline.cls}`}>
                {deadline.text}
              </span>
            )}
            {deadline?.closed && voteCount !== null && voteCount > 0 && (
              <span className="text-xs font-medium border px-2 py-0.5 rounded-full text-emerald-600 bg-emerald-50 border-emerald-100">
                Results ready
              </span>
            )}
          </div>
        </div>

        {poll.description && (
          <p className="text-sm text-gray-500 mt-2 line-clamp-2 leading-relaxed">{poll.description}</p>
        )}
      </div>

      <div className="mt-4 flex justify-between items-end">
        <div className="flex flex-wrap gap-1.5 min-w-0 flex-1">
          {rootOptions.slice(0, 3).map(opt => (
            <span key={opt.option_id} className="text-xs font-medium bg-gray-50 text-gray-600 border border-gray-100 px-2.5 py-1 rounded-lg truncate max-w-[140px]">
              {opt.label}
            </span>
          ))}
          {rootOptions.length > 3 && (
            <span className="text-xs font-medium text-gray-400 px-1 py-1">+{rootOptions.length - 3}</span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {voteCount !== null && (
            <span className="text-xs font-medium text-gray-400">{voteCount} {voteCount === 1 ? 'vote' : 'votes'}</span>
          )}
          <span className="text-xs font-medium text-gray-400">{communityName}</span>
          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); navigator.clipboard.writeText(`${window.location.origin}/communities/${communityId}/polls/${poll.poll_id}`) }}
            className="p-1 rounded-full hover:bg-gray-100 transition-colors" title="Copy share link">
            <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          </button>
        </div>
      </div>
    </Link>
  )
}
