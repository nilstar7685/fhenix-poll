import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAccount, usePublicClient } from 'wagmi'
import { FORMS_CONTRACT, FORMS_ABI } from '../lib/contract'

interface FormEntry { id: string; creator: string; responseCount: number; revealed: boolean; endBlock: number }

export default function Dashboard() {
  const { address } = useAccount()
  const publicClient = usePublicClient()
  const [forms, setForms] = useState<FormEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!publicClient) return
    ;(async () => {
      try {
        const logs = await publicClient.getLogs({
          address: FORMS_CONTRACT,
          event: { type: 'event', name: 'FormCreated', inputs: [
            { name: 'formId', type: 'bytes32', indexed: true },
            { name: 'creator', type: 'address', indexed: true },
            { name: 'endBlock', type: 'uint32', indexed: false },
          ]},
          fromBlock: BigInt(268000000), toBlock: 'latest',
        })
        const entries = await Promise.all(logs.map(async (log) => {
          const fId = (log as any).args.formId as `0x${string}`
          const form = await publicClient.readContract({
            address: FORMS_CONTRACT, abi: FORMS_ABI, functionName: 'getForm', args: [fId],
          }) as any
          return { id: fId, creator: form.creator, responseCount: Number(form.responseCount), revealed: form.revealed, endBlock: Number(form.endBlock) }
        }))
        setForms(entries.reverse())
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
    })()
  }, [publicClient])

  const myForms = forms.filter(f => address && f.creator.toLowerCase() === address.toLowerCase())
  const otherForms = forms.filter(f => !address || f.creator.toLowerCase() !== address.toLowerCase())

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-[#011823]">My Forms</h1>
          <p className="text-sm text-[#a7aeb1] mt-0.5">Create, share, and track encrypted forms</p>
        </div>
        <Link to="/create" className="flex items-center gap-1.5 text-sm font-medium bg-[#64e3e5] text-[#011823] px-4 py-2.5 rounded-full hover:bg-[#a6eeef] transition-colors">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14" strokeLinecap="round"/></svg>
          New Form
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-6 h-6 border-2 border-[#64e3e5] border-t-transparent rounded-full animate-spin" /></div>
      ) : forms.length === 0 ? (
        <div className="bg-white border border-[#e0e8e9] rounded-2xl p-12 text-center">
          <div className="w-16 h-16 bg-[#e0e8e9] rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-[#a7aeb1]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 12h6M12 9v6M3 12a9 9 0 1118 0 9 9 0 01-18 0z" strokeLinecap="round"/>
            </svg>
          </div>
          <h3 className="text-base font-semibold text-[#011823] mb-1">No forms yet</h3>
          <p className="text-sm text-[#a7aeb1] mb-6">Create your first encrypted form and share it with anyone.</p>
          <Link to="/create" className="inline-block bg-[#64e3e5] text-[#011823] px-6 py-2.5 rounded-full text-sm font-semibold hover:bg-[#a6eeef] transition-colors">
            Create Form →
          </Link>
        </div>
      ) : (
        <>
          {myForms.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#a7aeb1] uppercase tracking-wide mb-3">Created by you</p>
              <div className="space-y-2">{myForms.map(f => <FormCard key={f.id} form={f} showShare />)}</div>
            </div>
          )}
          {otherForms.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-[#a7aeb1] uppercase tracking-wide mb-3">All forms</p>
              <div className="space-y-2">{otherForms.map(f => <FormCard key={f.id} form={f} />)}</div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function FormCard({ form, showShare }: { form: FormEntry; showShare?: boolean }) {
  const shareUrl = `${window.location.origin}/f/${form.id}`

  return (
    <div className="flex items-center justify-between p-4 bg-white border border-[#e0e8e9] rounded-xl hover:border-[#64e3e5]/40 hover: transition-all">
      <Link to={`/f/${form.id}`} className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[#011823] font-mono truncate">{form.id.slice(0, 12)}…{form.id.slice(-6)}</p>
        <p className="text-xs text-[#a7aeb1] mt-0.5">
          {form.responseCount} response{form.responseCount !== 1 ? 's' : ''} ·
          {form.revealed ? ' Results ready' : ' Collecting'}
        </p>
      </Link>
      <div className="flex items-center gap-2 shrink-0 ml-3">
        {showShare && (
          <button onClick={(e) => { e.preventDefault(); navigator.clipboard.writeText(shareUrl) }}
            className="text-xs text-[#a7aeb1] hover:text-[#64e3e5] border border-[#e0e8e9] px-2.5 py-1 rounded-lg transition-colors"
            title="Copy share link">
            Share
          </button>
        )}
        <Link to={`/f/${form.id}/results`}
          className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
            form.revealed ? 'bg-[#64e3e5]/10 text-[#011823] border-[#64e3e5]/30' : 'bg-[#e0e8e9] text-[#a7aeb1] border-[#e0e8e9]'
          }`}>
          {form.revealed ? 'Results' : 'Pending'}
        </Link>
      </div>
    </div>
  )
}
