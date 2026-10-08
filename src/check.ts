import {
  createPublicClient,
  http,
} from "viem";

import mysql from "mysql2/promise";

import {
  config,
} from "./config.js";
import {chainTransport} from './chain-transport.js';

console.log(
  "TraceForge Indexer Environment Check",
);

console.log(
  "====================================",
);

console.log();

const db =
  await mysql.createConnection({
    host:
      config.mysql.host,

    port:
      config.mysql.port,

    database:
      config.mysql.database,

    user:
      config.mysql.user,

    password:
      config.mysql.password,
  });

try {
  const [rows] =
    await db.query(`
      SELECT
        VERSION() AS mysqlVersion,
        DATABASE() AS currentDatabase,
        CURRENT_USER() AS authenticatedAs
    `);

  const row =
    (
      rows as Array<Record<string, unknown>>
    )[0];

  console.log(
    "MySQL",
  );

  console.log(
    `  version:      ${row.mysqlVersion}`,
  );

  console.log(
    `  database:     ${row.currentDatabase}`,
  );

  console.log(
    `  authenticated:${row.authenticatedAs}`,
  );
} finally {
  await db.end();
}

const publicClient =
  createPublicClient({
    transport: chainTransport(),
  });

const chainId =
  await publicClient.getChainId();

if (
  chainId !==
  config.chainId
) {
  throw new Error(
    `Wrong chain: expected ${config.chainId}, got ${chainId}`,
  );
}

const blockNumber =
  await publicClient.getBlockNumber();

const code =
  await publicClient.getCode({
    address:
      config.contractAddress,
  });

if (
  !code ||
  code === "0x"
) {
  throw new Error(
    "TraceForge contract code not found.",
  );
}

console.log();

console.log(
  "Besu",
);

console.log(
  `  chainId:      ${chainId}`,
);

console.log(
  `  latest block: ${blockNumber}`,
);

console.log(
  `  contract:     ${config.contractAddress}`,
);

console.log(
  `  deploy block: ${config.deploymentBlock}`,
);

console.log(
  `  code present: true`,
);

console.log();

console.log(
  "PASS: indexer environment is ready.",
);
