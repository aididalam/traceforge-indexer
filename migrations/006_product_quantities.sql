ALTER TABLE projection_checkpoints MODIFY projector_name VARCHAR(128) NOT NULL;
CREATE TABLE product_quantities (
 chain_id BIGINT UNSIGNED NOT NULL, contract_address VARCHAR(42) NOT NULL,
 tenant_id VARCHAR(66) NOT NULL, entity_id VARCHAR(66) NOT NULL,
 registration_metadata_hash VARCHAR(66) NOT NULL, origin_organization_id VARCHAR(66) NOT NULL,
 root_route_id VARCHAR(66) NOT NULL, initial_quantity BIGINT UNSIGNED NOT NULL,
 available_quantity BIGINT UNSIGNED NOT NULL, removed_quantity BIGINT UNSIGNED NOT NULL DEFAULT 0,
 registered_at BIGINT UNSIGNED NOT NULL, created_event_id BIGINT UNSIGNED NOT NULL, updated_event_id BIGINT UNSIGNED NOT NULL,
 PRIMARY KEY(chain_id,contract_address,tenant_id,entity_id),
 CHECK(initial_quantity=available_quantity+removed_quantity)
);
CREATE TABLE batch_routes (
 chain_id BIGINT UNSIGNED NOT NULL, contract_address VARCHAR(42) NOT NULL,
 tenant_id VARCHAR(66) NOT NULL, entity_id VARCHAR(66) NOT NULL, route_id VARCHAR(66) NOT NULL,
 parent_route_id VARCHAR(66) NOT NULL, organization_id VARCHAR(66) NOT NULL,
 received_quantity BIGINT UNSIGNED NOT NULL, available_quantity BIGINT UNSIGNED NOT NULL,
 forwarded_quantity BIGINT UNSIGNED NOT NULL DEFAULT 0, removed_quantity BIGINT UNSIGNED NOT NULL DEFAULT 0,
 version BIGINT UNSIGNED NOT NULL DEFAULT 0, received_at BIGINT UNSIGNED NOT NULL,
 created_event_id BIGINT UNSIGNED NOT NULL, updated_event_id BIGINT UNSIGNED NOT NULL,
 PRIMARY KEY(chain_id,contract_address,tenant_id,entity_id,route_id),
 KEY route_owner(chain_id,contract_address,organization_id,entity_id),
 KEY route_page(chain_id,contract_address,tenant_id,entity_id,created_event_id),
 CHECK(received_quantity=available_quantity+forwarded_quantity+removed_quantity)
);
CREATE TABLE quantity_movements (
 chain_event_id BIGINT UNSIGNED NOT NULL PRIMARY KEY, chain_id BIGINT UNSIGNED NOT NULL,
 contract_address VARCHAR(42) NOT NULL, tenant_id VARCHAR(66) NOT NULL, entity_id VARCHAR(66) NOT NULL,
 action ENUM('RECEIVED','REMOVED') NOT NULL, source_route_id VARCHAR(66) NOT NULL,
 received_route_id VARCHAR(66) NULL, from_organization_id VARCHAR(66) NOT NULL, to_organization_id VARCHAR(66) NULL,
 quantity BIGINT UNSIGNED NOT NULL, reason TINYINT UNSIGNED NULL, reason_text TEXT NULL,
 actor VARCHAR(42) NOT NULL, evidence_hash VARCHAR(66) NOT NULL, version BIGINT UNSIGNED NOT NULL,
 occurred_at BIGINT UNSIGNED NOT NULL, transaction_hash VARCHAR(66) NOT NULL,
 KEY quantity_product(chain_id,contract_address,tenant_id,entity_id,chain_event_id)
);
