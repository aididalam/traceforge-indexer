import type {
  RowDataPacket,
} from "mysql2";

import {
  config,
} from "./config.js";

import {
  createDb,
} from "./db.js";

interface Row
  extends RowDataPacket {}

const db =
  await createDb();

try {
  const scope = [
    config.chainId,
    config.contractAddress.toLowerCase(),
  ];

  const [registered] =
    await db.query<
      Row[]
    >(
      `
        SELECT
          semantic_kind,
          semantic_value,
          display_label,
          semantic_hash
        FROM semantic_registry
        WHERE chain_id = ?
          AND contract_address = ?
        ORDER BY
          semantic_kind,
          semantic_value
      `,
      scope,
    );

  const [coverage] =
    await db.query<
      Row[]
    >(
      `
        SELECT
          observed.semantic_kind AS semantic_kind,
          COUNT(*) AS observed,
          SUM(
            CASE
              WHEN r.semantic_hash IS NULL
                THEN 0
              ELSE 1
            END
          ) AS resolved,
          COUNT(*) -
          SUM(
            CASE
              WHEN r.semantic_hash IS NULL
                THEN 0
              ELSE 1
            END
          ) AS unresolved
        FROM (
          SELECT DISTINCT
            'entity_type' AS semantic_kind,
            entity_type AS semantic_hash
          FROM entities

          UNION ALL

          SELECT DISTINCT
            'state',
            current_state
          FROM entities

          UNION ALL

          SELECT DISTINCT
            'event_type',
            event_type
          FROM trace_events

          UNION ALL

          SELECT DISTINCT
            'link_type',
            link_type
          FROM entity_links
        ) observed

        LEFT JOIN semantic_registry r
          ON r.chain_id = ?
         AND r.contract_address = ?
         AND r.semantic_kind =
             observed.semantic_kind
         AND r.semantic_hash =
             observed.semantic_hash

        GROUP BY
          observed.semantic_kind

        ORDER BY
          observed.semantic_kind
      `,
      scope,
    );

  const [unresolved] =
    await db.query<
      Row[]
    >(
      `
        SELECT
          observed.semantic_kind,
          observed.semantic_hash
        FROM (
          SELECT DISTINCT
            'entity_type' AS semantic_kind,
            entity_type AS semantic_hash
          FROM entities

          UNION ALL

          SELECT DISTINCT
            'state',
            current_state
          FROM entities

          UNION ALL

          SELECT DISTINCT
            'event_type',
            event_type
          FROM trace_events

          UNION ALL

          SELECT DISTINCT
            'link_type',
            link_type
          FROM entity_links
        ) observed

        LEFT JOIN semantic_registry r
          ON r.chain_id = ?
         AND r.contract_address = ?
         AND r.semantic_kind =
             observed.semantic_kind
         AND r.semantic_hash =
             observed.semantic_hash

        WHERE r.semantic_hash IS NULL

        ORDER BY
          observed.semantic_kind,
          observed.semantic_hash
      `,
      scope,
    );

  console.log(
    "TraceForge Semantic Registry",
  );

  console.log(
    "============================",
  );

  console.log();
  console.log(
    "Registered semantics",
  );
  console.table(
    registered,
  );

  console.log();
  console.log(
    "Observed coverage",
  );
  console.table(
    coverage,
  );

  console.log();
  console.log(
    "Unresolved observed hashes",
  );

  if (
    unresolved.length ===
    0
  ) {
    console.log(
      "none",
    );
  } else {
    console.table(
      unresolved,
    );
  }
} finally {
  await db.end();
}
