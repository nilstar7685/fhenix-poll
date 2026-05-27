import { useState } from 'react'

interface Props {
  url: string
  title: string
  description?: string
}

export default function ShareButtons({ url, title, description }: Props) {
  const [copied, setCopied] = useState(false)

  const text = description ?? `🗳️ ${title} — Vote anonymously with FHE encryption on FhenixPoll`

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
  const telegramUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`

  async function handleCopy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleNativeShare() {
    if (navigator.share) {
      await navigator.share({ title, text, url }).catch(() => {})
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* Copy Link */}
      <button onClick={handleCopy} className="flex items-center gap-1.5 text-xs font-medium border border-gray-200 px-3 py-1.5 rounded-full hover:border-gray-300 transition-colors">
        {copied ? (
          <><svg className="w-3.5 h-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>Copied</>
        ) : (
          <><svg className="w-3.5 h-3.5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy</>
        )}
      </button>

      {/* Twitter/X */}
      <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-medium border border-gray-200 px-3 py-1.5 rounded-full hover:border-gray-300 hover:bg-gray-50 transition-colors">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        Share
      </a>

      {/* Telegram */}
      <a href={telegramUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-medium border border-gray-200 px-3 py-1.5 rounded-full hover:border-gray-300 hover:bg-gray-50 transition-colors">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0a12 12 0 00-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 01.171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
        Telegram
      </a>

      {/* Native share (mobile) */}
      {typeof navigator !== 'undefined' && 'share' in navigator && (
        <button onClick={handleNativeShare} className="flex items-center gap-1.5 text-xs font-medium border border-gray-200 px-3 py-1.5 rounded-full hover:border-gray-300 transition-colors sm:hidden">
          <svg className="w-3.5 h-3.5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          More
        </button>
      )}
    </div>
  )
}
