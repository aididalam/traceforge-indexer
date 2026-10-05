import type { RowDataPacket } from "mysql2";
import { config } from "./config.js";
import { createDb } from "./db.js";

const PROJECTOR = "read-model-v1";
const rebuild = process.argv.includes("--rebuild");

interface EventRow extends RowDataPacket {
  id: number | string;
  event_name: string;
  event_args: string | Record<string, unknown>;
  block_number: number | string;
  transaction_hash: string;
  log_index: number;
}

interface CheckpointRow extends RowDataPacket {
  last_event_id: number | string;
}

type Args = Record<string, unknown>;

function argsOf(row: EventRow): Args {
  return typeof row.event_args === "string"
    ? JSON.parse(row.event_args) as Args
    : row.event_args;
}

function str(a: Args, key: string): string {
  const v = a[key];
  if (typeof v !== "string") throw new Error(`Expected string arg ${key}`);
  return v;
}

function bool(a: Args, key: string): boolean {
  const v = a[key];
  if (typeof v !== "boolean") throw new Error(`Expected boolean arg ${key}`);
  return v;
}

function num(a: Args, key: string): number {
  const v = a[key];
  if (typeof v !== "number" && typeof v !== "string") {
    throw new Error(`Expected numeric arg ${key}`);
  }
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new Error(`Unsafe numeric arg ${key}`);
  return n;
}

function uint(a: Args, key: string): string {
  const v = a[key];
  if (typeof v !== "number" && typeof v !== "string") {
    throw new Error(`Expected uint arg ${key}`);
  }
  return String(v);
}

const db = await createDb();

async function q(sql: string, values: unknown[] = []) {
  return db.query(sql, values);
}

async function mustUpdate(sql: string, values: unknown[], label: string) {
  const [result] = await q(sql, values);
  const affectedRows = (result as { affectedRows?: number }).affectedRows ?? 0;
  if (affectedRows === 0) throw new Error(`${label}: no projected row matched`);
}

async function apply(row: EventRow) {
  const a = argsOf(row);
  const id = String(row.id);

  switch (row.event_name) {
    case "TenantCreated":
      await q(
        `INSERT INTO tenants
         (tenant_id, metadata_hash, active, created_at, created_event_id, updated_event_id)
         VALUES (?, ?, TRUE, ?, ?, ?)`,
        [str(a,"tenantId"), str(a,"metadataHash"), uint(a,"createdAt"), id, id],
      );
      return;

    case "TenantAdminChanged": {
      const active = bool(a,"active");
      await q(
        `INSERT INTO tenant_admins (tenant_id, account, active, updated_event_id)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE active = ?, updated_event_id = ?`,
        [str(a,"tenantId"), str(a,"account"), active, id, active, id],
      );
      return;
    }

    case "TenantStatusChanged":
      await mustUpdate(
        `UPDATE tenants SET active = ?, updated_event_id = ? WHERE tenant_id = ?`,
        [bool(a,"active"), id, str(a,"tenantId")],
        row.event_name,
      );
      return;

    case "OrganizationRegistered":
      await q(
        `INSERT INTO organizations
         (organization_id, metadata_hash, active, created_at, created_event_id, updated_event_id)
         VALUES (?, ?, TRUE, ?, ?, ?)`,
        [str(a,"organizationId"), str(a,"metadataHash"), uint(a,"createdAt"), id, id],
      );
      return;

    case "OrganizationStatusChanged":
      await mustUpdate(
        `UPDATE organizations SET active = ?, updated_event_id = ? WHERE organization_id = ?`,
        [bool(a,"active"), id, str(a,"organizationId")],
        row.event_name,
      );
      return;

    case "WalletBound":
      await q(
        `INSERT INTO wallets (wallet, organization_id, active, bound_event_id, updated_event_id)
         VALUES (?, ?, TRUE, ?, ?)`,
        [str(a,"wallet"), str(a,"organizationId"), id, id],
      );
      return;

    case "WalletStatusChanged":
      await mustUpdate(
        `UPDATE wallets SET active = ?, updated_event_id = ?
         WHERE wallet = ? AND organization_id = ?`,
        [bool(a,"active"), id, str(a,"wallet"), str(a,"organizationId")],
        row.event_name,
      );
      return;

    case "OrganizationAddedToTenant":
      await q(
        `INSERT INTO tenant_memberships
         (tenant_id, organization_id, active, joined_at, joined_event_id, updated_event_id)
         VALUES (?, ?, TRUE, ?, ?, ?)`,
        [str(a,"tenantId"), str(a,"organizationId"), uint(a,"joinedAt"), id, id],
      );
      return;

    case "TenantMembershipStatusChanged":
      await mustUpdate(
        `UPDATE tenant_memberships SET active = ?, updated_event_id = ?
         WHERE tenant_id = ? AND organization_id = ?`,
        [bool(a,"active"), id, str(a,"tenantId"), str(a,"organizationId")],
        row.event_name,
      );
      return;

    case "RoleCreated":
      await q(
        `INSERT INTO roles
         (tenant_id, role_id, metadata_hash, active, created_at, created_event_id, updated_event_id)
         VALUES (?, ?, ?, TRUE, ?, ?, ?)`,
        [str(a,"tenantId"), str(a,"roleId"), str(a,"metadataHash"), uint(a,"createdAt"), id, id],
      );
      return;

    case "RoleStatusChanged":
      await mustUpdate(
        `UPDATE roles SET active = ?, updated_event_id = ?
         WHERE tenant_id = ? AND role_id = ?`,
        [bool(a,"active"), id, str(a,"tenantId"), str(a,"roleId")],
        row.event_name,
      );
      return;

    case "RoleCapabilityChanged": {
      const enabled = bool(a,"enabled");
      await q(
        `INSERT INTO role_capabilities
         (tenant_id, role_id, capability, enabled, updated_event_id)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE enabled = ?, updated_event_id = ?`,
        [str(a,"tenantId"), str(a,"roleId"), num(a,"capability"), enabled, id, enabled, id],
      );
      return;
    }

    case "OrganizationRoleAssigned":
      await q(
        `INSERT INTO organization_roles
         (tenant_id, organization_id, role_id, active, assigned_at, assigned_event_id, updated_event_id)
         VALUES (?, ?, ?, TRUE, ?, ?, ?)`,
        [str(a,"tenantId"), str(a,"organizationId"), str(a,"roleId"), uint(a,"assignedAt"), id, id],
      );
      return;

    case "OrganizationRoleStatusChanged":
      await mustUpdate(
        `UPDATE organization_roles SET active = ?, updated_event_id = ?
         WHERE tenant_id = ? AND organization_id = ? AND role_id = ?`,
        [bool(a,"active"), id, str(a,"tenantId"), str(a,"organizationId"), str(a,"roleId")],
        row.event_name,
      );
      return;

    case "EntityCreated":
      await q(
        `INSERT INTO entities
         (tenant_id, entity_id, entity_type, metadata_hash, current_state,
          current_custodian, closed, created_at, closed_at, created_event_id, updated_event_id)
         VALUES (?, ?, ?, ?, ?, ?, FALSE, ?, NULL, ?, ?)`,
        [str(a,"tenantId"), str(a,"entityId"), str(a,"entityType"), str(a,"metadataHash"),
         str(a,"initialState"), str(a,"organizationId"), uint(a,"createdAt"), id, id],
      );
      return;

    case "TraceRecorded":
      await q(
        `INSERT INTO trace_events
         (chain_event_id, tenant_id, entity_id, event_type, organization_id, role_id, actor,
          evidence_hash, state_after, metadata_hash_after, event_timestamp,
          block_number, transaction_hash, log_index)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, str(a,"tenantId"), str(a,"entityId"), str(a,"eventType"), str(a,"organizationId"),
         str(a,"roleId"), str(a,"actor"), str(a,"evidenceHash"), str(a,"stateAfter"),
         str(a,"metadataHashAfter"), uint(a,"timestamp"), String(row.block_number),
         row.transaction_hash, row.log_index],
      );
      await mustUpdate(
        `UPDATE entities SET current_state = ?, metadata_hash = ?, updated_event_id = ?
         WHERE tenant_id = ? AND entity_id = ?`,
        [str(a,"stateAfter"), str(a,"metadataHashAfter"), id, str(a,"tenantId"), str(a,"entityId")],
        "TraceRecorded entity update",
      );
      return;

    case "CustodyClaimed":
      await q(`INSERT INTO custody_claims
        (chain_event_id,tenant_id,entity_id,from_organization_id,to_organization_id,
         actor,event_type,evidence_hash,custody_version,received_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [id,str(a,"tenantId"),str(a,"entityId"),str(a,"fromOrganizationId"),str(a,"toOrganizationId"),
         str(a,"actor"),str(a,"eventType"),str(a,"evidenceHash"),uint(a,"custodyVersion"),uint(a,"timestamp")]);
      await mustUpdate(`UPDATE entities SET current_custodian=?,custody_version=?,updated_event_id=?
        WHERE tenant_id=? AND entity_id=? AND current_custodian=? AND custody_version=? AND closed=FALSE`,
        [str(a,"toOrganizationId"),uint(a,"custodyVersion"),id,str(a,"tenantId"),str(a,"entityId"),
         str(a,"fromOrganizationId"),(BigInt(uint(a,"custodyVersion"))-1n).toString()],"CustodyClaimed ordered update");
      return;

    case "EntityLinkCreated":
      await q(
        `INSERT INTO entity_links
         (tenant_id, link_id, source_entity_id, target_entity_id, link_type,
          organization_id, active, created_at, created_event_id, updated_event_id)
         VALUES (?, ?, ?, ?, ?, ?, TRUE, ?, ?, ?)`,
        [str(a,"tenantId"), str(a,"linkId"), str(a,"sourceEntityId"), str(a,"targetEntityId"),
         str(a,"linkType"), str(a,"organizationId"), uint(a,"createdAt"), id, id],
      );
      await q(
        `INSERT INTO entity_link_events
         (chain_event_id, tenant_id, link_id, source_entity_id, target_entity_id, link_type,
          active, organization_id, role_id, actor, event_type, evidence_hash,
          event_timestamp, action, block_number, transaction_hash, log_index)
         VALUES (?, ?, ?, ?, ?, ?, TRUE, ?, ?, ?, ?, ?, ?, 'CREATED', ?, ?, ?)`,
        [id, str(a,"tenantId"), str(a,"linkId"), str(a,"sourceEntityId"), str(a,"targetEntityId"),
         str(a,"linkType"), str(a,"organizationId"), str(a,"roleId"), str(a,"actor"),
         str(a,"eventType"), str(a,"evidenceHash"), uint(a,"createdAt"),
         String(row.block_number), row.transaction_hash, row.log_index],
      );
      return;

    case "EntityLinkStatusChanged": {
      const active = bool(a,"active");
      await mustUpdate(
        `UPDATE entity_links SET active = ?, organization_id = ?, updated_event_id = ?
         WHERE tenant_id = ? AND link_id = ?`,
        [active, str(a,"organizationId"), id, str(a,"tenantId"), str(a,"linkId")],
        row.event_name,
      );
      await q(
        `INSERT INTO entity_link_events
         (chain_event_id, tenant_id, link_id, source_entity_id, target_entity_id, link_type,
          active, organization_id, role_id, actor, event_type, evidence_hash,
          event_timestamp, action, block_number, transaction_hash, log_index)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'STATUS', ?, ?, ?)`,
        [id, str(a,"tenantId"), str(a,"linkId"), str(a,"sourceEntityId"), str(a,"targetEntityId"),
         str(a,"linkType"), active, str(a,"organizationId"), str(a,"roleId"), str(a,"actor"),
         str(a,"eventType"), str(a,"evidenceHash"), uint(a,"updatedAt"),
         String(row.block_number), row.transaction_hash, row.log_index],
      );
      return;
    }

    case "EntityClosed":
      await mustUpdate(
        `UPDATE entities SET closed = TRUE, closed_at = ?, custody_version=custody_version+1, updated_event_id = ?
         WHERE tenant_id = ? AND entity_id = ?`,
        [uint(a,"closedAt"), id, str(a,"tenantId"), str(a,"entityId")],
        row.event_name,
      );
      return;

    case "OwnershipTransferred":
    case "OwnershipTransferStarted":
      return;

    default:
      throw new Error(`Unhandled TraceForge event: ${row.event_name}`);
  }
}

const derivedTables = [
  "entity_link_events",
  "entity_links",
  "custody_claims",
  "trace_events",
  "entities",
  "organization_roles",
  "role_capabilities",
  "roles",
  "tenant_memberships",
  "wallets",
  "organizations",
  "tenant_admins",
  "tenants",
];

try {
  await db.beginTransaction();

  if (rebuild) {
    for (const table of derivedTables) await q(`DELETE FROM ${table}`);
    await q(`DELETE FROM projection_checkpoints WHERE projector_name = ?`, [PROJECTOR]);
  }

  let lastEventId = 0n;

  if (!rebuild) {
    const [rows] = await q(
      `SELECT last_event_id FROM projection_checkpoints WHERE projector_name = ?`,
      [PROJECTOR],
    );
    const checkpoints = rows as CheckpointRow[];
    if (checkpoints.length > 0) lastEventId = BigInt(checkpoints[0].last_event_id);
  }

  const [rows] = await q(
    `SELECT id, event_name, event_args, block_number, transaction_hash, log_index
     FROM chain_events
     WHERE chain_id = ? AND contract_address = ? AND id > ?
     ORDER BY block_number, transaction_index, log_index, id`,
    [config.chainId, config.contractAddress.toLowerCase(), lastEventId.toString()],
  );

  const events = rows as EventRow[];
  let newestId = lastEventId;

  console.log("TraceForge Read Model Projection");
  console.log("================================");
  console.log(`Mode:       ${rebuild ? "REBUILD" : "INCREMENTAL"}`);
  console.log(`Event rows: ${events.length}`);

  for (const event of events) {
    await apply(event);
    newestId = BigInt(event.id);
  }

  if (events.length > 0) {
    await q(
      `INSERT INTO projection_checkpoints (projector_name, last_event_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE last_event_id = ?, updated_at = CURRENT_TIMESTAMP`,
      [PROJECTOR, newestId.toString(), newestId.toString()],
    );
  }

  await db.commit();

  console.log(`PROJECTED ${events.length} event(s).`);
  if (events.length === 0) console.log("Read model is already caught up.");
  else console.log(`Checkpoint event ID: ${newestId}`);
} catch (error) {
  await db.rollback();
  throw error;
} finally {
  await db.end();
}
