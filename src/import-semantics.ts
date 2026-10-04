import {
  readFile,
} from "node:fs/promises";

import {
  resolve,
} from "node:path";

import {
  keccak256,
  stringToHex,
} from "viem";

import {
  config,
} from "./config.js";

import {
  createDb,
} from "./db.js";

interface SemanticEntry {
  kind: string;
  value: string;
  hash: string;
  label: string;
}

interface SemanticFile {
  schemaVersion: number;
  chainId: number;
  contractAddress: string;
  semantics: SemanticEntry[];
}

const input =
  process.argv[2] ??
  "config/semantics/9009.json";

const absolute =
  resolve(
    input,
  );

const parsed =
  JSON.parse(
    await readFile(
      absolute,
      "utf8",
    ),
  ) as SemanticFile;

if (
  parsed.schemaVersion !==
  1
) {
  throw new Error(
    `Unsupported semantic schema version: ${parsed.schemaVersion}`,
  );
}

if (
  parsed.chainId !==
  config.chainId
) {
  throw new Error(
    `Semantic file chain mismatch: expected ${config.chainId}, got ${parsed.chainId}`,
  );
}

if (
  parsed.contractAddress.toLowerCase() !==
  config.contractAddress.toLowerCase()
) {
  throw new Error(
    "Semantic file contract address does not match indexer config.",
  );
}

const db =
  await createDb();

try {
  await db.beginTransaction();

  for (
    const entry of parsed.semantics
  ) {
    if (
      !entry.kind ||
      !entry.value ||
      !entry.label
    ) {
      throw new Error(
        "Semantic entries require kind, value, and label.",
      );
    }

    const computed =
      keccak256(
        stringToHex(
          entry.value,
        ),
      );

    if (
      computed.toLowerCase() !==
      entry.hash.toLowerCase()
    ) {
      throw new Error(
        [
          `Semantic hash mismatch for ${entry.kind}:${entry.value}`,
          `expected ${entry.hash}`,
          `computed ${computed}`,
        ].join("\n"),
      );
    }

    await db.query(
      `
        INSERT INTO semantic_registry (
          chain_id,
          contract_address,
          semantic_kind,
          semantic_hash,
          semantic_value,
          display_label,
          source_ref
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)

        ON DUPLICATE KEY UPDATE
          semantic_value =
            VALUES(semantic_value),
          display_label =
            VALUES(display_label),
          source_ref =
            VALUES(source_ref),
          updated_at =
            CURRENT_TIMESTAMP
      `,
      [
        config.chainId,
        config.contractAddress.toLowerCase(),
        entry.kind,
        entry.hash.toLowerCase(),
        entry.value,
        entry.label,
        input,
      ],
    );

    console.log(
      `${entry.kind.padEnd(12)} ${entry.value.padEnd(16)} ${entry.hash}`,
    );
  }

  await db.commit();

  console.log();
  console.log(
    `Imported ${parsed.semantics.length} semantic definition(s).`,
  );
} catch (
  error
) {
  await db.rollback();

  throw error;
} finally {
  await db.end();
}
