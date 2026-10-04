import type {
  RowDataPacket,
} from "mysql2";

import {
  createDb,
} from "./db.js";

interface Row
  extends RowDataPacket {}

const db =
  await createDb();

try {
  const [byKind] =
    await db.query<
      Row[]
    >(
      `
        SELECT
          document_kind,
          COUNT(*) AS total
        FROM offchain_documents
        GROUP BY document_kind
        ORDER BY document_kind
      `,
    );

  const [currentMetadata] =
    await db.query<
      Row[]
    >(
      `
        SELECT
          source_type,
          total,
          resolved,
          total - resolved AS unresolved
        FROM (
          SELECT
            'tenant' AS source_type,
            COUNT(*) AS total,
            SUM(
              CASE
                WHEN d.content_hash IS NULL
                  THEN 0
                ELSE 1
              END
            ) AS resolved
          FROM tenants t
          LEFT JOIN offchain_documents d
            ON d.content_hash =
               t.metadata_hash

          UNION ALL

          SELECT
            'organization',
            COUNT(*),
            SUM(
              CASE
                WHEN d.content_hash IS NULL
                  THEN 0
                ELSE 1
              END
            )
          FROM organizations o
          LEFT JOIN offchain_documents d
            ON d.content_hash =
               o.metadata_hash

          UNION ALL

          SELECT
            'role',
            COUNT(*),
            SUM(
              CASE
                WHEN d.content_hash IS NULL
                  THEN 0
                ELSE 1
              END
            )
          FROM roles r
          LEFT JOIN offchain_documents d
            ON d.content_hash =
               r.metadata_hash

          UNION ALL

          SELECT
            'entity-current',
            COUNT(*),
            SUM(
              CASE
                WHEN d.content_hash IS NULL
                  THEN 0
                ELSE 1
              END
            )
          FROM entities e
          LEFT JOIN offchain_documents d
            ON d.content_hash =
               e.metadata_hash
        ) x
      `,
    );

  const [history] =
    await db.query<
      Row[]
    >(
      `
        SELECT
          'trace-metadata' AS source_type,
          COUNT(*) AS total,
          SUM(
            CASE
              WHEN d.content_hash IS NULL
                THEN 0
              ELSE 1
            END
          ) AS resolved,
          COUNT(*) -
          SUM(
            CASE
              WHEN d.content_hash IS NULL
                THEN 0
              ELSE 1
            END
          ) AS unresolved
        FROM trace_events t
        LEFT JOIN offchain_documents d
          ON d.content_hash =
             t.metadata_hash_after

        UNION ALL

        SELECT
          'trace-evidence',
          COUNT(*),
          SUM(
            CASE
              WHEN d.content_hash IS NULL
                THEN 0
              ELSE 1
            END
          ),
          COUNT(*) -
          SUM(
            CASE
              WHEN d.content_hash IS NULL
                THEN 0
              ELSE 1
            END
          )
        FROM trace_events t
        LEFT JOIN offchain_documents d
          ON d.content_hash =
             t.evidence_hash
      `,
    );

  console.log(
    "TraceForge Off-chain Document Status",
  );

  console.log(
    "====================================",
  );

  console.log();
  console.log(
    "Documents by kind",
  );
  console.table(
    byKind,
  );

  console.log();
  console.log(
    "Current metadata resolution",
  );
  console.table(
    currentMetadata,
  );

  console.log();
  console.log(
    "Historical trace resolution",
  );
  console.table(
    history,
  );
} finally {
  await db.end();
}
