import type {
  RowDataPacket,
} from "mysql2";

import {
  createPublicClient,
  http,
} from "viem";

import {
  config,
} from "./config.js";

import {
  createDb,
} from "./db.js";

interface IndexerCheckpointRow
  extends RowDataPacket {
  last_processed_block:
    string | number;
}

interface ProjectionCheckpointRow
  extends RowDataPacket {
  last_event_id:
    string | number;
}

interface MaxEventRow
  extends RowDataPacket {
  max_event_id:
    string | number | null;
}

function threshold(
  name: string,
  fallback: string,
): bigint {
  const raw =
    process.env[name] ??
    fallback;

  if (
    !/^[0-9]+$/.test(
      raw
    )
  ) {
    throw new Error(
      name +
      " must be a non-negative integer."
    );
  }

  return BigInt(
    raw
  );
}

const maxBlockLag =
  threshold(
    "INDEXER_MAX_BLOCK_LAG",
    "30",
  );

const maxEventLag =
  threshold(
    "INDEXER_MAX_EVENT_LAG",
    "5",
  );

const client =
  createPublicClient({
    transport:
      http(
        config.rpcUrl,
      ),
  });

const actualChainId =
  await client.getChainId();

if (
  actualChainId !==
  config.chainId
) {
  throw new Error(
    "Wrong chain: expected " +
    config.chainId +
    ", got " +
    actualChainId
  );
}

const head =
  await client.getBlockNumber();

const safeHead =
  head >
  config.confirmations
    ? head -
      config.confirmations
    : 0n;

const db =
  await createDb();

try {
  const [checkpointRows] =
    await db.execute<
      IndexerCheckpointRow[]
    >(
      `
        SELECT
          last_processed_block
        FROM indexer_checkpoints
        WHERE chain_id = ?
          AND contract_address = ?
      `,
      [
        config.chainId,
        config.contractAddress
          .toLowerCase(),
      ],
    );

  if (
    checkpointRows.length !==
    1
  ) {
    throw new Error(
      "Expected exactly one indexer checkpoint."
    );
  }

  const indexedBlock =
    BigInt(
      checkpointRows[0]
        .last_processed_block
    );

  const blockLag =
    safeHead >
    indexedBlock
      ? safeHead -
        indexedBlock
      : 0n;

  const [eventRows] =
    await db.execute<
      MaxEventRow[]
    >(
      `
        SELECT
          MAX(id) AS max_event_id
        FROM chain_events
        WHERE chain_id = ?
          AND contract_address = ?
      `,
      [
        config.chainId,
        config.contractAddress
          .toLowerCase(),
      ],
    );

  const maxEventId =
    eventRows[0]
      ?.max_event_id ===
    null
      ? 0n
      : BigInt(
          eventRows[0]
            ?.max_event_id ??
          0
        );

  const [projectionRows] =
    await db.execute<
      ProjectionCheckpointRow[]
    >(
      `
        SELECT
          last_event_id
        FROM projection_checkpoints
        WHERE projector_name = ?
      `,
      [
        `read-model-v2:${config.chainId}:${config.contractAddress.toLowerCase()}`,
      ],
    );

  if (
    projectionRows.length !==
    1
  ) {
    throw new Error(
      "Expected exactly one read-model projection checkpoint."
    );
  }

  const projectedEventId =
    BigInt(
      projectionRows[0]
        .last_event_id
    );

  const eventLag =
    maxEventId >
    projectedEventId
      ? maxEventId -
        projectedEventId
      : 0n;

  const ok =
    blockLag <=
      maxBlockLag &&
    eventLag <=
      maxEventLag;

  console.log(
    JSON.stringify(
      {
        ok,
        chainId:
          config.chainId,

        head:
          head.toString(),

        safeHead:
          safeHead.toString(),

        indexedBlock:
          indexedBlock.toString(),

        blockLag:
          blockLag.toString(),

        maxBlockLag:
          maxBlockLag.toString(),

        maxEventId:
          maxEventId.toString(),

        projectedEventId:
          projectedEventId
            .toString(),

        eventLag:
          eventLag.toString(),

        maxEventLag:
          maxEventLag.toString(),
      }
    )
  );

  if (
    !ok
  ) {
    process.exitCode =
      1;
  }
} finally {
  await db.end();
}
