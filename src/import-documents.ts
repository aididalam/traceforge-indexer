import {
  readdir,
  readFile,
  stat,
} from "node:fs/promises";

import {
  basename,
  relative,
  resolve,
} from "node:path";

import {
  keccak256,
  toHex,
} from "viem";

import {
  createDb,
} from "./db.js";

function inferKind(
  filename: string,
): string {
  const lower =
    filename.toLowerCase();

  if (
    lower.startsWith(
      "tenant-",
    )
  ) {
    return "tenant";
  }

  if (
    lower.startsWith(
      "organization-",
    )
  ) {
    return "organization";
  }

  if (
    lower.startsWith(
      "role-",
    )
  ) {
    return "role";
  }

  if (
    lower.startsWith(
      "entity-",
    )
  ) {
    return "entity";
  }

  if (
    lower.startsWith(
      "evidence-",
    )
  ) {
    return "evidence";
  }

  return "document";
}

async function collectJsonFiles(
  input: string,
): Promise<string[]> {
  const absolute =
    resolve(input);

  const info =
    await stat(
      absolute,
    );

  if (
    info.isFile()
  ) {
    if (
      !absolute
        .toLowerCase()
        .endsWith(
          ".json",
        )
    ) {
      return [];
    }

    return [
      absolute,
    ];
  }

  if (
    !info.isDirectory()
  ) {
    return [];
  }

  const entries =
    await readdir(
      absolute,
      {
        withFileTypes:
          true,
      },
    );

  const files: string[] =
    [];

  for (
    const entry of entries
  ) {
    if (
      entry.name.startsWith(
        ".",
      )
    ) {
      continue;
    }

    const child =
      resolve(
        absolute,
        entry.name,
      );

    if (
      entry.isDirectory()
    ) {
      files.push(
        ...await collectJsonFiles(
          child,
        ),
      );

      continue;
    }

    if (
      entry.isFile() &&
      entry.name
        .toLowerCase()
        .endsWith(
          ".json",
        )
    ) {
      files.push(
        child,
      );
    }
  }

  return files;
}

const inputs =
  process.argv.slice(
    2,
  );

if (
  inputs.length ===
  0
) {
  throw new Error(
    "Usage: npm run documents:import -- <file-or-directory> [...]",
  );
}

const discovered =
  new Set<string>();

for (
  const input of inputs
) {
  const files =
    await collectJsonFiles(
      input,
    );

  for (
    const file of files
  ) {
    discovered.add(
      file,
    );
  }
}

const files =
  [
    ...discovered,
  ].sort();

if (
  files.length ===
  0
) {
  throw new Error(
    "No JSON files were found.",
  );
}

const db =
  await createDb();

let imported =
  0;

try {
  await db.beginTransaction();

  for (
    const file of files
  ) {
    const bytes =
      await readFile(
        file,
      );

    const text =
      bytes.toString(
        "utf8",
      );

    const document =
      JSON.parse(
        text,
      ) as unknown;

    const contentHash =
      keccak256(
        toHex(
          new Uint8Array(
            bytes,
          ),
        ),
      );

    const sourceRef =
      relative(
        process.cwd(),
        file,
      );

    const kind =
      inferKind(
        basename(
          file,
        ),
      );

    await db.query(
      `
        INSERT INTO offchain_documents (
          content_hash,
          document_kind,
          source_ref,
          byte_length,
          document_json,
          raw_text
        )
        VALUES (?, ?, ?, ?, ?, ?)

        ON DUPLICATE KEY UPDATE
          document_kind =
            VALUES(document_kind),
          source_ref =
            VALUES(source_ref),
          byte_length =
            VALUES(byte_length),
          document_json =
            VALUES(document_json),
          raw_text =
            VALUES(raw_text),
          imported_at =
            CURRENT_TIMESTAMP
      `,
      [
        contentHash,
        kind,
        sourceRef,
        bytes.length,
        JSON.stringify(
          document,
        ),
        text,
      ],
    );

    imported +=
      1;

    console.log(
      `${contentHash}  ${kind.padEnd(12)}  ${sourceRef}`,
    );
  }

  await db.commit();
} catch (
  error
) {
  await db.rollback();

  throw error;
} finally {
  await db.end();
}

console.log();
console.log(
  `Imported ${imported} JSON document(s).`,
);
