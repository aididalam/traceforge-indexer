import type { RowDataPacket } from "mysql2";
import { config } from "./config.js";
import { createDb } from "./db.js";

interface EntityRow extends RowDataPacket {
  tenant_id: string;
  entity_id: string;
  entity_type: string;
  metadata_hash: string;
  current_state: string;
  current_custodian: string;
  closed: number | boolean;
  created_at: string | number;
  closed_at: string | number | null;
}

interface EventRow extends RowDataPacket {
  id: string | number;
  event_name: string;
  event_args: string | Record<string, unknown>;
  block_number: string | number;
  transaction_hash: string;
  transaction_index: number;
  log_index: number;
}

interface LinkRow extends RowDataPacket {
  link_id: string;
  source_entity_id: string;
  target_entity_id: string;
  link_type: string;
  organization_id: string;
  active: number | boolean;
}

type Args = Record<string, unknown>;

function value(args: Args, key: string): string {
  const current = args[key];

  if (
    typeof current !== "string" &&
    typeof current !== "number" &&
    typeof current !== "boolean"
  ) {
    return "-";
  }

  return String(current);
}

function argsOf(row: EventRow): Args {
  return typeof row.event_args === "string"
    ? (JSON.parse(row.event_args) as Args)
    : row.event_args;
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);

  if (index === -1) {
    return undefined;
  }

  return process.argv[index + 1];
}

const entityId =
  argValue("--entity") ??
  process.argv.find(
    (item, index) =>
      index > 1 &&
      item.startsWith("0x") &&
      item.length === 66,
  );

const requestedTenantId =
  argValue("--tenant");

if (!entityId) {
  throw new Error(
    "Usage: npm run history -- --entity 0x... [--tenant 0x...]",
  );
}

if (!/^0x[0-9a-fA-F]{64}$/.test(entityId)) {
  throw new Error(
    `Invalid entity ID: ${entityId}`,
  );
}

if (
  requestedTenantId &&
  !/^0x[0-9a-fA-F]{64}$/.test(requestedTenantId)
) {
  throw new Error(
    `Invalid tenant ID: ${requestedTenantId}`,
  );
}

const db = await createDb();

try {
  const entitySql = requestedTenantId
    ? `
        SELECT
          tenant_id,
          entity_id,
          entity_type,
          metadata_hash,
          current_state,
          current_custodian,
          closed,
          created_at,
          closed_at
        FROM entities
        WHERE entity_id = ?
          AND tenant_id = ?
      `
    : `
        SELECT
          tenant_id,
          entity_id,
          entity_type,
          metadata_hash,
          current_state,
          current_custodian,
          closed,
          created_at,
          closed_at
        FROM entities
        WHERE entity_id = ?
      `;

  const entityValues = requestedTenantId
    ? [entityId, requestedTenantId]
    : [entityId];

  const [entityRows] =
    await db.query<EntityRow[]>(
      entitySql,
      entityValues,
    );

  if (entityRows.length === 0) {
    throw new Error(
      "Entity was not found in the read model.",
    );
  }

  if (
    !requestedTenantId &&
    entityRows.length > 1
  ) {
    throw new Error(
      "Entity ID exists in more than one tenant. Pass --tenant.",
    );
  }

  const entity =
    entityRows[0];

  const tenantId =
    entity.tenant_id;

  const [eventRows] =
    await db.query<EventRow[]>(
      `
        SELECT
          id,
          event_name,
          event_args,
          block_number,
          transaction_hash,
          transaction_index,
          log_index
        FROM chain_events
        WHERE chain_id = ?
          AND contract_address = ?
          AND JSON_UNQUOTE(
                JSON_EXTRACT(
                  event_args,
                  '$.tenantId'
                )
              ) = ?
          AND (
            JSON_UNQUOTE(
              JSON_EXTRACT(
                event_args,
                '$.entityId'
              )
            ) = ?
            OR
            JSON_UNQUOTE(
              JSON_EXTRACT(
                event_args,
                '$.sourceEntityId'
              )
            ) = ?
            OR
            JSON_UNQUOTE(
              JSON_EXTRACT(
                event_args,
                '$.targetEntityId'
              )
            ) = ?
          )
        ORDER BY
          block_number,
          transaction_index,
          log_index,
          id
      `,
      [
        config.chainId,
        config.contractAddress.toLowerCase(),
        tenantId,
        entityId,
        entityId,
        entityId,
      ],
    );

  const [linkRows] =
    await db.query<LinkRow[]>(
      `
        SELECT
          link_id,
          source_entity_id,
          target_entity_id,
          link_type,
          organization_id,
          active
        FROM entity_links
        WHERE tenant_id = ?
          AND (
            source_entity_id = ?
            OR target_entity_id = ?
          )
        ORDER BY created_event_id
      `,
      [
        tenantId,
        entityId,
        entityId,
      ],
    );

  console.log(
    "TraceForge Entity History",
  );

  console.log(
    "=========================",
  );

  console.log();

  console.log(
    `Tenant:            ${tenantId}`,
  );

  console.log(
    `Entity:            ${entity.entity_id}`,
  );

  console.log(
    `Type:              ${entity.entity_type}`,
  );

  console.log(
    `Current state:     ${entity.current_state}`,
  );

  console.log(
    `Metadata hash:     ${entity.metadata_hash}`,
  );

  console.log(
    `Current custodian: ${entity.current_custodian}`,
  );

  console.log(
    `Closed:            ${Boolean(entity.closed)}`,
  );

  console.log();

  console.log(
    `Timeline (${eventRows.length} events)`,
  );

  console.log(
    "-------------------------",
  );

  for (const row of eventRows) {
    const args =
      argsOf(row);

    console.log();

    console.log(
      `#${row.id} block ${row.block_number}:${row.log_index} ${row.event_name}`,
    );

    switch (row.event_name) {
      case "EntityCreated":
        console.log(
          `  type:       ${value(args, "entityType")}`,
        );
        console.log(
          `  custodian:  ${value(args, "organizationId")}`,
        );
        console.log(
          `  state:      ${value(args, "initialState")}`,
        );
        console.log(
          `  metadata:   ${value(args, "metadataHash")}`,
        );
        console.log(
          `  actor:      ${value(args, "actor")}`,
        );
        console.log(
          `  timestamp:  ${value(args, "createdAt")}`,
        );
        break;

      case "TraceRecorded":
        console.log(
          `  event type: ${value(args, "eventType")}`,
        );
        console.log(
          `  org:        ${value(args, "organizationId")}`,
        );
        console.log(
          `  state:      ${value(args, "stateAfter")}`,
        );
        console.log(
          `  metadata:   ${value(args, "metadataHashAfter")}`,
        );
        console.log(
          `  evidence:   ${value(args, "evidenceHash")}`,
        );
        console.log(
          `  actor:      ${value(args, "actor")}`,
        );
        console.log(
          `  timestamp:  ${value(args, "timestamp")}`,
        );
        break;

      case "CustodyTransferProposed":
        console.log(
          `  transfer:   ${value(args, "fromOrganizationId")} -> ${value(args, "toOrganizationId")}`,
        );
        console.log(
          `  event type: ${value(args, "eventType")}`,
        );
        console.log(
          `  evidence:   ${value(args, "evidenceHash")}`,
        );
        console.log(
          `  actor:      ${value(args, "actor")}`,
        );
        console.log(
          `  timestamp:  ${value(args, "proposedAt")}`,
        );
        break;

      case "CustodyTransferred":
        console.log(
          `  transfer:   ${value(args, "fromOrganizationId")} -> ${value(args, "toOrganizationId")}`,
        );
        console.log(
          `  event type: ${value(args, "eventType")}`,
        );
        console.log(
          `  evidence:   ${value(args, "evidenceHash")}`,
        );
        console.log(
          `  actor:      ${value(args, "actor")}`,
        );
        console.log(
          `  timestamp:  ${value(args, "acceptedAt")}`,
        );
        break;

      case "CustodyTransferCancelled":
        console.log(
          `  transfer:   ${value(args, "fromOrganizationId")} -> ${value(args, "toOrganizationId")}`,
        );
        console.log(
          `  event type: ${value(args, "eventType")}`,
        );
        console.log(
          `  evidence:   ${value(args, "evidenceHash")}`,
        );
        console.log(
          `  actor:      ${value(args, "actor")}`,
        );
        console.log(
          `  timestamp:  ${value(args, "cancelledAt")}`,
        );
        break;

      case "CustodyTransferCancelledByAdmin":
        console.log(
          `  transfer:   ${value(args, "fromOrganizationId")} -> ${value(args, "toOrganizationId")}`,
        );
        console.log(
          `  event type: ${value(args, "eventType")}`,
        );
        console.log(
          `  evidence:   ${value(args, "evidenceHash")}`,
        );
        console.log(
          `  admin:      ${value(args, "admin")}`,
        );
        console.log(
          `  timestamp:  ${value(args, "cancelledAt")}`,
        );
        break;

      case "EntityLinkCreated":
        console.log(
          `  link:       ${value(args, "sourceEntityId")} -> ${value(args, "targetEntityId")}`,
        );
        console.log(
          `  link type:  ${value(args, "linkType")}`,
        );
        console.log(
          `  link id:    ${value(args, "linkId")}`,
        );
        console.log(
          `  evidence:   ${value(args, "evidenceHash")}`,
        );
        console.log(
          `  active:     true`,
        );
        console.log(
          `  timestamp:  ${value(args, "createdAt")}`,
        );
        break;

      case "EntityLinkStatusChanged":
        console.log(
          `  link:       ${value(args, "sourceEntityId")} -> ${value(args, "targetEntityId")}`,
        );
        console.log(
          `  link type:  ${value(args, "linkType")}`,
        );
        console.log(
          `  link id:    ${value(args, "linkId")}`,
        );
        console.log(
          `  active:     ${value(args, "active")}`,
        );
        console.log(
          `  evidence:   ${value(args, "evidenceHash")}`,
        );
        console.log(
          `  timestamp:  ${value(args, "updatedAt")}`,
        );
        break;

      case "EntityClosed":
        console.log(
          `  org:        ${value(args, "organizationId")}`,
        );
        console.log(
          `  event type: ${value(args, "eventType")}`,
        );
        console.log(
          `  evidence:   ${value(args, "evidenceHash")}`,
        );
        console.log(
          `  actor:      ${value(args, "actor")}`,
        );
        console.log(
          `  timestamp:  ${value(args, "closedAt")}`,
        );
        break;

      default:
        console.log(
          JSON.stringify(
            args,
            null,
            2,
          ),
        );
    }

    console.log(
      `  tx:         ${row.transaction_hash}`,
    );
  }

  console.log();

  console.log(
    `Current relationships (${linkRows.length})`,
  );

  console.log(
    "-------------------------",
  );

  if (linkRows.length === 0) {
    console.log(
      "none",
    );
  } else {
    for (const link of linkRows) {
      console.log();
      console.log(
        `Link:      ${link.link_id}`,
      );
      console.log(
        `Source:    ${link.source_entity_id}`,
      );
      console.log(
        `Target:    ${link.target_entity_id}`,
      );
      console.log(
        `Type:      ${link.link_type}`,
      );
      console.log(
        `Custodian: ${link.organization_id}`,
      );
      console.log(
        `Active:    ${Boolean(link.active)}`,
      );
    }
  }
} finally {
  await db.end();
}
