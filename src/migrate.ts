import type {
  RowDataPacket,
} from "mysql2";

import {
  readdir,
  readFile,
} from "node:fs/promises";

import {
  createDb,
} from "./db.js";
import {config} from './config.js';
import {createHash} from 'node:crypto';

interface MigrationRow
  extends RowDataPacket {
  filename: string;
}

const db =
  await createDb();
const migrationLockName='tf-migrate:'+createHash('sha256').update(config.mysql.database).digest('hex').slice(0,48);

try {
  const [lockRows] = await db.query<RowDataPacket[]>('SELECT GET_LOCK(?,120) acquired', [migrationLockName]);
  if (Number(lockRows[0].acquired) !== 1) throw Error('Database migration is already in progress');
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) NOT NULL,
      applied_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

      PRIMARY KEY (filename)
    )
  `);

  const directory =
    new URL(
      "../migrations/",
      import.meta.url,
    );

  const files =
    (
      await readdir(
        directory,
      )
    )
      .filter(
        (filename) =>
          filename.endsWith(
            ".sql",
          ),
      )
      .sort();

  for (
    const filename of files
  ) {
    const [rows] =
      await db.execute<
        MigrationRow[]
      >(
        `
          SELECT filename
          FROM schema_migrations
          WHERE filename = ?
        `,
        [
          filename,
        ],
      );

    if (
      rows.length > 0
    ) {
      console.log(
        `SKIP  ${filename}`,
      );

      continue;
    }

    console.log(
      `APPLY ${filename}`,
    );

    const sql =
      await readFile(
        new URL(
          filename,
          directory,
        ),
        "utf8",
      );

    await db.beginTransaction();

    try {
      await db.query(sql);

      await db.execute(
        `
          INSERT INTO schema_migrations (
            filename
          )
          VALUES (?)
        `,
        [
          filename,
        ],
      );

      await db.commit();
    } catch (
      error
    ) {
      await db.rollback();

      throw error;
    }
  }

  console.log();
  console.log(
    "Migrations complete.",
  );
} finally {
  await db.query('SELECT RELEASE_LOCK(?)', [migrationLockName]);
  await db.end();
}
