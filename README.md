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
computing `keccak256` over the exact file bytes, matching the originating document bytes
hashing model.

```bash
npm run migrate
npm run documents:import -- /path/to/approved/documents
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

## Direct receipt protocol

`CustodyClaimed` appends an immutable `custody_claims` row and updates the product holder/version in event order. There is no pending transfer projection. Closed products remain in the read model. Independent business registration emits the existing identity/workspace events.

The checked-in ABI also includes `ProductRegistered`, `BatchReceived` and
`QuantityRemoved` from the activated 2026-10-06 quantity contract. Their typed
projections/migrations implement the
[batch upgrade](https://github.com/aididalam/traceforge/blob/main/docs/batch-quantity-plan.md).
The checked-in network configuration points to the active quantity contract,
`0xf286a8f7bbbe4e5f2337e1701524368794de5672`, from block 27861 on chain 9009.

For isolated tests or an explicit deployment configuration, `TRACEFORGE_CHAIN_ID`, `TRACEFORGE_CONTRACT_ADDRESS` and `TRACEFORGE_DEPLOYMENT_BLOCK` override the checked-in network defaults. Run `npm run public:sync` in the API after projecting to refresh explicitly opted-in public names/details.

## Quantity upgrade (Phase 3)

Migration `006_product_quantities.sql` adds deployment-scoped `product_quantities`,
`batch_routes` and `quantity_movements`. `ProductRegistered` creates the fixed
initial count and batch root. `BatchReceived` debits its source and creates a
child path. `QuantityRemoved` adjusts route/global balances and records the
reason text, evidence reference, actor and time. A batch's custodian is represented
by its available routes rather than one business ID.

Database checks enforce `initial = available + removed` and
`received = available + forwarded + removed`. Ordered projection also checks
source ownership, previous balance and version. Replay failures roll back both
derived rows and checkpoint updates; `project --rebuild` reconstructs balances
and parent routes from raw canonical logs.

Quantity tables and the `read-model-v2:<chainId>:<contractAddress>` checkpoint
include deployment identity. Legacy typed tables still use one deployment per
database, so the projector refuses mixed-deployment raw logs. Use a separate
read-model database for each deployment. An existing `read-model-v1` database
requires `npm run project:rebuild` after migration; incremental replay refuses
to silently reuse the old checkpoint. API migration 010 follows indexer migration
006. The Pi upgrade is activated using the fresh `traceforge_batch_20261006`
database, with all six indexer migrations applied. See the parent's
[Phase 6 activation](https://github.com/aididalam/traceforge/blob/main/docs/batch-activation-phase6.md).

`npm run read-model:status` includes quantity and route tables. `npm run history`
prints registration, receipt and removal amounts and explanations. Monitoring
uses the scoped v2 checkpoint. Big unsigned values are read as strings.

The parent/API disposable integration test verifies real batch transactions,
repeated projection, a full rebuild and atomic rejection of a corrupted removal
log. It performs no writes to Pi or the running database.
