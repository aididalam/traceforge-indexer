import type {
  RowDataPacket,
} from "mysql2";

import {
  config,
} from "./config.js";

import {
  createDb,
} from "./db.js";

interface StatusRow
  extends RowDataPacket {}

const db =
  await createDb();

try {
  const [checkpoints] =
    await db.query<
      StatusRow[]
    >(
      `
        SELECT
          chain_id,
          contract_address,
          last_processed_block,
          updated_at
        FROM indexer_checkpoints
        ORDER BY chain_id
      `,
    );

  const [events] =
    await db.query<
      StatusRow[]
    >(
      `
        SELECT
          event_name,
          COUNT(*) AS total,
          MIN(block_number) AS first_block,
          MAX(block_number) AS last_block
        FROM chain_events
        WHERE chain_id = ?
          AND contract_address = ?
        GROUP BY event_name
        ORDER BY first_block, event_name
      `,
      [
        config.chainId,
        config.contractAddress.toLowerCase(),
      ],
    );

  const [totals] =
    await db.query<
      StatusRow[]
    >(
      `
        SELECT
          COUNT(*) AS total_events,
          MIN(block_number) AS first_block,
          MAX(block_number) AS last_block
        FROM chain_events
        WHERE chain_id = ?
          AND contract_address = ?
      `,
      [
        config.chainId,
        config.contractAddress.toLowerCase(),
      ],
    );

  console.log(
    "TraceForge Indexer Status",
  );

  console.log(
    "=========================",
  );

  console.log();
  console.log(
    "Checkpoint",
  );

  console.table(
    checkpoints,
  );

  console.log();
  console.log(
    "Events",
  );

  console.table(
    events,
  );

  console.log();
  console.log(
    "Totals",
  );

  console.table(
    totals,
  );
} finally {
  await db.end();
}
