ZKPoll is a production-grade confidential voting protocol built using Fhenix CoFHE, deployed on Arbitrum Sepolia.

Contract: https://sepolia.arbiscan.io/address/0xd9836FA54D71c2745A26dABa48551E9745983676
Demo: https://fhenix-poll.vercel.app

What was delivered:

Core Smart Contract (FhenixPoll)
  - Manages full lifecycle: community → credential → vote → tally
  - Supports open, gated, and multi-gate communities
  - Community configs stored on IPFS and restored by verifier
  - Credential issuance via EIP-712 signed attestations
  - Includes voting weight (scaled), expiry, nonce + nullifier protection (anti-sybil + replay)

Fully Encrypted Voting (FHE)
  - Votes submitted as encrypted weights (no plaintext ever on-chain)
  - Ranked-choice scoring using 1/rank logic
  - Homomorphic aggregation using FHE (votes counted without decryption)
  - One vote per user enforced
  - Expired credentials rejected at vote time

Secure Tally Reveal
  - Anyone can trigger tally after poll ends
  - Uses Threshold Network for decryption
  - Results verified on-chain via cryptographic signatures
  - Prevents tampering or forged results

Verifier Backend (Node.js)
  - Handles credential issuance and requirement checks
  - Supports 11 requirement types:
      - Token balance, NFT ownership, on-chain activity
      - ENS/domain ownership
      - Twitter, Discord, GitHub, Telegram (OAuth based)
  - AND/OR logic for flexible gating
  - Temporary session storage (2-hour TTL) for secure verification

Automated Tally Runner
  - Runs every 60 seconds
  - Detects ended polls → requests decryption → publishes results
  - Can also be triggered manually via admin endpoint

React Frontend (Vite + Tailwind)
  - Community creation + IPFS config
  - Credential claim flow with OAuth + wallet
  - Encrypted voting (client-side using @cofhe/react)
  - Hierarchical ranked-choice voting (multi-level, up to 8 options)
  - Real-time voting power visualization
  - Trustless result display directly from contract

Developer Mode
  - Fast testing with short poll durations (1–10 blocks)
  - Full E2E testing in under a minute

Testing (24 tests passing)
  - Covers credential validation, replay protection
  - Voting logic and double-vote prevention
  - Tally reveal conditions and signature verification
  - Full end-to-end flow

Privacy Model:
“Who voted” is public
“How they voted” is fully private
Votes remain encrypted until final tally
Results are verifiable and tamper-proof

ZKPoll delivers a complete, real-world implementation of private, verifiable, and scalable on-chain voting using fully homomorphic encryption.
