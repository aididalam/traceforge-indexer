import type { RowDataPacket } from "mysql2";
import { createDb } from "./db.js";

interface Row extends RowDataPacket {
  [key: string]: unknown;
}

const db = await createDb();

try {
  const tables = [
    "tenants",
    "tenant_admins",
    "organizations",
    "wallets",
    "tenant_memberships",
    "roles",
    "role_capabilities",
    "organization_roles",
    "entities",
    "trace_events",
    "custody_transfers",
    "entity_links",
    "entity_link_events",
  ];

  console.log("TraceForge Read Model Status");
  console.log("============================");

  for (const table of tables) {
    const [rows] = await db.query(`SELECT COUNT(*) AS total FROM ${table}`);
    const total = (rows as Row[])[0]?.total;
    console.log(`${table.padEnd(24)} ${total}`);
  }

  const [checkpoint] = await db.query(
    `SELECT projector_name, last_event_id, updated_at
     FROM projection_checkpoints
     ORDER BY projector_name`,
  );

  console.log();
  console.log("Projection checkpoint");
  console.table(checkpoint);

  const [entities] = await db.query(
    `SELECT
       entity_id,
       entity_type,
       current_state,
       metadata_hash,
       current_custodian,
       closed,
       created_at,
       closed_at
     FROM entities
     ORDER BY created_event_id`,
  );

  console.log();
  console.log("Entities");
  console.table(entities);

  const [custody] = await db.query(
    `SELECT
       entity_id,
       from_organization_id,
       to_organization_id,
       status,
       proposed_at,
       terminal_at
     FROM custody_transfers
     ORDER BY proposal_event_id`,
  );

  console.log();
  console.log("Custody transfers");
  console.table(custody);

  const [links] = await db.query(
    `SELECT
       link_id,
       source_entity_id,
       target_entity_id,
       link_type,
       organization_id,
       active
     FROM entity_links
     ORDER BY created_event_id`,
  );

  console.log();
  console.log("Entity links");
  console.table(links);
} finally {
  await db.end();
}
