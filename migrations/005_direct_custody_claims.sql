DROP TABLE IF EXISTS custody_transfers;
ALTER TABLE entities ADD COLUMN custody_version BIGINT UNSIGNED NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS custody_claims (
  chain_event_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  tenant_id VARCHAR(66) NOT NULL,
  entity_id VARCHAR(66) NOT NULL,
  from_organization_id VARCHAR(66) NOT NULL,
  to_organization_id VARCHAR(66) NOT NULL,
  actor VARCHAR(42) NOT NULL,
  event_type VARCHAR(66) NOT NULL,
  evidence_hash VARCHAR(66) NOT NULL,
  custody_version BIGINT UNSIGNED NOT NULL,
  received_at BIGINT UNSIGNED NOT NULL,
  UNIQUE KEY custody_sequence (tenant_id, entity_id, custody_version)
);
