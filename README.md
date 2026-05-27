# ZKPoll

[Privacy-preserving ranked-choice voting powered by Fully Homomorphic Encryption (FHE) on Fhenix](https://fhenix-poll.vercel.app) / Arbitrum Sepolia. Vote totals accumulate homomorphically under encryption — the plaintext is only revealed after the poll closes via the Threshold Network.

**Deployed contract (Arbitrum Sepolia):** `0xE663beAE94fc6eF11f8C37c866D439272dEE7e6c`

## How it works

| Step | Actor | Action |
|------|-------|--------|
| 1 | **Creator** | `registerCommunity()` → community + membership rules stored on-chain |
| 2 | **Voter** | Connects wallet / OAuth → Verifier checks requirements off-chain |
| 3 | **Verifier** | Returns EIP-712 attestation to voter |
| 4 | **Voter** | `issueCredential(attestation)` → credential + voting weight stored on-chain |
| 5 | **Creator** | `createPoll()`, `createSimplePoll()`, `createHierarchicalPoll()`, or `createSurvey()` → FHE tally slots on-chain |
| 6 | **Voter** | `castVote(FHE-encrypted weights)` / `castSimpleVote()` / `castSurveyVote()` → tally updated homomorphically |
| 7 | *(on-chain)* | Poll closes when `endBlock + 2` L1 blocks pass |
| 8 | **Verifier** | `requestTallyReveal()` or `requestSurveyReveal()` → `FHE.allowPublic` per option/answer |
| 9 | **Verifier** | `decryptForTx(ctHash)` per option against the **Threshold Network** |
| 10 | **Threshold Network** | Returns `plaintext + signature` |
| 11 | **Verifier** | `publishTallyResult(plaintext, sig)` or `publishSurveyResult()` → sig verified on-chain |
| 12 | **Voter** | Reads `revealedTallies` / `surveyRevealedTallies` directly from contract → **trustless result verification** |
| 13 | **Member** | `createPost(contentHash)` → IPFS content hash stored on-chain (gated) |

## Features

### Communities
- Create a community with name, description, logo, and credential type
- Define membership requirements with `AND`/`OR` group logic — mix token balance, NFT ownership, social follows, Discord roles, GitHub accounts, and more
- Community metadata pinned to IPFS via Pinata (required for persistence)
- Only the community creator can create polls

### Credentials
- Verifier checks requirements off-chain, returns an EIP-712 signed attestation
- Voter's wallet submits attestation to `issueCredential()` on-chain
- Credentials have an on-chain expiry block
- Credentials Hub shows per-community eligibility and lets users claim or renew

### Voting
- **Flat polls** — ranked-choice ballot, voters rank up to 32 options
- **Hierarchical polls** — options have sub-options (up to 4 levels deep, 8 per parent); option tree stored on-chain with `parentId` and `childCount`; sub-category rollup tallies computed on-chain via `rolledUpTallies`
- **Simple polls** — single-choice (pick exactly one option); radio button UI, `castSimpleVote()` encrypts `[0,...,votingPower,...,0]`
- Each ranking maps to an encrypted weight submitted to `castVote()` — the contract adds it homomorphically to the running FHE tally
- Double-vote prevention via on-chain mapping

### Surveys
- **Anonymous multi-question surveys** — each question has 2–10 answer options
- Responses are FHE-encrypted as `euint32(0/1)` per answer slot — individual responses are never revealed
- `createSurvey()` registers questions on-chain with `answerCounts[]` and `labelHashes[]`
- `castSurveyVote()` accumulates encrypted answers into `_surveyTallies[pollId][questionId][answerId]`
- `requestSurveyReveal()` + `publishSurveyResult()` — same Threshold Network pattern as polls
- Results page shows per-question bar charts with counts and percentages

### Tally & Results
- After poll closes, `requestTallyReveal()` calls `FHE.allowPublic` per option (no `FHE.decrypt` — new pattern)
- Tally runner calls `decryptForTx` off-chain, then `publishTallyResult` with Threshold Network signature
- Results page reads `revealedTallies` directly from the contract
- Hierarchical polls show nested tree results with `rolledUpTallies` for parent nodes
- Automated tally runner checks every 60 seconds; manual trigger via `POST /admin/tally/:pollId`

### Community Posts & Articles
- Credentialed members can publish articles (title + markdown body + cover image)
- Markdown editor with toolbar (bold, italic, headings, code, links, lists)
- Article cards with preview text, thumbnail, author, and reading time
- Full article view with rendered markdown
- Content stored on IPFS; `keccak256(CID)` stored on-chain via `createPost()`
- Gated communities require a valid credential to post

### Social Sharing
- Share buttons on poll/survey creation success (Twitter/X, Telegram, Copy Link)
- Share icon on every poll card — one-click copy link
- Mobile native share via Web Share API

### Poll Time Indicators
- Live countdown timer on poll cards (`2d 14h 32m`)
- Progress bar showing time elapsed vs total duration (green → amber → red)
- Pulsing red dot for polls closing within 24 hours
- "Closed Xm ago" with relative time instead of just "Closed"
- "Results ready" badge when tally is complete

### Voting power decay
```
Period 1: 100% → Period 2: 50% → Period 3: 25% → Period 4: 12.5% → Period 5: 6.25% → deactivated
```
`CountedVotes (CV) = EligibleVotes (EV) × VotingPower% (VP)`

## Project structure

```
zkpoll/
├── contracts/
│   └── contracts/FhenixPoll.sol   # registerCommunity, createPoll, createHierarchicalPoll,
│                                  # issueCredential, castVote, requestTallyReveal,
│                                  # publishTallyResult, createPost, createSimplePoll,
│                                  # castSimpleVote, createSurvey, castSurveyVote,
│                                  # requestSurveyReveal, publishSurveyResult
├── frontend/
│   └── src/
│       ├── pages/           # PollFeed, Surveys, Activity, CommunityFeed, CommunityDetail,
│       │                    # PollDetail, SurveyDetail, PollResults, PostDetail,
│       │                    # CredentialsHub, MyVotes, CommunityPosts
│       ├── components/      # CreateCommunityWizard, CreatePollWizard (flat + hierarchical + simple),
│       │                    # CreateSurveyWizard, CreatePostModal (markdown toolbar),
│       │                    # ShareButtons, VoteConfirmModal, PollCard (countdown + progress)
│       ├── hooks/           # useVoting, useCredentialHub, usePosts, useCofheClient, useWriteContract
│       └── lib/             # fhenix.ts, verifier.ts, cofhe.ts, decay.ts
├── verifier/
│   └── src/
│       ├── index.ts         # REST API (communities, polls, posts, OAuth, verify)
│       ├── posts.ts         # Pinata-backed post store
│       ├── tally.ts         # FHE tally + survey decryption (CoFHE SDK + viem)
│       ├── tally-runner.ts  # Background tally loop (60s interval, handles polls + surveys)
│       ├── oauth.ts         # Twitter, Discord, GitHub, Telegram OAuth
│       ├── issuer.ts        # EIP-712 credential attestation signing
│       └── checkers/        # Per-requirement-type check implementations
└── (no local storage — all data persists on IPFS via Pinata)
```

## Quick start

### Verifier
```bash
cd verifier
cp .env.example .env
# Fill in: VERIFIER_PRIVATE_KEY, FHENIX_CONTRACT_ADDRESS, DEPLOYMENT_L2_BLOCK
npm install && npm run dev
```

### Frontend
```bash
cd frontend
cp .env.example .env
# Set VITE_CONTRACT_ADDRESS and VITE_VERIFIER_URL
npm install && npm run dev
```

## Environment variables

### `frontend/.env`

| Variable | Description |
|---|---|
| `VITE_CONTRACT_ADDRESS` | Deployed FhenixPoll contract address |
| `VITE_VERIFIER_URL` | Verifier backend URL (default: `http://localhost:3001`) |
| `VITE_CHAIN_ID` | `421614` for Arbitrum Sepolia |
| `VITE_DEV_MODE` | `true` to use raw block counts for poll duration |

### `verifier/.env`

| Variable | Required | Description |
|---|---|---|
| `FHENIX_CONTRACT_ADDRESS` | Yes | Deployed FhenixPoll contract address |
| `VERIFIER_PRIVATE_KEY` | Yes | EVM private key — signs EIP-712 attestations + submits tally txs |
| `DEPLOYMENT_L2_BLOCK` | Yes | L2 block when contract was deployed (for efficient event scanning) |
| `FHENIX_RPC_URL` | No | RPC endpoint (default: Arbitrum Sepolia public RPC) |
| `ADMIN_SECRET` | No | Secret header for admin endpoints |
| `ALCHEMY_API_KEY` | EVM checks | Token balance, NFT, on-chain activity |
| `TWITTER_CLIENT_ID/SECRET` | X OAuth | X connect flow |
| `DISCORD_BOT_TOKEN` | Discord | Guild membership checks |
| `DISCORD_CLIENT_ID/SECRET` | Discord OAuth | Discord connect flow |
| `GITHUB_CLIENT_ID/SECRET` | GitHub OAuth | GitHub connect flow |
| `TELEGRAM_BOT_TOKEN/USERNAME` | Telegram | Widget auth |
| `PINATA_JWT` / `PINATA_GATEWAY` | **Required** | IPFS storage — all community/poll/post data persists on IPFS (no local files) |
| `APP_URL` | OAuth | Verifier's public URL for OAuth callbacks |

## Contract functions

| Function | Caller | Description |
|---|---|---|
| `registerCommunity` | Community creator | Register community on-chain |
| `createPoll` | Community creator | Create flat ranked-choice poll (2–32 options) |
| `createHierarchicalPoll` | Community creator | Create poll with on-chain option tree |
| `createSimplePoll` | Community creator | Create single-choice poll |
| `createSurvey` | Community creator | Create multi-question anonymous survey |
| `issueCredential` | Voter | Submit EIP-712 attestation to get credential |
| `castVote` | Voter | Submit FHE-encrypted per-option weights (ranked) |
| `castSimpleVote` | Voter | Submit FHE-encrypted single choice |
| `castSurveyVote` | Voter | Submit FHE-encrypted answers (flat 0/1 array) |
| `requestTallyReveal` | Anyone (after poll ends) | `FHE.allowPublic` per option |
| `publishTallyResult` | Tally runner | Verify Threshold Network sig + write plaintext |
| `requestSurveyReveal` | Anyone (after survey ends) | `FHE.allowPublic` per question×answer |
| `publishSurveyResult` | Tally runner | Verify sig + write survey answer count |
| `createPost` | Credentialed member | Post content hash on-chain |

## Security notes

- Vote totals accumulate homomorphically under FHE — plaintext never exposed until poll ends
- `msg.sender` (voter address) is public — privacy is about *what* you voted, not *that* you voted
- `publishTallyResult` verifies the Threshold Network's signature — results cannot be forged
- Survey responses are FHE-encrypted — individual answers are never revealed, only aggregate counts
- `FHE.allowPublic` (not `FHE.decrypt`) is the correct pattern per Fhenix SDK v0.5+
- Creator-only guardrail: only community creator can create polls/surveys (enforced on-chain + UI warning)
