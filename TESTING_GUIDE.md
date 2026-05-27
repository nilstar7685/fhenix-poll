# ZKPoll — Testing Guide

**Contract:** `FhenixPoll.sol` on Arbitrum Sepolia (`0xE663beAE94fc6eF11f8C37c866D439272dEE7e6c`)  
**Chain ID:** 421614 (Arbitrum Sepolia)

---

## Prerequisites

- MetaMask or any EVM wallet on Arbitrum Sepolia
- ~0.01 Arbitrum Sepolia ETH ([faucet](https://faucet.quicknode.com/arbitrum/sepolia))
- Node.js 18+

---

## Local Setup

### 1. Verifier
```bash
cd zkpoll/verifier
cp .env.example .env
# Required: VERIFIER_PRIVATE_KEY, FHENIX_CONTRACT_ADDRESS, DEPLOYMENT_L2_BLOCK
npm install && npm run dev
# → http://localhost:3001
```

### 2. Frontend
```bash
cd zkpoll/frontend
cp .env.example .env
# Set: VITE_CONTRACT_ADDRESS=0xE663beAE94fc6eF11f8C37c866D439272dEE7e6c
# Set: VITE_VERIFIER_URL=http://localhost:3001
npm install && npm run dev
# → http://localhost:5173
```

### 3. Unit tests
```bash
cd zkpoll/contracts && npx hardhat test
# 46 passing
```

---

## Feature Testing

### Community
1. Connect wallet → **Create Community**
2. Fill name, description, credential type (use **Open** for fastest testing)
3. Approve wallet tx → community appears in feed

### Credential (Open community)
1. Community page → **Get Credential** → **Verify**
2. Approve `issueCredential` tx
3. EV/VP%/CV panel appears

### Flat Poll
1. Community page → **+ Poll** → select **Flat** type
2. Duration: `1blk` (dev mode — closes in ~12s)
3. Add 3+ options → **Deploy** → approve tx

### Hierarchical Poll
1. **+ Poll** → select **Hierarchical** type
2. Add root options, click **+ Sub** to add children
3. Deploy → verify tree on-chain:
```bash
cast call 0xE663beAE94fc6eF11f8C37c866D439272dEE7e6c \
  "getPollOption(bytes32,uint8)((uint8,uint8,uint8,bytes32,bool))" \
  <POLL_ID> 3 --rpc-url https://sepolia-rollup.arbitrum.io/rpc
```

### Vote
1. Open poll → **Vote** tab → rank options → **Submit Vote**
2. Confirm modal shows all ranked options (including sub-options)
3. Approve tx → "Vote Submitted" screen

### Tally (automated)
Tally runner checks every 60s. After poll closes (~12s for 1blk):
```
[tally] requestTallyReveal confirmed: 0x...
[tally] option 0: published plaintext=1000000
[tally] Poll fully tallied.
```

**Manual reveal by poll creator (if auto-tally hasn't run yet):**
1. Navigate to the poll → **Results →**
2. Click **Reveal Tally** (only visible to poll creator, only after poll closes)
3. Two transactions fire automatically: `requestTallyReveal` then `publishTallyResult` × N
4. Results appear once all options are published

Manual trigger via admin endpoint:
```bash
curl -X POST http://localhost:3001/admin/tally/<POLL_ID> \
  -H "x-admin-secret: <ADMIN_SECRET>"
```

### Results
- Navigate to poll → **Results →**
- Flat poll: bar chart sorted by score
- Hierarchical poll: nested tree with parent rollup totals and "subtotal" badge

Verify on-chain:
```bash
cast call 0xE663beAE94fc6eF11f8C37c866D439272dEE7e6c \
  "getRevealedTally(bytes32,uint8)(uint32)" <POLL_ID> 0 \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc

# For hierarchical rollup:
cast call 0xE663beAE94fc6eF11f8C37c866D439272dEE7e6c \
  "rolledUpTallies(bytes32,uint8)(uint32)" <POLL_ID> 1 \
  --rpc-url https://sepolia-rollup.arbitrum.io/rpc
```

### Simple Poll
1. Community page → **+ Poll** → select **Simple Poll** type
2. Add 2+ options → **Deploy Simple Poll** → approve tx
3. Open poll → radio button UI → select one option → **Submit Vote**
4. Confirm modal shows "Your Choice: [selected option]"
5. My Votes shows green pill with selected option label

### Survey
1. Community page → **Surveys** tab → **+ Survey** (or `/create-survey`)
2. Add questions with 2+ answers each → **Deploy Survey** → approve tx
3. Open survey → answer each question (radio buttons per question) → **Submit Response**
4. Wait for tally runner (60s) or manual reveal
5. Results page shows per-question bar charts with counts and percentages

### Posts
1. Community page → **Posts** tab → **+ Post** (or open posts page)
2. Fill title, body, optional image URL (shows preview) → **Publish**
3. Post appears in feed with image displayed

---

## Common Issues

| Symptom | Fix |
|---|---|
| Tally reverts with no reason | Poll has no votes — tally runner skips it automatically |
| "FHE key error" on vote | Fhenix testnet node temporarily unavailable — retry in a few minutes |
| "No votes were cast" on reveal | Zero-vote poll — results page shows "No votes were cast" message |
| "Not a simple poll" / "Not a survey" | Wrong vote function called — UI handles this automatically |
| "You are not the creator" warning | Only community creator can create polls/surveys (on-chain enforced) |
| Results page stuck loading | Hard refresh; check browser console for errors |
| Old polls not tallying | Old contract data — restart verifier; it will skip polls not found on current contract |
| "Poll still open" revert | Tally runner waits `endBlock + 2` L1 blocks before attempting reveal |

---

## Arbiscan

- Contract: https://sepolia.arbiscan.io/address/0xE663beAE94fc6eF11f8C37c866D439272dEE7e6c
- Events: https://sepolia.arbiscan.io/address/0xE663beAE94fc6eF11f8C37c866D439272dEE7e6c#events

---

