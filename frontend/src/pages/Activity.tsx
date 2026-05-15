import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { listCommunities } from '../lib/verifier'
import type { CommunityConfig, PollInfo } from '../types'

interface ActivityItem {
  type: 'poll_created' | 'survey_created' | 'poll_ended'
  poll: PollInfo
  community: CommunityConfig
  block: number
}

export default function Activity() {
  const [communities, setCommunities] = useState<CommunityConfig[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listCommunities().then(setCommunities).catch(() => null).finally(() => setLoading(false))
  }, [])

  const items: ActivityItem[] = communities.flatMap(c =>
    (c.polls ?? []).flatMap(poll => {
      const events: ActivityItem[] = [{
        type: poll.poll_type === 'survey' ? 'survey_created' : 'poll_created',
        poll, community: c, block: poll.created_at_block,
      }]
      if (poll.end_block && poll.end_block < (Date.now() / 12000)) {
        events.push({ type: 'poll_ended', poll, community: c, block: poll.end_block })
      }
      return events
    })
  ).sort((a, b) => b.block - a.block).slice(0, 50)

  const icon = (type: ActivityItem['type']) => {
    switch (type) {
      case 'poll_created': return <div className="w-2 h-2 rounded-full bg-[#0070F3]" />
      case 'survey_created': return <div className="w-2 h-2 rounded-full bg-purple-500" />
      case 'poll_ended': return <div className="w-2 h-2 rounded-full bg-[#10B981]" />
    }
  }

  const label = (type: ActivityItem['type']) => {
    switch (type) {
      case 'poll_created': return 'Poll created'
      case 'survey_created': return 'Survey created'
      case 'poll_ended': return 'Ended'
    }
  }

  return (
    <div className="max-w-2xl mx-auto w-full space-y-6">
      <div className="flex items-center gap-2.5">
        <div className="w-2.5 h-2.5 rounded-full bg-[#0070F3]" />
        <h1 className="text-xl font-semibold text-gray-900">Activity</h1>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-[#0070F3] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center">
          <p className="text-sm text-gray-500">No activity yet. Create a poll or survey to get started.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-100 rounded-2xl divide-y divide-gray-50">
          {items.map((item, i) => (
            <Link key={i} to={`/communities/${item.community.community_id}/polls/${item.poll.poll_id}`}
              className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition-colors first:rounded-t-2xl last:rounded-b-2xl">
              <span className="text-base">{icon(item.type)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{item.poll.title}</p>
                <p className="text-xs text-gray-400">{label(item.type)} · {item.community.name}</p>
              </div>
              <span className="text-xs text-gray-300 shrink-0">#{item.block}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
