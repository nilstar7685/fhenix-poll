// Forms runner — auto-reveals closed FhenixForms by calling requestFormReveal + publishFormResult.
// Runs alongside tally-runner in the same verifier process.

import { initTallyClients, getCurrentL1Block, getGasFees } from "./tally.js"
import {
  createPublicClient,
  createWalletClient,
  http,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { arbitrumSepolia } from "viem/chains"
import { createCofheConfig, createCofheClient } from "@cofhe/sdk/node"
import { arbSepolia } from "@cofhe/sdk/chains"

const FORMS_ADDRESS = (process.env.FHENIX_FORMS_ADDRESS ?? "") as `0x${string}`
const RPC_URL = process.env.FHENIX_RPC_URL ?? "https://sepolia-rollup.arbitrum.io/rpc"
const PRIVATE_KEY = process.env.VERIFIER_PRIVATE_KEY ?? ""
const INTERVAL_MS = 60_000

const FORMS_ABI = [
  {
    type: "function", name: "getForm",
    inputs: [{ name: "formId", type: "bytes32" }],
    outputs: [{ type: "tuple", components: [
      { name: "id", type: "bytes32" }, { name: "creator", type: "address" },
      { name: "metadataHash", type: "bytes32" }, { name: "questionCount", type: "uint8" },
      { name: "startBlock", type: "uint32" }, { name: "endBlock", type: "uint32" },
      { name: "responseCount", type: "uint32" }, { name: "revealed", type: "bool" },
      { name: "exists", type: "bool" },
    ]}],
    stateMutability: "view",
  },
  {
    type: "function", name: "getQuestion",
    inputs: [{ name: "formId", type: "bytes32" }, { name: "questionId", type: "uint8" }],
    outputs: [{ type: "tuple", components: [
      { name: "questionId", type: "uint8" }, { name: "qType", type: "uint8" },
      { name: "slotCount", type: "uint8" }, { name: "labelHash", type: "bytes32" },
      { name: "exists", type: "bool" },
    ]}],
    stateMutability: "view",
  },
  {
    type: "function", name: "requestFormReveal",
    inputs: [{ name: "formId", type: "bytes32" }],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "function", name: "ctHashes",
    inputs: [{ name: "formId", type: "bytes32" }, { name: "questionId", type: "uint8" }, { name: "slotId", type: "uint8" }],
    outputs: [{ type: "bytes32" }], stateMutability: "view",
  },
  {
    type: "function", name: "publishFormResult",
    inputs: [
      { name: "formId", type: "bytes32" }, { name: "questionId", type: "uint8" },
      { name: "slotId", type: "uint8" }, { name: "plaintext", type: "uint32" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [], stateMutability: "nonpayable",
  },
  {
    type: "event", name: "FormCreated",
    inputs: [
      { name: "formId", type: "bytes32", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "endBlock", type: "uint32", indexed: false },
    ],
  },
] as const

const done = new Set<string>()
let _pub: any = null
let _wallet: any = null
let _cofhe: any = null

async function initFormsClients(): Promise<boolean> {
  if (_pub) return true
  if (!FORMS_ADDRESS || FORMS_ADDRESS === "0x") return false
  if (!PRIVATE_KEY) return false

  const key = (PRIVATE_KEY.startsWith("0x") ? PRIVATE_KEY : `0x${PRIVATE_KEY}`) as `0x${string}`
  const account = privateKeyToAccount(key)

  _pub = createPublicClient({ chain: arbitrumSepolia, transport: http(RPC_URL) })
  _wallet = createWalletClient({ chain: arbitrumSepolia, transport: http(RPC_URL), account })

  const cofheConfig = createCofheConfig({ supportedChains: [arbSepolia] })
  _cofhe = createCofheClient(cofheConfig)
  await _cofhe.connect(_pub, _wallet)
  return true
}

async function discoverForms(): Promise<`0x${string}`[]> {
  const logs = await _pub.getLogs({
    address: FORMS_ADDRESS,
    event: FORMS_ABI.find((e: any) => e.name === "FormCreated")!,
    fromBlock: BigInt(process.env.DEPLOYMENT_L2_BLOCK ?? "268000000"),
    toBlock: "latest",
  }).catch(() => [] as any[])
  return logs.map((l: any) => l.args.formId as `0x${string}`)
}

async function runOnce(): Promise<void> {
  const formIds = await discoverForms()
  const l1Block = await getCurrentL1Block()

  for (const formId of formIds) {
    if (done.has(formId)) continue

    const form = await _pub.readContract({
      address: FORMS_ADDRESS, abi: FORMS_ABI, functionName: "getForm", args: [formId],
    }) as any

    if (!form.exists) { done.add(formId); continue }
    if (l1Block <= form.endBlock + 2) continue
    if (form.responseCount === 0) { done.add(formId); continue }

    console.log(`[forms-runner] Processing form ${formId.slice(0, 12)}…`)

    try {
      // Request reveal if not done
      if (!form.revealed) {
        await new Promise(r => setTimeout(r, 15_000))
        const fees = await getGasFees()
        const hash = await (_wallet as any).writeContract({
          address: FORMS_ADDRESS, abi: FORMS_ABI,
          functionName: "requestFormReveal", args: [formId], ...fees,
        })
        await _pub.waitForTransactionReceipt({ hash })
        console.log(`[forms-runner] requestFormReveal confirmed: ${hash}`)
      }

      // Publish results per question×slot
      for (let q = 1; q <= form.questionCount; q++) {
        const qData = await _pub.readContract({
          address: FORMS_ADDRESS, abi: FORMS_ABI, functionName: "getQuestion", args: [formId, q],
        }) as any

        for (let s = 0; s < qData.slotCount; s++) {
          const ctHashHex = await _pub.readContract({
            address: FORMS_ADDRESS, abi: FORMS_ABI, functionName: "ctHashes", args: [formId, q, s],
          }) as `0x${string}`
          const ctHash = BigInt(ctHashHex)
          if (ctHash === 0n) continue

          const { decryptedValue, signature } = await _cofhe.decryptForTx(ctHash).withoutPermit().execute()
          const fees = await getGasFees()
          const hash = await (_wallet as any).writeContract({
            address: FORMS_ADDRESS, abi: FORMS_ABI,
            functionName: "publishFormResult",
            args: [formId, q, s, Number(decryptedValue), signature], ...fees,
          })
          await _pub.waitForTransactionReceipt({ hash })
          console.log(`[forms-runner]   Q${q} S${s}: published ${decryptedValue}`)
        }
      }

      done.add(formId)
      console.log(`[forms-runner] Form ${formId.slice(0, 12)}… fully revealed.`)
    } catch (e: any) {
      const msg = e.message ?? ""
      if (/still open/i.test(msg)) {
        console.log(`[forms-runner] Form ${formId.slice(0, 12)}… not yet closed`)
      } else {
        console.error(`[forms-runner] Error:`, msg)
      }
    }
  }
}

export async function startFormsRunner(): Promise<void> {
  const ready = await initFormsClients()
  if (!ready) {
    console.warn("[forms-runner] Disabled — FHENIX_FORMS_ADDRESS not set")
    return
  }
  console.log("[forms-runner] Started — checking every 60s for closed forms")
  void runOnce()
  setInterval(() => void runOnce(), INTERVAL_MS)
}
