import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { listCommunities } from '../lib/verifier'
import PollCard from '../components/PollCard'
import type { CommunityConfig } from '../types'

export default function Surveys() {
  const [communities, setCommunities] = useState<CommunityConfig[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listCommunities().then(setCommunities).catch(() => null).finally(() => setLoading(false))
  }, [])

  const surveys = communities.flatMap(c =>
    (c.polls ?? []).filter(p => p.poll_type === 'survey').map(poll => ({ community: c, poll }))
  ).sort((a, b) => b.poll.created_at_block - a.poll.created_at_block)

  return (
    <div className="max-w-2xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-2.5 h-2.5 rounded-full bg-[#0070F3]" />
          <h1 className="text-xl font-semibold text-gray-900">Surveys</h1>
          {!loading && <span className="text-sm text-gray-400">{surveys.length}</span>}
        </div>
        <Link to="/create-survey"
          className="flex items-center gap-1.5 text-xs font-medium bg-gray-900 text-white px-4 py-2 rounded-full hover:bg-gray-800 transition-colors">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" strokeLinecap="round"/>
          </svg>
          Create Survey
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-[#0070F3] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : surveys.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center">
          <p className="text-sm text-gray-500 mb-2">No surveys yet.</p>
          <p className="text-xs text-gray-400 mb-6">Create an anonymous survey with FHE-encrypted responses.</p>
          <Link to="/create-survey"
            className="inline-flex items-center gap-1.5 bg-gray-900 text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-gray-800 transition-colors">
            Create first survey →
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {surveys.map(({ community, poll }) => (
            <PollCard key={poll.poll_id} communityId={community.community_id} communityName={community.name} poll={poll} />
          ))}
        </div>
      )}
    </div>
  )
}
