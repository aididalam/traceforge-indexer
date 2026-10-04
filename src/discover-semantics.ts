import {
  readFile,
  writeFile,
} from "node:fs/promises";

import type {
  RowDataPacket,
} from "mysql2";

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

interface CandidateRow
  extends RowDataPacket {
  semantic_kind: string;
  semantic_hash: string;
  candidate_value: string;
}

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

const semanticFile =
  "config/semantics/9009.json";

const write =
  process.argv.includes(
    "--write",
  );

function labelFor(
  value: string,
): string {
  return value
    .toLowerCase()
    .split("_")
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1),
    )
    .join(" ");
}

function keyFor(
  kind: string,
  hash: string,
): string {
  return `${kind}:${hash.toLowerCase()}`;
}

const parsed =
  JSON.parse(
    await readFile(
      semanticFile,
      "utf8",
    ),
  ) as SemanticFile;

if (
  parsed.chainId !==
  config.chainId
) {
  throw new Error(
    `Semantic config chain mismatch: expected ${config.chainId}, got ${parsed.chainId}`,
  );
}

if (
  parsed.contractAddress.toLowerCase() !==
  config.contractAddress.toLowerCase()
) {
  throw new Error(
    "Semantic config contract address does not match indexer config.",
  );
}

const db =
  await createDb();

let candidateRows:
  CandidateRow[] = [];

try {
  const [rows] =
    await db.query<
      CandidateRow[]
    >(
      `
        SELECT DISTINCT
          'event_type' AS semantic_kind,
          JSON_UNQUOTE(
            JSON_EXTRACT(
              ce.event_args,
              '$.eventType'
            )
          ) AS semantic_hash,
          JSON_UNQUOTE(
            JSON_EXTRACT(
              d.document_json,
              '$.event'
            )
          ) AS candidate_value
        FROM chain_events ce
        JOIN offchain_documents d
          ON d.content_hash =
             JSON_UNQUOTE(
               JSON_EXTRACT(
                 ce.event_args,
                 '$.evidenceHash'
               )
             )
        WHERE ce.chain_id = ?
          AND ce.contract_address = ?
          AND JSON_EXTRACT(
                ce.event_args,
                '$.eventType'
              ) IS NOT NULL
          AND JSON_EXTRACT(
                d.document_json,
                '$.event'
              ) IS NOT NULL

        UNION ALL

        SELECT DISTINCT
          'entity_type',
          e.entity_type,
          JSON_UNQUOTE(
            JSON_EXTRACT(
              d.document_json,
              '$.entityType'
            )
          )
        FROM entities e
        JOIN offchain_documents d
          ON d.content_hash =
             e.metadata_hash
        WHERE JSON_EXTRACT(
                d.document_json,
                '$.entityType'
              ) IS NOT NULL

        UNION ALL

        SELECT DISTINCT
          'state',
          JSON_UNQUOTE(
            JSON_EXTRACT(
              ce.event_args,
              '$.initialState'
            )
          ),
          JSON_UNQUOTE(
            JSON_EXTRACT(
              d.document_json,
              '$.initialState'
            )
          )
        FROM chain_events ce
        JOIN offchain_documents d
          ON d.content_hash =
             JSON_UNQUOTE(
               JSON_EXTRACT(
                 ce.event_args,
                 '$.metadataHash'
               )
             )
        WHERE ce.chain_id = ?
          AND ce.contract_address = ?
          AND ce.event_name =
              'EntityCreated'
          AND JSON_EXTRACT(
                d.document_json,
                '$.initialState'
              ) IS NOT NULL

        UNION ALL

        SELECT DISTINCT
          'state',
          JSON_UNQUOTE(
            JSON_EXTRACT(
              ce.event_args,
              '$.stateAfter'
            )
          ),
          JSON_UNQUOTE(
            JSON_EXTRACT(
              d.document_json,
              '$.toState'
            )
          )
        FROM chain_events ce
        JOIN offchain_documents d
          ON d.content_hash =
             JSON_UNQUOTE(
               JSON_EXTRACT(
                 ce.event_args,
                 '$.evidenceHash'
               )
             )
        WHERE ce.chain_id = ?
          AND ce.contract_address = ?
          AND JSON_EXTRACT(
                ce.event_args,
                '$.stateAfter'
              ) IS NOT NULL
          AND JSON_EXTRACT(
                d.document_json,
                '$.toState'
              ) IS NOT NULL

        UNION ALL

        SELECT DISTINCT
          'link_type',
          JSON_UNQUOTE(
            JSON_EXTRACT(
              ce.event_args,
              '$.linkType'
            )
          ),
          JSON_UNQUOTE(
            JSON_EXTRACT(
              d.document_json,
              '$.linkType'
            )
          )
        FROM chain_events ce
        JOIN offchain_documents d
          ON d.content_hash =
             JSON_UNQUOTE(
               JSON_EXTRACT(
                 ce.event_args,
                 '$.evidenceHash'
               )
             )
        WHERE ce.chain_id = ?
          AND ce.contract_address = ?
          AND JSON_EXTRACT(
                ce.event_args,
                '$.linkType'
              ) IS NOT NULL
          AND JSON_EXTRACT(
                d.document_json,
                '$.linkType'
              ) IS NOT NULL
      `,
      [
        config.chainId,
        config.contractAddress.toLowerCase(),

        config.chainId,
        config.contractAddress.toLowerCase(),

        config.chainId,
        config.contractAddress.toLowerCase(),

        config.chainId,
        config.contractAddress.toLowerCase(),
      ],
    );

  candidateRows =
    rows;
} finally {
  await db.end();
}

const verified =
  new Map<
    string,
    SemanticEntry
  >();

const rejected: {
  kind: string;
  value: string;
  expected: string;
  computed: string;
}[] = [];

for (
  const row of candidateRows
) {
  if (
    !row.semantic_kind ||
    !row.semantic_hash ||
    !row.candidate_value
  ) {
    continue;
  }

  const computed =
    keccak256(
      stringToHex(
        row.candidate_value,
      ),
    );

  if (
    computed.toLowerCase() !==
    row.semantic_hash.toLowerCase()
  ) {
    rejected.push({
      kind:
        row.semantic_kind,
      value:
        row.candidate_value,
      expected:
        row.semantic_hash,
      computed,
    });

    continue;
  }

  const key =
    keyFor(
      row.semantic_kind,
      row.semantic_hash,
    );

  const existing =
    verified.get(
      key,
    );

  if (
    existing &&
    existing.value !==
      row.candidate_value
  ) {
    throw new Error(
      `Conflicting verified values for ${key}: ${existing.value} vs ${row.candidate_value}`,
    );
  }

  verified.set(
    key,
    {
      kind:
        row.semantic_kind,
      value:
        row.candidate_value,
      hash:
        row.semantic_hash.toLowerCase(),
      label:
        labelFor(
          row.candidate_value,
        ),
    },
  );
}

const configured =
  new Map<
    string,
    SemanticEntry
  >();

for (
  const entry of parsed.semantics
) {
  configured.set(
    keyFor(
      entry.kind,
      entry.hash,
    ),
    entry,
  );
}

const additions =
  [
    ...verified.values(),
  ]
    .filter(
      (entry) =>
        !configured.has(
          keyFor(
            entry.kind,
            entry.hash,
          ),
        ),
    )
    .sort(
      (a, b) =>
        a.kind.localeCompare(
          b.kind,
        ) ||
        a.value.localeCompare(
          b.value,
        ),
    );

console.log(
  "TraceForge Semantic Discovery",
);

console.log(
  "=============================",
);

console.log();
console.log(
  `Candidate rows:       ${candidateRows.length}`,
);

console.log(
  `Verified unique:      ${verified.size}`,
);

console.log(
  `New verified entries: ${additions.length}`,
);

console.log(
  `Rejected candidates:  ${rejected.length}`,
);

console.log();

if (
  additions.length ===
  0
) {
  console.log(
    "No new verified semantics found.",
  );
} else {
  console.log(
    "Verified additions",
  );

  console.table(
    additions.map(
      (entry) => ({
        kind:
          entry.kind,
        value:
          entry.value,
        label:
          entry.label,
        hash:
          entry.hash,
      }),
    ),
  );
}

if (
  rejected.length >
  0
) {
  console.log();
  console.log(
    "Rejected candidates",
  );

  console.table(
    rejected,
  );
}

if (
  !write
) {
  console.log();
  console.log(
    "DRY RUN: no config file changed.",
  );

  console.log(
    "Run again with --write to merge only verified additions.",
  );

  process.exit(
    0,
  );
}

if (
  rejected.length >
  0
) {
  throw new Error(
    "Refusing --write because one or more candidate strings did not match their observed hashes.",
  );
}

for (
  const entry of additions
) {
  parsed.semantics.push(
    entry,
  );
}

parsed.semantics.sort(
  (a, b) =>
    a.kind.localeCompare(
      b.kind,
    ) ||
    a.value.localeCompare(
      b.value,
    ),
);

await writeFile(
  semanticFile,
  JSON.stringify(
    parsed,
    null,
    2,
  ) + "\n",
);

console.log();
console.log(
  `WROTE ${additions.length} verified semantic definition(s) to ${semanticFile}`,
);
