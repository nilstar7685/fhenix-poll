# ZKPoll — Wave 4 Update

ZKPoll added anonymous surveys, simple polls, activity feed, and improved community management. Live on Arbitrum Sepolia.

**Contract:** `0xE663beAE94fc6eF11f8C37c866D439272dEE7e6c`
**Demo:** [fhenix-poll.vercel.app](fhenix-poll.vercel.app)

---

## What Was Delivered

### 1. Anonymous Surveys — FHE-Encrypted Multi-Question Forms

`createSurvey(pollId, communityId, credType, durationBlocks, questionCount, answerCounts[], labelHashes[])` registers questions on-chain with `SurveyQuestion` struct. Each question supports 2–10 answer options, up to 20 questions per survey.

`castSurveyVote` accepts a flat `InEuint32[]` array of encrypted 0/1 values (one per answer slot across all questions). The contract accumulates into `_surveyTallies[pollId][questionId][answerId]` — individual responses are never revealed. Only aggregate counts per answer are decrypted after close via `requestSurveyReveal` + `publishSurveyResult`.

Dedicated `CreateSurveyWizard` (3-step: Setup → Questions → Deploy) with dynamic question builder. Dedicated `SurveyDetail` voting page with per-question radio buttons. Results page shows per-question horizontal bar charts with counts and percentages.

### 2. Simple Polls — Single-Choice Voting

`createSimplePoll` creates a poll with `pollType=2`. `castSimpleVote` encrypts `[0,...,votingPower,...,0]` at the selected index. Reuses existing `_tallies` storage and `requestTallyReveal`/`publishTallyResult` flow unchanged.

Frontend shows radio button UI (no ranking, no hierarchy). Vote confirmation modal shows "Your Choice: [option]" instead of ranked list. My Votes shows green pill badge with selected option.

### 3. Poll Type System — `pollType` Enum

Replaced `isHierarchical` bool with `uint8 pollType` (0=RANKED, 1=HIERARCHICAL, 2=SIMPLE, 3=SURVEY). Backward compatible — `createPoll` passes 0, `createHierarchicalPoll` passes 1. Tally runner dispatches to correct reveal function based on poll type.

### 4. Activity Feed & Surveys Page

New `/activity` page showing recent poll/survey creation and completion events sorted by block number. New `/surveys` page with dedicated survey listing and "Create Survey" button. Both accessible from navbar.

### 5. Community Management Improvements

- **Created by Me / Joined** sections on communities page — fetches on-chain creator for legacy communities missing the field
- **Creator guardrail** in both CreatePollWizard and CreateSurveyWizard — shows red warning and blocks Continue if user is not the community creator (prevents failed transactions)
- **Quests removed** from UI (contract functions remain for future use)

### 6. Posts — Image Support

Posts now support image URLs with live preview in the creation modal. Images display in the post feed below the body text. Post creation accessible via community Posts tab with `+ Post` header button.

### 7. Zero-Vote Poll Handling

- Frontend `handleReveal` skips decryption for zero-ctHash options (prevents 403 errors)
- Friendly "No votes were cast" message instead of cryptic decrypt errors
- Results page shows clean empty state for zero-vote polls
- `allPublished` check fixed to not require non-zero counts

### 8. Tests — 46 Passing

New cases: `createSimplePoll` (pollType=2), `castSimpleVote` accumulation + double-vote rejection + full tally reveal, `createSurvey` (pollType=3, question registration), `castSurveyVote` accumulation + double-vote rejection, `requestSurveyReveal` + `publishSurveyResult` with Threshold Network signature verification.

---

## Future Waves

### Weighted Delegation
Credential holders delegate voting weight FHE-encrypted — observer sees delegation happened but not how much. Delegated weight stacks with delegate's own credential, enabling liquid democracy without exposing the delegation graph.

### Multi-Chain Credential Aggregation
Aggregate identity signals across chains in one attestation. Solana NFT holdings, Ethereum token balance, and Base transaction history feed into one `votingWeight`. Adds Solana RPC and cross-chain weight aggregation.

### Private Mid-Poll Snapshots
Poll creators request a private tally snapshot while the poll is open — decrypted only for the creator via FHE permit.

### On-Chain Community Governance
Community requirement configs stored on-chain as encrypted `euint8` arrays. Rules are private — a community can gate membership on criteria that aren't publicly known.
