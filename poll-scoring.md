# Poll Scoring Algorithms — Analysis & Comparison

## Current Implementation: MDCT 1/Rank (Harmonic Scoring)

ZKPoll currently uses **Modified Discrete Choice Theory with 1/rank weighting**:

```
weight(option) = floor(votingPower × (1,000,000 / rank)) / 1,000,000
```

- Rank 1 → 100% of voting power
- Rank 2 → 50%
- Rank 3 → 33.3%
- Rank 4 → 25%
- Rank N → 1/N

**Properties:**
- Strong first-preference signal (rank 1 gets 2× rank 2)
- Diminishing returns — lower ranks contribute less but still matter
- Integer-safe with 1e6 scaling (no floating point on-chain)
- Works well with FHE: each option gets a single `euint32` weight, accumulated via `FHE.add`

**Limitations:**
- Heavy top-bias: rank 1 dominates. A polarizing option ranked #1 by 40% and unranked by 60% can beat a consensus option ranked #2 by 90%.
- Not Condorcet-compliant (doesn't always elect the pairwise majority winner)

---

## Alternative Scoring Algorithms

### 1. Borda Count

```
weight(option) = (N - rank + 1) / N × votingPower
```

Where N = total options. Rank 1 gets N points, rank 2 gets N-1, etc.

| Rank (5 options) | Weight |
|------------------|--------|
| 1 | 100% |
| 2 | 80% |
| 3 | 60% |
| 4 | 40% |
| 5 | 20% |

**Pros:**
- More balanced — lower ranks still carry significant weight
- Favors consensus candidates (broadly acceptable options score higher)
- Simple linear formula, easy to compute client-side

**Cons:**
- Vulnerable to strategic "burying" (ranking a strong competitor last)
- Less differentiation between top preferences
- Unranked options problem: if voters don't rank all options, unranked = 0 points (penalizes less-known options)

**FHE compatibility:** ✅ Same as current — one `euint32` per option, `FHE.add` accumulation.

---

### 2. Quadratic Voting (QV)

```
cost(votes) = votes²
weight(option) = sqrt(credits_spent_on_option)
```

Each voter gets a fixed credit budget (e.g. 100 credits). They allocate credits across options. The weight contributed is `sqrt(credits)` — spending 4 credits gives weight 2, spending 9 gives weight 3.

| Credits spent | Effective weight |
|---------------|-----------------|
| 1 | 1.0 |
| 4 | 2.0 |
| 9 | 3.0 |
| 16 | 4.0 |
| 25 | 5.0 |

**Pros:**
- Measures intensity of preference (how much do you care?)
- Prevents tyranny of the majority — minorities who care deeply can concentrate credits
- Well-studied in mechanism design (Glen Weyl, RadicalxChange)
- Natural fit for multi-issue surveys

**Cons:**
- More complex UX (voters must understand credit allocation)
- `sqrt` is not natively available in FHE — must be computed client-side
- Harder to verify correctness on-chain (can't check `sum(credits) <= budget` under encryption without comparison ops)

**FHE compatibility:** ⚠️ Partial. Client computes `sqrt(credits)` and encrypts the result. Contract accumulates via `FHE.add`. But **budget enforcement** requires either:
- Trust the client (weak)
- Encrypt credits AND weights, use `FHE.mul` + `FHE.lte` to verify budget on-chain (expensive: ~N multiplications + comparisons per vote)
- Verifier validates before signing (medium trust)

---

### 3. Approval Voting

```
weight(option) = votingPower if approved, 0 otherwise
```

Voters approve/disapprove each option (binary). Every approved option gets full weight.

**Pros:**
- Simplest possible UX — check boxes
- Strongly favors consensus (option approved by most voters wins)
- No strategic ranking needed
- Minimal FHE cost: each option is `enc(1)` or `enc(0)`

**Cons:**
- No preference intensity — can't express "I strongly prefer A over B but approve both"
- Ties are common with few voters
- Doesn't capture nuanced preferences

**FHE compatibility:** ✅ Excellent. Same as survey mode — `euint32(0/1)` per option, `FHE.add`.

---

### 4. STAR Voting (Score Then Automatic Runoff)

Two phases:
1. **Score:** Voters rate each option 0–5 stars
2. **Runoff:** Top-2 scoring options enter a virtual runoff; each ballot counts as 1 vote for whichever of the two they scored higher

```
Phase 1: weight(option) = score (0-5) × (votingPower / 5)
Phase 2: automatic — compare top-2 scores per ballot
```

**Pros:**
- Captures preference intensity (scoring) AND majority preference (runoff)
- Resistant to strategic voting (scoring is expressive, runoff prevents score inflation from mattering)
- Considered one of the best single-winner methods by voting theorists

**Cons:**
- Phase 2 (runoff) requires comparing individual ballots — **incompatible with FHE aggregation**. Under FHE, individual ballots are never decrypted, so you can't determine which of the top-2 each voter preferred.
- Would require storing encrypted per-voter scores (not just aggregates) — massive storage cost

**FHE compatibility:** ❌ Phase 1 works (score accumulation). Phase 2 is fundamentally incompatible with privacy-preserving aggregation unless you decrypt individual ballots (defeats the purpose).

**Workaround:** Use Phase 1 only (pure score voting, 0–5 scale). This is sometimes called **Range Voting**.

---

### 5. Range Voting (Score Voting)

```
weight(option) = score × (votingPower / maxScore)
```

Voters assign a score (0–10 or 0–5) to each option independently.

| Score (0-5 scale) | Weight (1M voting power) |
|-------------------|--------------------------|
| 5 | 1,000,000 |
| 4 | 800,000 |
| 3 | 600,000 |
| 2 | 400,000 |
| 1 | 200,000 |
| 0 | 0 |

**Pros:**
- Maximum expressiveness — voters can score options independently
- No forced ranking (can give same score to multiple options)
- Simple aggregation: sum of scores per option
- Bayesian regret simulations show it outperforms most methods

**Cons:**
- Strategic incentive to min/max (give 5 to favorites, 0 to all others → degenerates to approval voting)
- More complex UI than simple choice

**FHE compatibility:** ✅ Excellent. Client encrypts `score × scaleFactor` per option. Contract accumulates via `FHE.add`. Same gas as ranked-choice.

---

### 6. Instant Runoff Voting (IRV / RCV)

Iterative elimination: remove lowest-scoring option, redistribute its votes to next preference, repeat until one option has majority.

**Pros:**
- Widely used in real elections (Australia, NYC, etc.)
- Guarantees majority winner
- Reduces spoiler effect

**Cons:**
- **Fundamentally incompatible with FHE aggregation.** IRV requires knowing individual ballot rankings to redistribute votes after elimination. Under FHE, individual ballots are encrypted and only aggregates are revealed.
- Would require N rounds of decryption (one per elimination) — each round reveals partial information

**FHE compatibility:** ❌ Cannot be implemented with privacy-preserving homomorphic aggregation.

---

### 7. Copeland's Method (Pairwise Comparison)

For each pair of options (A, B): count how many voters prefer A over B. Option with most pairwise wins is the Copeland winner.

**Pros:**
- Always selects the Condorcet winner if one exists
- Theoretically optimal for single-winner elections

**Cons:**
- Requires `O(N²)` pairwise tallies (N options → N×(N-1)/2 pairs)
- Each voter contributes to every pair — storage and gas scale quadratically
- With 8 options: 28 pairs × FHE ops per vote

**FHE compatibility:** ⚠️ Possible but expensive. For each pair (A,B), encrypt `1` if voter prefers A, `0` otherwise. Accumulate. Reveals pairwise counts after close. Gas: `O(N²)` FHE ops per vote.

---

## Comparison Matrix

| Algorithm | Expressiveness | Consensus bias | Strategic resistance | FHE compatible | Gas cost (8 opts) | UX complexity |
|-----------|---------------|----------------|---------------------|----------------|-------------------|---------------|
| **MDCT 1/Rank (current)** | High | Low | Medium | ✅ | 8 ops | Medium |
| Borda Count | High | High | Low | ✅ | 8 ops | Medium |
| Quadratic Voting | Very High | Medium | High | ⚠️ | 8+ ops | High |
| Approval Voting | Low | Very High | High | ✅ | 8 ops | Very Low |
| Range Voting (0–5) | Very High | Medium | Low | ✅ | 8 ops | Medium |
| STAR Voting | Very High | High | High | ❌ | N/A | Medium |
| IRV | High | Medium | Medium | ❌ | N/A | Medium |
| Copeland | Highest | Highest | Highest | ⚠️ | 28 ops | Medium |

---

## Recommendation

### Keep MDCT 1/Rank as default for ranked-choice polls
It's a good balance of expressiveness, FHE efficiency, and differentiation between preferences.

### Add as configurable scoring modes:

| Priority | Mode | Why |
|----------|------|-----|
| 1 | **Simple (single-choice)** | Most common use case, trivial to implement |
| 2 | **Approval** | Zero-cost addition (same as survey binary encoding) |
| 3 | **Range (0–5)** | Maximum expressiveness, same gas as ranked |
| 4 | **Borda** | Alternative ranked scoring for consensus-seeking communities |
| 5 | **Quadratic** | Advanced — requires verifier-side budget validation |

### Do NOT implement:
- **IRV** — fundamentally incompatible with FHE privacy model
- **STAR Phase 2** — requires individual ballot access
- **Copeland** — quadratic gas cost, overkill for most use cases

---

## Implementation Approach

All FHE-compatible algorithms share the same on-chain pattern:

```solidity
// Client computes weight per option based on chosen algorithm
// Contract just accumulates encrypted weights — algorithm-agnostic
euint32 encWeight = FHE.asEuint32(input);
_tallies[pollId][i] = FHE.add(_tallies[pollId][i], encWeight);
```

The scoring algorithm is a **client-side concern**. The contract doesn't need to know which algorithm was used — it just accumulates encrypted integers. This means:

1. Add a `scoringMode` field to poll metadata (stored on IPFS, not on-chain)
2. Frontend reads `scoringMode` and applies the correct weight formula before encryption
3. Contract remains unchanged — same `castVote` with `InEuint32[]`
4. Results page labels change based on `scoringMode` (e.g. "Score" vs "Rank weight")

**Exception:** Quadratic Voting needs budget enforcement. Options:
- **Option A (trust client):** Client computes `sqrt(credits)`, encrypts. No on-chain validation.
- **Option B (verifier validates):** Client sends plaintext credit allocation to verifier. Verifier checks `sum(credits) <= budget`, signs an attestation. Contract requires attestation before accepting vote.
- **Option C (on-chain FHE):** Encrypt credits, use `FHE.mul` to compute `credit²` per option, `FHE.add` all squared values, `FHE.lte(total, budget)` — expensive but trustless.

Recommend **Option B** for QV — fits existing verifier attestation pattern.
