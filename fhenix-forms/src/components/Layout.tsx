import { Outlet, Link, useLocation } from 'react-router-dom'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { injected } from 'wagmi/connectors'

export default function Layout() {
  const { address, isConnected } = useAccount()
  const { connect } = useConnect()
  const { disconnect } = useDisconnect()
  const { pathname } = useLocation()

  const navLink = (to: string, label: string) => (
    <Link to={to} className={`text-sm font-medium transition-colors ${pathname === to ? 'text-[#64e3e5]' : 'text-[#5d6870] hover:text-[#011823]'}`}>{label}</Link>
  )

  return (
    <div className="min-h-screen bg-[#f8fafa]">
      <header className="px-5 sm:px-12 py-6 flex items-center justify-between max-w-6xl mx-auto w-full">
        <div className="flex items-center gap-8">
          <Link to="/" className="text-xl font-bold tracking-tight text-[#011823]">fhenixforms</Link>
          <nav className="hidden sm:flex items-center gap-6">
            {navLink('/dashboard', 'Dashboard')}
            {navLink('/create', 'Create')}
          </nav>
        </div>
        {isConnected ? (
          <button onClick={() => disconnect()} className="text-xs font-mono bg-[#e0e8e9] px-4 py-2 rounded-full text-[#5d6870] hover:bg-[#a6eeef] transition-colors">
            {address?.slice(0, 6)}…{address?.slice(-4)}
          </button>
        ) : (
          <button onClick={() => connect({ connector: injected() })} className="text-sm font-medium bg-[#64e3e5] text-[#011823] px-5 py-2.5 rounded-full hover:bg-[#a6eeef] transition-colors">
            Connect Wallet
          </button>
        )}
      </header>
      <main className="max-w-6xl mx-auto px-5 sm:px-12 py-8">
        <Outlet />
      </main>
    </div>
  )
}
