# TraceForge Indexer

Open-source blockchain event indexer and MySQL read model for TraceForge.

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
