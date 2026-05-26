import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import WalletButton from '../components/WalletButton'
import { useWallet } from '../hooks/useWallet'
import { listCommunities } from '../lib/verifier'
import type { CommunityConfig, PollInfo } from '../types'

const AVATAR_COLORS = [
  'bg-blue-50 border-blue-100 text-blue-500',
  'bg-teal-50 border-teal-100 text-teal-600',
  'bg-emerald-50 border-emerald-100 text-emerald-600',
  'bg-purple-50 border-purple-100 text-purple-600',
  'bg-orange-50 border-orange-100 text-orange-600',
]

interface FlatPoll { poll: PollInfo; community: CommunityConfig; colorIdx: number }

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Create a community',
    body: 'Define membership rules: token balance, NFT, X follow, Discord role, GitHub activity, or open to all. 11 requirement types with AND/OR logic.',
    colour: 'bg-blue-50 text-blue-600 border-blue-100',
  },
  {
    step: '02',
    title: 'Get a credential',
    body: 'The verifier checks eligibility off-chain. Your wallet receives an EIP-712 signed credential on-chain with voting weight and expiry.',
    colour: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  },
  {
    step: '03',
    title: 'Vote or respond',
    body: 'Rank options, pick one, or answer survey questions. Everything is FHE encrypted in your browser before submission. The contract tallies homomorphically.',
    colour: 'bg-amber-50 text-amber-600 border-amber-100',
  },
  {
    step: '04',
    title: 'Results verified on-chain',
    body: 'After close, the Fhenix Threshold Network decrypts only the aggregate. The signed result is published on-chain. Anyone can verify no trust required.',
    colour: 'bg-purple-50 text-purple-600 border-purple-100',
  },
]

export default function LandingPage() {
  const { isConnected } = useWallet()
  const navigate = useNavigate()
  const [polls, setPolls] = useState<FlatPoll[]>([])

  useEffect(() => {
    if (isConnected) navigate('/polls', { replace: true })
  }, [isConnected, navigate])

  useEffect(() => {
    listCommunities()
      .then(communities => {
        const flat: FlatPoll[] = []
        communities.forEach((c, ci) => {
          ; (c.polls ?? []).forEach(p => {
            flat.push({ poll: p, community: c, colorIdx: ci % AVATAR_COLORS.length })
          })
        })
        setPolls(flat.sort((a, b) => b.poll.created_at_block - a.poll.created_at_block).slice(0, 6))
      })
      .catch(() => null)
  }, [])

  return (
    <div className="bg-white text-gray-900 antialiased min-h-screen flex flex-col selection:bg-blue-100 selection:text-blue-900">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="w-full px-6 py-5 flex justify-between items-center max-w-[1200px] mx-auto">
        <span className="text-xl font-semibold tracking-tight text-gray-900 leading-none">FhenixPoll</span>
        <WalletButton />
      </header>

      <main className="flex-1 flex flex-col w-full">

        {/* ── Hero ───────────────────────────────────────────────────────── */}
        <section className="mt-20 sm:mt-28 flex flex-col items-center text-center px-4 w-full max-w-4xl mx-auto">

          <div className="inline-flex items-center gap-2 bg-gray-900 text-white px-4 py-1.5 rounded-full text-xs font-medium mb-10">
            <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] shadow-[0_0_6px_1px_rgba(16,185,129,0.6)]" />
            Fhenix CoFHE · Arbitrum Sepolia · Live
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.06]">
            <span className="text-[#0070F3]">Private polls</span>
            <br />
            <span className="text-gray-900">& anonymous surveys.</span>
          </h1>

          <p className="mt-7 text-lg text-gray-500 max-w-xl leading-relaxed">
            FHE-encrypted voting for communities. Ranked-choice, simple polls, and multi-question surveys individual responses are never revealed. Only aggregates.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center gap-3">
            <WalletButton />
            <a href={import.meta.env.VITE_FORMS_URL ?? 'https://fhenix-forms.vercel.app'}
              className="bg-[#0070F3] hover:bg-blue-600 text-white px-6 py-3 rounded-full text-sm font-medium transition-colors shadow-sm">
              FhenixForms ↗
            </a>
            <Link to="/polls"
              className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">
              Browse without connecting →
            </Link>
          </div>
        </section>

        {/* ── Three product modes ─────────────────────────────────────────── */}
        <section className="max-w-4xl mx-auto px-4 mt-20 w-full">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              {
                title: 'Polls',
                desc: 'Ranked-choice or single-pick. FHE-encrypted ballots accumulate homomorphically. Only the aggregate tally is decrypted.',
                cta: '/create-poll',
                ctaLabel: 'Create Poll',
                border: 'border-blue-100 hover:border-blue-200',
                badge: 'bg-blue-50 text-blue-600',
              },
              {
                title: 'Surveys',
                desc: 'Multi-question anonymous forms. Each answer encrypted as 0/1. Individual responses are mathematically impossible to extract.',
                cta: '/create-survey',
                ctaLabel: 'Create Survey',
                border: 'border-purple-100 hover:border-purple-200',
                badge: 'bg-purple-50 text-purple-600',
              },
              {
                title: 'Communities',
                desc: 'Gate participation with 11 requirement types: token balance, NFT, X follow, Discord, GitHub, and more. AND/OR logic.',
                cta: '/create',
                ctaLabel: 'New Community',
                border: 'border-emerald-100 hover:border-emerald-200',
                badge: 'bg-emerald-50 text-emerald-600',
              },
            ].map(({ title, desc, cta, ctaLabel, border, badge }) => (
              <div key={title} className={`bg-white border rounded-2xl p-5 flex flex-col justify-between min-h-[200px] transition-all ${border}`}>
                <div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge}`}>{title}</span>
                  <p className="text-sm text-gray-600 mt-3 leading-relaxed">{desc}</p>
                </div>
                <Link to={cta} className="mt-4 text-xs font-medium text-[#0070F3] hover:underline">
                  {ctaLabel} →
                </Link>
              </div>
            ))}
          </div>
        </section>

        {/* ── Recent activity ─────────────────────────────────────────────── */}
        <section className="max-w-4xl mx-auto px-4 mt-24 w-full">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-2 h-2 rounded-full bg-[#0070F3]" />
            <h2 className="text-sm font-semibold text-gray-900 tracking-tight">Recent Polls & Surveys</h2>
            {polls.length > 0 && <span className="text-sm text-gray-400">{polls.length}</span>}
          </div>

          {polls.length === 0 ? (
            <div className="border border-gray-100 rounded-2xl p-10 text-center">
              <p className="text-sm text-gray-400">No polls yet. Connect a wallet to create one.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {polls.map(({ poll, community, colorIdx }) => (
                <div
                  key={`${community.community_id}-${poll.poll_id}`}
                  className="border border-gray-100 bg-white rounded-2xl p-5 hover:border-gray-200 hover:shadow-sm transition-all flex flex-col justify-between min-h-[140px]"
                >
                  <div className="flex justify-between items-start gap-3">
                    <p className="text-sm font-medium text-gray-900 leading-snug line-clamp-2">{poll.title}</p>
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      {poll.poll_type === 'survey' ? (
                        <span className="text-[10px] bg-purple-50 text-purple-500 border border-purple-100 px-1.5 py-0.5 rounded-full">survey</span>
                      ) : (
                        <>
                          <div className="w-1.5 h-1.5 rounded-full bg-[#10B981]" />
                          <span className="text-[10px] text-gray-400">{poll.poll_type === 'simple' ? 'simple' : 'ranked'}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2.5">
                    {community.logo ? (
                      <img src={community.logo} alt={community.name}
                        className="w-7 h-7 rounded-full object-cover border border-gray-100 shrink-0" />
                    ) : (
                      <div className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 text-[10px] font-bold ${AVATAR_COLORS[colorIdx]}`}>
                        {community.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-medium text-gray-800 leading-none">{community.name}</p>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        {poll.poll_type === 'survey'
                          ? `${poll.questions?.length ?? 0} question${(poll.questions?.length ?? 0) !== 1 ? 's' : ''}`
                          : `${poll.options.length} option${poll.options.length !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── How it works ────────────────────────────────────────────────── */}
        <section className="max-w-4xl mx-auto px-4 mt-24 w-full">
          <div className="flex items-center gap-2.5 mb-6">
            <div className="w-2 h-2 rounded-full bg-[#10B981]" />
            <h2 className="text-sm font-semibold text-gray-900 tracking-tight">How it works</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {HOW_IT_WORKS.map(({ step, title, body, colour }) => (
              <div key={step} className="border border-gray-100 bg-white rounded-2xl p-5 flex gap-4">
                <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 text-xs font-bold ${colour}`}>
                  {step}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900 mb-1">{title}</p>
                  <p className="text-xs text-gray-500 leading-relaxed">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Built with ────────────────────────────────────────────────── */}
        <section className="max-w-4xl mx-auto px-4 mt-24 w-full">
          <p className="text-center text-xs font-medium text-gray-400 uppercase tracking-wide mb-8">Built with</p>
          <div className="flex items-center justify-center gap-12 flex-wrap">
            {[
              { src: '/fhenix-logo.svg', alt: 'Fhenix', width: 'w-28' },
              { src: '/arbitrum-logo.svg', alt: 'Arbitrum', width: 'w-32' },
            ].map(({ src, alt, width }) => (
              <img
                key={alt}
                src={src}
                alt={alt}
                className={`${width} h-auto grayscale opacity-50 hover:grayscale-0 hover:opacity-100 transition-all duration-300 cursor-pointer`}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-gray-400 font-medium mt-8">
            <span>Fhenix CoFHE</span>
            <span className="w-1 h-1 rounded-full bg-gray-200" />
            <span>Arbitrum Sepolia</span>
            <span className="w-1 h-1 rounded-full bg-gray-200" />
            <span>Threshold Network</span>
            <span className="w-1 h-1 rounded-full bg-gray-200" />
            <span>IPFS via Pinata</span>
          </div>
        </section>

        {/* ── Bottom CTA ──────────────────────────────────────────────────── */}
        <section className="max-w-4xl mx-auto px-4 mt-16 sm:mt-24 mb-16 sm:mb-32 w-full">
          <div className="bg-gray-900 rounded-3xl p-6 sm:p-10 md:p-14 flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 flex flex-col items-center">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-white tracking-tight leading-tight mb-4">
                Nobody not even us<br />
                <span className="text-[#0070F3]">can see how you voted.</span>
              </h2>
              <p className="text-gray-400 text-sm max-w-md leading-relaxed mb-10">
                Polls, surveys, and community governance all FHE-encrypted on Fhenix.
                Your credential proves membership. Your ballot is private. Results are verified on-chain.
              </p>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <WalletButton />
                <Link to="/create-survey"
                  className="text-sm font-medium text-gray-400 hover:text-white transition-colors">
                  or create a survey →
                </Link>
              </div>
            </div>
          </div>
        </section>

      </main>
    </div>
  )
}
