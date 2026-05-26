import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { publicClient } from '../../lib/fhenix'
import { FORMS_CONTRACT_ADDRESS, FHENIX_FORMS_ABI } from '../../lib/formsAbi'

interface FormEntry {
  id: string
  creator: string
  responseCount: number
  endBlock: number
  revealed: boolean
  exists: boolean
}

export default function FormsDashboard() {
  const { address } = useAccount()
  const [forms, setForms] = useState<FormEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Read FormCreated events to discover forms
    ;(async () => {
      try {
        const logs = await publicClient.getLogs({
          address: FORMS_CONTRACT_ADDRESS,
          event: {
            type: 'event', name: 'FormCreated',
            inputs: [
              { name: 'formId', type: 'bytes32', indexed: true },
              { name: 'creator', type: 'address', indexed: true },
              { name: 'endBlock', type: 'uint32', indexed: false },
            ],
          },
          fromBlock: BigInt(268000000),
          toBlock: 'latest',
        })

        const entries: FormEntry[] = await Promise.all(
          logs.map(async (log) => {
            const formId = (log as any).args.formId as `0x${string}`
            const form = await publicClient.readContract({
              address: FORMS_CONTRACT_ADDRESS, abi: FHENIX_FORMS_ABI,
              functionName: 'getForm', args: [formId],
            }) as any
            return {
              id: formId,
              creator: form.creator,
              responseCount: Number(form.responseCount),
              endBlock: Number(form.endBlock),
              revealed: form.revealed,
              exists: form.exists,
            }
          })
        )
        setForms(entries.filter(f => f.exists).reverse())
      } catch (e) {
        console.error('[FormsDashboard]', e)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const myForms = forms.filter(f => address && f.creator.toLowerCase() === address.toLowerCase())
  const otherForms = forms.filter(f => !address || f.creator.toLowerCase() !== address.toLowerCase())

  return (
    <div className="max-w-2xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Forms</h1>
        <Link to="/forms/create"
          className="flex items-center gap-1.5 text-xs font-medium bg-[#011823] text-white px-4 py-2 rounded-full hover:bg-[#011823]/90 transition-colors">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M12 5v14M5 12h14" strokeLinecap="round"/>
          </svg>
          New Form
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-[#0070F3] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : forms.length === 0 ? (
        <div className="bg-white border border-gray-100 rounded-2xl p-12 text-center">
          <p className="text-sm text-gray-500 mb-2">No forms yet.</p>
          <p className="text-xs text-gray-400 mb-6">Create an encrypted form — responses are FHE-private.</p>
          <Link to="/forms/create"
            className="inline-flex items-center gap-1.5 bg-[#011823] text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-[#011823]/90">
            Create first form →
          </Link>
        </div>
      ) : (
        <>
          {myForms.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">My Forms</p>
              <div className="space-y-2">
                {myForms.map(f => <FormCard key={f.id} form={f} />)}
              </div>
            </div>
          )}
          {otherForms.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">All Forms</p>
              <div className="space-y-2">
                {otherForms.map(f => <FormCard key={f.id} form={f} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function FormCard({ form }: { form: FormEntry }) {
  return (
    <Link to={`/forms/${form.id}`}
      className="flex items-center justify-between p-4 border border-gray-100 rounded-xl bg-white hover:border-gray-200 hover:shadow-sm transition-all">
      <div>
        <p className="text-sm font-medium text-gray-900 font-mono">{form.id.slice(0, 10)}…{form.id.slice(-6)}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {form.responseCount} response{form.responseCount !== 1 ? 's' : ''} ·
          {form.revealed ? ' Results final' : ' Active'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {form.revealed ? (
          <span className="text-xs bg-green-50 text-green-600 border border-green-100 px-2 py-0.5 rounded-full">Done</span>
        ) : (
          <span className="text-xs bg-blue-50 text-blue-600 border border-blue-100 px-2 py-0.5 rounded-full">Open</span>
        )}
        <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </Link>
  )
}
