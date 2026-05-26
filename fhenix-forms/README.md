# FhenixForms

Privacy-preserving encrypted forms powered by Fully Homomorphic Encryption (FHE) on Fhenix CoFHE / Arbitrum Sepolia. Collect sensitive responses without ever decrypting them — only aggregate results are revealed.

**Contract (Arbitrum Sepolia):** `0x1796944Ac448714897B113B5FB2cD6D79b6a5B9d`

---

## How it works

| Step | Actor | Action |
|------|-------|--------|
| 1 | **Creator** | `createForm(formId, metadataHash, duration, questions, types, slots, labels)` |
| 2 | **Respondent** | Opens shareable link `/f/:formId` |
| 3 | **Respondent** | Answers encrypted in browser via `@cofhe/sdk/web` → `submitResponse(formId, InEuint32[])` |
| 4 | *(on-chain)* | Contract accumulates `FHE.add` on encrypted tallies per question×slot |
| 5 | **Forms Runner** | After `endBlock` passes: `requestFormReveal()` → `FHE.allowPublic` per tally |
| 6 | **Threshold Network** | Returns `plaintext + signature` per tally slot |
| 7 | **Forms Runner** | `publishFormResult(formId, questionId, slotId, plaintext, signature)` |
| 8 | **Anyone** | Reads `getRevealedTally(formId, questionId, slotId)` → trustless aggregate results |

---

## Features

- **5 question types** — Single Choice, Multi Choice, Scale (1–10), Yes/No, Rating (1–5)
- **No gating** — anyone with the link can respond (no credentials, no sign-up)
- **FHE-encrypted responses** — each answer encrypted as `euint32(0/1)` per slot
- **Homomorphic aggregation** — tallies accumulate under encryption
- **Threshold decryption** — only aggregates revealed, never individual responses
- **Drag & drop builder** — reorder questions, up to 20 per form
- **Typeform-style UX** — one question per screen with progress bar
- **Automatic reveal** — forms-runner auto-decrypts after close
- **Shareable links** — `/f/:formId` works like Google Forms
- **Split-flap animation** — landing page title with interactive hover effect

---

## Quick start

```bash
cd fhenix-forms
npm install
npm run dev
# → http://localhost:5173
```

### Environment variables

Create `.env`:
```
VITE_FORMS_CONTRACT=0x1796944Ac448714897B113B5FB2cD6D79b6a5B9d
```

### Verifier (for auto-reveal)

The forms-runner lives in the ZKPoll verifier. Add to `verifier/.env`:
```
FHENIX_FORMS_ADDRESS=0x1796944Ac448714897B113B5FB2cD6D79b6a5B9d
```

Then start the verifier — forms-runner starts automatically alongside tally-runner.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Vite + React + TypeScript + Tailwind v4 |
| Wallet | wagmi + viem |
| FHE | `@cofhe/sdk/web` (Fhenix CoFHE SDK) |
| Contract | Solidity (Hardhat) — `FhenixForms.sol` |
| Chain | Arbitrum Sepolia (421614) |
| Decryption | Fhenix Threshold Network |
| Auto-reveal | `forms-runner.ts` in ZKPoll verifier |

---

## Contract functions

| Function | Caller | Description |
|---|---|---|
| `createForm` | Creator | Deploy form with questions, types, slot counts, label hashes |
| `submitResponse` | Respondent | Submit FHE-encrypted answers (flat `InEuint32[]` array) |
| `requestFormReveal` | Anyone (after close) | `FHE.allowPublic` per tally slot |
| `publishFormResult` | Forms runner | Verify Threshold Network sig + write plaintext |
| `getForm` | View | Form metadata (creator, questionCount, responseCount, revealed, endBlock) |
| `getQuestion` | View | Question type and slot count |
| `getRevealedTally` | View | Decrypted aggregate for a question×slot |
| `hasResponded` | View | Check if address already responded |

---

## Project structure

```
fhenix-forms/
├── src/
│   ├── pages/
│   │   ├── Landing.tsx       # Hero with split-flap animation + form mockup
│   │   ├── Dashboard.tsx     # List created forms, share links, view status
│   │   ├── FormBuilder.tsx   # Drag-and-drop question builder + deploy
│   │   ├── FormRespond.tsx   # Typeform-style one-per-screen answering
│   │   └── FormResults.tsx   # Bar charts with counts and percentages
│   ├── components/
│   │   └── Layout.tsx        # Shared navbar (matches landing)
│   └── lib/
│       └── contract.ts       # ABI + contract address
├── index.html
├── package.json
└── vite.config.ts
```

---

## Security

- Responses are FHE-encrypted in the browser — plaintext never touches the network
- Contract accumulates tallies homomorphically — individual answers mathematically impossible to extract
- `publishFormResult` verifies Threshold Network signature — results cannot be forged
- One response per address enforced on-chain
- `FHE.allowPublic` pattern (not `FHE.decrypt`) per Fhenix SDK v0.5+

---

## Tests

```bash
cd ../contracts && npx hardhat test test/FhenixForms.test.ts
# 8 passing
```

Covers: `createForm`, `submitResponse` accumulation, double-response rejection, `requestFormReveal`, `publishFormResult` with signature verification.
