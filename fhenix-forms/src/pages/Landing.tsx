import { Link } from 'react-router-dom'
import { useAccount, useConnect } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { useEffect, useState } from 'react'

/* ─── FlipChar: split-flap letter animation ─── */
const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789*'

function FlipChar({ target, delay = 0, trigger = 0 }: { target: string; delay?: number; trigger?: number }) {
  const [char, setChar] = useState(target)
  const [flipping, setFlipping] = useState(false)

  useEffect(() => {
    let i = 0; let timeout: number
    const total = 14 + Math.floor(Math.random() * 8)
    const start = () => {
      setFlipping(true)
      const tick = () => {
        if (i >= total) { setChar(target); setFlipping(false); return }
        setChar(GLYPHS[Math.floor(Math.random() * GLYPHS.length)])
        i++; timeout = window.setTimeout(tick, 55)
      }
      tick()
    }
    timeout = window.setTimeout(start, delay)
    return () => clearTimeout(timeout)
  }, [target, delay, trigger])

  return (
    <span className="inline-block tabular-nums" style={{ transition: 'transform 80ms', transform: flipping ? 'translateY(-2px)' : 'translateY(0)' }}>
      {char === ' ' ? '\u00A0' : char}
    </span>
  )
}

/* ─── FormImage: blank with stamp, hover reveals form underneath ─── */
function FormImage() {
  const [hovered, setHovered] = useState(false)

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-[#e0e8e9] bg-white shadow-sm cursor-pointer" style={{ aspectRatio: '3/4' }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {/* Form content — visible on hover */}
      <div className={`absolute inset-0 p-5 flex flex-col transition-opacity duration-300 ${hovered ? 'opacity-100' : 'opacity-0'}`}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-[#64e3e5]" />
          <span className="text-[11px] text-[#5d6870] font-mono">Team Feedback Q2</span>
          <span className="ml-auto text-[9px] text-[#a7aeb1] font-mono">ENCRYPTED</span>
        </div>
        <div className="h-1 bg-[#e0e8e9] rounded-full mb-4 overflow-hidden"><div className="h-full w-1/3 bg-[#64e3e5] rounded-full" /></div>
        <p className="text-sm text-[#011823] font-medium mb-3">How satisfied are you with team communication?</p>
        {['Very satisfied', 'Satisfied', 'Neutral', 'Needs improvement'].map((opt, i) => (
          <div key={i} className={`flex items-center gap-2 px-3 py-2 rounded-lg border mb-1.5 ${i === 1 ? 'border-[#64e3e5] bg-[#64e3e5]/5' : 'border-[#e0e8e9]'}`}>
            <div className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${i === 1 ? 'border-[#64e3e5]' : 'border-[#a7aeb1]'}`}>
              {i === 1 && <div className="w-1.5 h-1.5 rounded-full bg-[#64e3e5]" />}
            </div>
            <span className={`text-xs ${i === 1 ? 'text-[#011823]' : 'text-[#5d6870]'}`}>{opt}</span>
          </div>
        ))}
        <div className="mt-auto flex items-center justify-center gap-1.5 text-[9px] text-[#64e3e5]">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          FHE encrypted
        </div>
      </div>
      {/* Stamp — visible when not hovered */}
      <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none rotate-[-12deg] transition-opacity duration-300 ${hovered ? 'opacity-0' : 'opacity-80'}`}>
        <div className="border-4 border-[#64e3e5] rounded-md px-5 py-2 opacity-80">
          <p className="font-mono text-[#64e3e5] text-lg sm:text-xl font-bold tracking-widest uppercase whitespace-nowrap">FHE Encrypted</p>
        </div>
      </div>
    </div>
  )
}

/* ─── Landing Page ─── */
export default function Landing() {
  const { isConnected } = useAccount()
  const { connect } = useConnect()

  const TITLE = 'FHENIX*FORMS'
  const [flipTrigger, setFlipTrigger] = useState(0)

  return (
    <div className="min-h-screen bg-[#f8fafa] text-[#011823] flex flex-col">
      <header className="px-5 sm:px-12 py-6 flex justify-between items-center max-w-6xl mx-auto w-full">
        <span className="text-xl font-bold tracking-tight">fhenixforms</span>
        {isConnected ? (
          <Link to="/dashboard" className="text-sm font-medium bg-[#64e3e5] text-[#011823] px-5 py-2.5 rounded-full hover:bg-[#a6eeef] transition-colors">Dashboard →</Link>
        ) : (
          <button onClick={() => connect({ connector: injected() })} className="text-sm font-medium bg-[#64e3e5] text-[#011823] px-5 py-2.5 rounded-full hover:bg-[#a6eeef] transition-colors">Connect Wallet</button>
        )}
      </header>

      <main className="flex-1 flex flex-col max-w-6xl mx-auto w-full px-5 sm:px-12">
        {/* Hero */}
        <section className="w-full grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center py-12 sm:py-20">
          <div className="text-center lg:text-left flex flex-col items-center lg:items-start">
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-[#a7aeb1] mb-6">── Encrypted intake, end-to-end ──</p>

            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.1] mb-2 font-mono cursor-pointer" onMouseEnter={() => setFlipTrigger(t => t + 1)}>
              <span className="inline-flex tracking-[0.08em] text-[#64e3e5]">
                {TITLE.split('').map((c, i) => <FlipChar key={i} target={c} delay={i * 70} trigger={flipTrigger} />)}
              </span>
            </h1>
            <p className="text-lg text-[#011823] font-semibold mb-5">Anonymous forms. Verified results.</p>

            <p className="text-base text-[#5d6870] max-w-md leading-relaxed mb-8">
              Collect sensitive responses without ever decrypting them. Inputs stay ciphertext end-to-end — visible only as aggregates after threshold decryption.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/create" className="bg-[#64e3e5] hover:bg-[#a6eeef] text-[#011823] px-7 py-3.5 rounded-full text-sm font-semibold transition-colors shadow-lg shadow-[#64e3e5]/20">Create a Form</Link>
              <Link to="/dashboard" className="border border-[#e0e8e9] hover:border-[#64e3e5] text-[#011823] px-7 py-3.5 rounded-full text-sm font-medium transition-colors">Browse Forms</Link>
            </div>
            <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.3em] text-[#a7aeb1]">Powered by Fhenix CoFHE</p>
          </div>

          <div className="w-full max-w-sm ml-auto">
            <FormImage />
          </div>
        </section>

        {/* How it works */}
        <section className="w-full py-16 border-t border-[#e0e8e9]">
          <p className="text-xs font-semibold text-[#a7aeb1] uppercase tracking-widest mb-10">How it works</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {[
              { num: '01', title: 'End-to-end FHE encryption', desc: 'Responses are encrypted in the browser using Fully Homomorphic Encryption before hitting the blockchain. Not even the contract can read individual answers.' },
              { num: '02', title: 'Homomorphic aggregation', desc: 'The smart contract adds encrypted values together without decrypting them. Tallies accumulate on ciphertexts — zero knowledge of individual votes.' },
              { num: '03', title: 'Threshold decryption', desc: 'After the form closes, the Fhenix Threshold Network collectively decrypts only the final aggregates. Results are published on-chain with cryptographic proof.' },
            ].map(({ num, title, desc }) => (
              <div key={title} className="bg-white border border-[#e0e8e9] rounded-2xl p-6">
                <span className="font-mono text-xs text-[#64e3e5]">{num}</span>
                <p className="text-sm font-semibold text-[#011823] mt-3 mb-2">{title}</p>
                <p className="text-xs text-[#5d6870] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="w-full py-16 border-t border-[#e0e8e9]">
          <p className="text-xs font-semibold text-[#a7aeb1] uppercase tracking-widest mb-10">Features</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              { title: '5 Question Types', desc: 'Single choice, multi choice, scale (1–10), yes/no, and rating (1–5).' },
              { title: 'Shareable Links', desc: 'Deploy on-chain and get a link. Anyone can respond — no sign-up.' },
              { title: 'No Server, No Backend', desc: 'Everything on-chain. No database, no API keys, no data breaches.' },
              { title: 'Drag & Drop Builder', desc: 'Reorder questions with drag-and-drop. Up to 20 questions per form.' },
              { title: 'Real-time Response Count', desc: 'See responses in real-time. Individual answers stay encrypted.' },
              { title: 'Automatic Reveal', desc: 'Verifier triggers decryption when forms close. No manual work.' },
            ].map(({ title, desc }) => (
              <div key={title} className="bg-white border border-[#e0e8e9] rounded-xl p-5">
                <p className="text-sm font-semibold text-[#011823] mb-1.5">{title}</p>
                <p className="text-xs text-[#5d6870] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Use cases */}
        <section className="w-full py-16 border-t border-[#e0e8e9]">
          <p className="text-xs font-semibold text-[#a7aeb1] uppercase tracking-widest mb-6">Perfect for</p>
          <div className="flex flex-wrap gap-2">
            {['DAO Governance', 'Team Feedback', 'Salary Surveys', 'Peer Reviews', 'NPS Surveys', 'Whistleblower Reports'].map(t => (
              <span key={t} className="text-xs font-medium bg-[#64e3e5]/10 border border-[#64e3e5]/20 px-3.5 py-2 rounded-full text-[#011823]">{t}</span>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="w-full py-16 border-t border-[#e0e8e9]">
          <div className="bg-white border border-[#e0e8e9] rounded-2xl p-10">
            <h2 className="text-xl font-semibold text-[#011823] mb-2">Ready to collect honest feedback?</h2>
            <p className="text-sm text-[#5d6870] mb-6">No sign-up. No server. Just math.</p>
            <Link to="/create" className="inline-block bg-[#64e3e5] hover:bg-[#a6eeef] text-[#011823] px-6 py-3 rounded-full text-sm font-semibold transition-colors">Create your first form →</Link>
          </div>
        </section>

        <p className="text-xs text-[#a7aeb1] mb-10 pb-10">Built on Fhenix CoFHE · Arbitrum Sepolia · Threshold Network</p>
      </main>
    </div>
  )
}
