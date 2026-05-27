import { useState, useRef } from 'react'

interface Props {
  onSubmit: (title: string, body: string, imageUrl?: string) => Promise<void>
  onClose: () => void
}

export default function CreatePostModal({ onSubmit, onClose }: Props) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  function insertMarkdown(before: string, after = '') {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end = ta.selectionEnd
    const selected = body.slice(start, end)
    const newText = body.slice(0, start) + before + selected + after + body.slice(end)
    setBody(newText)
    setTimeout(() => { ta.focus(); ta.setSelectionRange(start + before.length, start + before.length + selected.length) }, 0)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true); setError(null)
    try {
      await onSubmit(title.trim(), body.trim(), imageUrl.trim() || undefined)
      onClose()
    } catch (err: any) {
      setError(err.message ?? 'Failed to create post')
    } finally { setLoading(false) }
  }

  const wordCount = body.trim().split(/\s+/).filter(Boolean).length

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">New Post</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Post title" className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0070F3]/20 focus:border-[#0070F3]" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Content (Markdown)</label>
            {/* Toolbar */}
            <div className="flex items-center gap-1 mb-1.5 border border-gray-200 rounded-lg px-2 py-1 bg-gray-50">
              <button type="button" onClick={() => insertMarkdown('**', '**')} className="p-1.5 rounded hover:bg-gray-200 text-xs font-bold text-gray-600" title="Bold">B</button>
              <button type="button" onClick={() => insertMarkdown('*', '*')} className="p-1.5 rounded hover:bg-gray-200 text-xs italic text-gray-600" title="Italic">I</button>
              <button type="button" onClick={() => insertMarkdown('## ')} className="p-1.5 rounded hover:bg-gray-200 text-xs font-bold text-gray-600" title="Heading">H</button>
              <button type="button" onClick={() => insertMarkdown('`', '`')} className="p-1.5 rounded hover:bg-gray-200 text-xs font-mono text-gray-600" title="Code">&lt;/&gt;</button>
              <button type="button" onClick={() => insertMarkdown('[', '](url)')} className="p-1.5 rounded hover:bg-gray-200 text-xs text-gray-600" title="Link">🔗</button>
              <button type="button" onClick={() => insertMarkdown('- ')} className="p-1.5 rounded hover:bg-gray-200 text-xs text-gray-600" title="List">•</button>
              <div className="flex-1" />
              <span className="text-[10px] text-gray-400">{wordCount} words</span>
            </div>
            <textarea ref={textareaRef} value={body} onChange={e => setBody(e.target.value)}
              placeholder="Write your article in markdown..." rows={10}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-[#0070F3]/20 focus:border-[#0070F3]" />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Cover Image URL (optional)</label>
            <input value={imageUrl} onChange={e => setImageUrl(e.target.value)}
              placeholder="https://..." className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#0070F3]/20 focus:border-[#0070F3]" />
            {imageUrl && (
              <img src={imageUrl} alt="preview" className="mt-2 w-full h-32 object-cover rounded-lg border border-gray-100"
                onError={e => (e.currentTarget.style.display = 'none')} />
            )}
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button type="submit" disabled={!title.trim() || loading}
            className="w-full py-3 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? 'Publishing…' : 'Publish Post'}
          </button>
        </form>
      </div>
    </div>
  )
}
