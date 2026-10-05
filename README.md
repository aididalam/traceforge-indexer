# TraceForge Indexer

Open-source blockchain event indexer and MySQL read model for TraceForge.

## Parent project

This repository is the `indexer/` submodule of
[TraceForge](https://github.com/aididalam/traceforge).
See the parent repository for all components, architecture and setup.

## Current development network

- Chain ID: `9009`
- Contract configuration: `config/networks/9009.json`
- RPC configured with `TRACEFORGE_RPC_URL`
- MySQL configured with environment variables

## Setup

```bash
cp .env.example .env
npm install
```

Edit `.env` for your local environment.

## Commands

```bash
npm run typecheck
npm run check
npm run migrate
npm run backfill
npm run status
```

## Architecture

The indexer keeps two layers:

1. `chain_events`
   - canonical decoded contract event log
   - raw topics and data preserved
   - idempotent by chain / transaction / log index

2. typed read-model projections
   - tenants
   - organizations
   - wallets
   - memberships
   - roles and capabilities
   - entities
   - custody
   - relationships
   - trace history

The typed projection layer is derived from canonical `chain_events` and can be
rebuilt without changing blockchain state.

## Secrets

`.env` is local-only and ignored by Git.

Never commit private keys or production database credentials.

## Off-chain document registry

TraceForge stores hashes on-chain while full JSON metadata and evidence remain
off-chain.

The indexer can import JSON documents and verifies their content identity by
computing `keccak256` over the exact file bytes, matching the contract bootstrap
hashing model.

```bash
npm run migrate
npm run documents:import -- ../contracts/bootstrap
npm run documents:status
```

The registry is keyed by content hash, so current and historical read-model rows
can resolve full JSON documents without putting private business data on-chain.

## Semantic registry

TraceForge keeps business semantics dynamic while security invariants remain
fixed. Dynamic values such as entity types, states, event types, and link types
are bytes32 hashes on-chain.

The semantic registry maps verified string values to those hashes for human
readability without changing blockchain state.

```bash
npm run migrate
npm run semantics:import
npm run semantics:status
```

Semantic imports verify every configured value by recomputing
`keccak256(stringToHex(value))` and refusing mismatches.
