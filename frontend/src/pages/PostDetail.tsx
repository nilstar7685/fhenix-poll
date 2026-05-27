import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'

interface Post {
  post_id: string
  community_id: string
  author: string
  title: string
  body: string
  imageUrl?: string
  timestamp?: number
}

function renderMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold text-gray-900 mt-6 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold text-gray-900 mt-8 mb-3">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-gray-900 mt-8 mb-4">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="bg-gray-100 text-gray-800 px-1.5 py-0.5 rounded text-sm font-mono">$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener" class="text-[#0070F3] hover:underline">$1</a>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-gray-700">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal text-gray-700">$2</li>')
    .replace(/\n\n/g, '</p><p class="text-gray-700 leading-relaxed mb-4">')
    .replace(/\n/g, '<br/>')
}

function readingTime(text: string): string {
  const words = text.split(/\s+/).length
  const mins = Math.max(1, Math.ceil(words / 200))
  return `${mins} min read`
}

function timeAgo(ts?: number): string {
  if (!ts) return ''
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

export default function PostDetail() {
  const { id: communityId, postId } = useParams<{ id: string; postId: string }>()
  const [post, setPost] = useState<Post | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!postId) return
    const verifierUrl = import.meta.env.VITE_VERIFIER_URL ?? 'http://localhost:3001'
    fetch(`${verifierUrl}/posts/${postId}`)
      .then(r => r.json())
      .then(setPost)
      .catch(() => null)
      .finally(() => setLoading(false))
  }, [postId])

  if (loading) return <div className="flex justify-center py-20"><div className="w-6 h-6 border-2 border-[#0070F3] border-t-transparent rounded-full animate-spin" /></div>
  if (!post) return <div className="text-center py-20 text-sm text-gray-500">Post not found.</div>

  return (
    <article className="max-w-2xl mx-auto">
      <Link to={`/communities/${communityId}/posts`} className="text-sm text-gray-500 hover:text-gray-900 mb-6 inline-block">← Back to posts</Link>

      <header className="mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 leading-tight">{post.title}</h1>
        <div className="flex items-center gap-3 mt-4 text-sm text-gray-500">
          <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{post.author?.slice(0, 6)}…{post.author?.slice(-4)}</span>
          {post.timestamp && <span>{timeAgo(post.timestamp)}</span>}
          <span>·</span>
          <span>{readingTime(post.body)}</span>
        </div>
      </header>

      {post.imageUrl && (
        <img src={post.imageUrl} alt="" className="w-full rounded-xl mb-8 border border-gray-100" />
      )}

      <div
        className="prose prose-gray max-w-none"
        dangerouslySetInnerHTML={{ __html: `<p class="text-gray-700 leading-relaxed mb-4">${renderMarkdown(post.body)}</p>` }}
      />
    </article>
  )
}
