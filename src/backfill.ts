import {indexingHead,verifyCheckpoint} from './finality.js';
import type {
  Abi,
} from "viem";

import type {
  RowDataPacket,
} from "mysql2";

import {
  createPublicClient,
  decodeEventLog,
  http,
} from "viem";

import {
  readFileSync,
} from "node:fs";

import {
  config,
} from "./config.js";
import {chainTransport} from './chain-transport.js';

import {
  createDb,
} from "./db.js";

interface CheckpointRow
  extends RowDataPacket {
  last_processed_block:
    string | number;
  last_processed_hash: string|null;
}

const abi =
  JSON.parse(
    readFileSync(
      new URL(
        "../abi/TraceForge.abi.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as Abi;

function jsonValue(
  value: unknown,
): string {
  return JSON.stringify(
    value,
    (
      _key,
      current,
    ) => {
      if (
        typeof current ===
        "bigint"
      ) {
        return current.toString();
      }

      return current;
    },
  );
}

const client =
  createPublicClient({
    transport: chainTransport(),
  });

const actualChainId =
  await client.getChainId();

if (
  actualChainId !==
  config.chainId
) {
  throw new Error(
    `Wrong chain: expected ${config.chainId}, got ${actualChainId}`,
  );
}

const code =
  await client.getCode({
    address:
      config.contractAddress,
  });

if (
  !code ||
  code === "0x"
) {
  throw new Error(
    "TraceForge contract code is missing.",
  );
}

const {head,safeHead}=await indexingHead(client,config.confirmations);

const db =
  await createDb();

try {
  const [checkpointRows] =
    await db.execute<
      CheckpointRow[]
    >(
      `
        SELECT last_processed_block,last_processed_hash
        FROM indexer_checkpoints
        WHERE chain_id = ?
          AND contract_address = ?
      `,
      [
        config.chainId,
        config.contractAddress.toLowerCase(),
      ],
    );

  await verifyCheckpoint(client,checkpointRows[0]);
  let fromBlock =
    config.deploymentBlock;

  if (
    checkpointRows.length >
    0
  ) {
    fromBlock =
      BigInt(
        checkpointRows[0]
          .last_processed_block,
      ) + 1n;
  }

  console.log(
    "TraceForge Historical Backfill",
  );

  console.log(
    "==============================",
  );

  console.log();

  console.log(
    `Chain ID:         ${config.chainId}`,
  );

  console.log(
    `Contract:         ${config.contractAddress}`,
  );

  console.log(
    `Deployment block: ${config.deploymentBlock}`,
  );

  console.log(
    `Current head:     ${head}`,
  );

  console.log(
    `Safe head:        ${safeHead}`,
  );

  console.log(
    `Start block:      ${fromBlock}`,
  );

  if (
    fromBlock >
    safeHead
  ) {
    console.log();
    console.log(
      "Indexer is already caught up.",
    );

    // Fall through so the outer finally block closes the DB cleanly.
  }

  let totalEvents =
    0;

  while (
    fromBlock <=
    safeHead
  ) {
    const candidateTo =
      fromBlock +
      config.chunkSize -
      1n;

    const toBlock =
      candidateTo >
      safeHead
        ? safeHead
        : candidateTo;

    const logs =
      await client.getLogs({
        address:
          config.contractAddress,

        fromBlock,
        toBlock,
      });

    const checkpointHash=process.env.TRACEFORGE_NETWORK_KIND==='public'?(await client.getBlock({blockNumber:toBlock})).hash:null;
    await db.beginTransaction();

    try {
      for (
        const log of logs
      ) {
        if (
          log.blockNumber ===
            null ||
          log.blockHash ===
            null ||
          log.transactionHash ===
            null ||
          log.transactionIndex ===
            null ||
          log.logIndex ===
            null
        ) {
          throw new Error(
            "Canonical log fields are missing.",
          );
        }

        const decoded =
          decodeEventLog({
            abi,

            topics:
              log.topics,

            data:
              log.data,

            strict:
              true,
          });

        await db.query(
          `
            INSERT IGNORE INTO chain_events (
              chain_id,
              contract_address,
              block_number,
              block_hash,
              transaction_hash,
              transaction_index,
              log_index,
              topics,
              data,
              event_name,
              event_args
            )
            VALUES (
              ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?
            )
          `,
          [
            config.chainId,

            config.contractAddress
              .toLowerCase(),

            log.blockNumber
              .toString(),

            log.blockHash,

            log.transactionHash,

            log.transactionIndex,

            log.logIndex,

            jsonValue(
              log.topics,
            ),

            log.data,

            decoded.eventName,

            jsonValue(
              decoded.args,
            ),
          ],
        );
      }

      await db.execute(
        `
          INSERT INTO indexer_checkpoints (
            chain_id,
            contract_address,
            last_processed_block,last_processed_hash
          )
          VALUES (?, ?, ?, ?)

          ON DUPLICATE KEY UPDATE
            last_processed_block =
              ?,last_processed_hash=?
        `,
        [
          config.chainId,

          config.contractAddress
            .toLowerCase(),

          toBlock.toString(),checkpointHash,

          toBlock.toString(),checkpointHash,
        ],
      );

      await db.commit();
    } catch (
      error
    ) {
      await db.rollback();

      throw error;
    }

    totalEvents +=
      logs.length;

    console.log(
      `${fromBlock} -> ${toBlock}: ${logs.length} event(s)`,
    );

    fromBlock =
      toBlock + 1n;
  }

  console.log();
  console.log(
    `BACKFILL COMPLETE. ${totalEvents} event(s) processed.`,
  );
} finally {
  await db.end();
}
