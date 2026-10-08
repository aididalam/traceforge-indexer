import "dotenv/config";
import {secret} from './secrets.js';

import {
  readFileSync,
} from "node:fs";

import type {
  Address,
} from "viem";

function required(
  name: string,
): string {
  const value =
    process.env[name];

  if (!value) {
    throw new Error(
      `Missing environment variable: ${name}`,
    );
  }

  return value;
}

const network =
  JSON.parse(
    readFileSync(
      new URL(
        "../config/networks/9009.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );

export const config = {
  rpcUrl:
    required(
      "TRACEFORGE_RPC_URL",
    ),

  chainId:
    Number(
      process.env.TRACEFORGE_CHAIN_ID ?? network.chainId,
    ),

  contractAddress:
    (process.env.TRACEFORGE_CONTRACT_ADDRESS ?? network.contractAddress) as Address,

  deploymentBlock:
    BigInt(
      process.env.TRACEFORGE_DEPLOYMENT_BLOCK ?? network.deploymentBlock,
    ),

  mysql: {
    host:
      required(
        "MYSQL_HOST",
      ),

    port:
      Number(
        required(
          "MYSQL_PORT",
        ),
      ),

    database:
      required(
        "MYSQL_DATABASE",
      ),

    user:
      required(
        "MYSQL_USER",
      ),

    password:
      secret('MYSQL_PASSWORD') ?? required('MYSQL_PASSWORD'),
  },

  chunkSize:
    BigInt(
      process.env.INDEXER_CHUNK_SIZE ??
        "500",
    ),

  confirmations:
    BigInt(
      process.env.INDEXER_CONFIRMATIONS ??
        "1",
    ),
};
