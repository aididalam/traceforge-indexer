CREATE TABLE IF NOT EXISTS projection_checkpoints (
    projector_name VARCHAR(100) NOT NULL,
    last_event_id BIGINT UNSIGNED NOT NULL,
    updated_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (projector_name)
);

CREATE TABLE IF NOT EXISTS tenants (
    tenant_id VARCHAR(66) NOT NULL,
    metadata_hash VARCHAR(66) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at BIGINT UNSIGNED NOT NULL,
    created_event_id BIGINT UNSIGNED NOT NULL,
    updated_event_id BIGINT UNSIGNED NOT NULL,

    PRIMARY KEY (tenant_id)
);

CREATE TABLE IF NOT EXISTS tenant_admins (
    tenant_id VARCHAR(66) NOT NULL,
    account VARCHAR(42) NOT NULL,
    active BOOLEAN NOT NULL,
    updated_event_id BIGINT UNSIGNED NOT NULL,

    PRIMARY KEY (
        tenant_id,
        account
    )
);

CREATE TABLE IF NOT EXISTS organizations (
    organization_id VARCHAR(66) NOT NULL,
    metadata_hash VARCHAR(66) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at BIGINT UNSIGNED NOT NULL,
    created_event_id BIGINT UNSIGNED NOT NULL,
    updated_event_id BIGINT UNSIGNED NOT NULL,

    PRIMARY KEY (organization_id)
);

CREATE TABLE IF NOT EXISTS wallets (
    wallet VARCHAR(42) NOT NULL,
    organization_id VARCHAR(66) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    bound_event_id BIGINT UNSIGNED NOT NULL,
    updated_event_id BIGINT UNSIGNED NOT NULL,

    PRIMARY KEY (wallet),

    KEY idx_wallets_organization (
        organization_id
    )
);

CREATE TABLE IF NOT EXISTS tenant_memberships (
    tenant_id VARCHAR(66) NOT NULL,
    organization_id VARCHAR(66) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    joined_at BIGINT UNSIGNED NOT NULL,
    joined_event_id BIGINT UNSIGNED NOT NULL,
    updated_event_id BIGINT UNSIGNED NOT NULL,

    PRIMARY KEY (
        tenant_id,
        organization_id
    )
);

CREATE TABLE IF NOT EXISTS roles (
    tenant_id VARCHAR(66) NOT NULL,
    role_id VARCHAR(66) NOT NULL,
    metadata_hash VARCHAR(66) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at BIGINT UNSIGNED NOT NULL,
    created_event_id BIGINT UNSIGNED NOT NULL,
    updated_event_id BIGINT UNSIGNED NOT NULL,

    PRIMARY KEY (
        tenant_id,
        role_id
    )
);

CREATE TABLE IF NOT EXISTS role_capabilities (
    tenant_id VARCHAR(66) NOT NULL,
    role_id VARCHAR(66) NOT NULL,
    capability TINYINT UNSIGNED NOT NULL,
    enabled BOOLEAN NOT NULL,
    updated_event_id BIGINT UNSIGNED NOT NULL,

    PRIMARY KEY (
        tenant_id,
        role_id,
        capability
    )
);

CREATE TABLE IF NOT EXISTS organization_roles (
    tenant_id VARCHAR(66) NOT NULL,
    organization_id VARCHAR(66) NOT NULL,
    role_id VARCHAR(66) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_at BIGINT UNSIGNED NOT NULL,
    assigned_event_id BIGINT UNSIGNED NOT NULL,
    updated_event_id BIGINT UNSIGNED NOT NULL,

    PRIMARY KEY (
        tenant_id,
        organization_id,
        role_id
    )
);

CREATE TABLE IF NOT EXISTS entities (
    tenant_id VARCHAR(66) NOT NULL,
    entity_id VARCHAR(66) NOT NULL,
    entity_type VARCHAR(66) NOT NULL,
    metadata_hash VARCHAR(66) NOT NULL,
    current_state VARCHAR(66) NOT NULL,
    current_custodian VARCHAR(66) NOT NULL,
    closed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at BIGINT UNSIGNED NOT NULL,
    closed_at BIGINT UNSIGNED NULL,
    created_event_id BIGINT UNSIGNED NOT NULL,
    updated_event_id BIGINT UNSIGNED NOT NULL,

    PRIMARY KEY (
        tenant_id,
        entity_id
    ),

    KEY idx_entities_custodian (
        tenant_id,
        current_custodian
    ),

    KEY idx_entities_type (
        tenant_id,
        entity_type
    )
);

CREATE TABLE IF NOT EXISTS trace_events (
    chain_event_id BIGINT UNSIGNED NOT NULL,
    tenant_id VARCHAR(66) NOT NULL,
    entity_id VARCHAR(66) NOT NULL,
    event_type VARCHAR(66) NOT NULL,
    organization_id VARCHAR(66) NOT NULL,
    role_id VARCHAR(66) NOT NULL,
    actor VARCHAR(42) NOT NULL,
    evidence_hash VARCHAR(66) NOT NULL,
    state_after VARCHAR(66) NOT NULL,
    metadata_hash_after VARCHAR(66) NOT NULL,
    event_timestamp BIGINT UNSIGNED NOT NULL,
    block_number BIGINT UNSIGNED NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL,
    log_index INT UNSIGNED NOT NULL,

    PRIMARY KEY (chain_event_id),

    KEY idx_trace_events_entity (
        tenant_id,
        entity_id,
        block_number,
        log_index
    ),

    KEY idx_trace_events_type (
        tenant_id,
        event_type,
        block_number
    )
);

CREATE TABLE IF NOT EXISTS custody_transfers (
    proposal_event_id BIGINT UNSIGNED NOT NULL,
    tenant_id VARCHAR(66) NOT NULL,
    entity_id VARCHAR(66) NOT NULL,
    from_organization_id VARCHAR(66) NOT NULL,
    to_organization_id VARCHAR(66) NOT NULL,
    proposal_role_id VARCHAR(66) NOT NULL,
    proposal_actor VARCHAR(42) NOT NULL,
    proposal_event_type VARCHAR(66) NOT NULL,
    proposal_evidence_hash VARCHAR(66) NOT NULL,
    proposed_at BIGINT UNSIGNED NOT NULL,

    status VARCHAR(20) NOT NULL,

    terminal_event_id BIGINT UNSIGNED NULL,
    terminal_role_id VARCHAR(66) NULL,
    terminal_actor VARCHAR(42) NULL,
    terminal_event_type VARCHAR(66) NULL,
    terminal_evidence_hash VARCHAR(66) NULL,
    terminal_at BIGINT UNSIGNED NULL,

    PRIMARY KEY (proposal_event_id),

    KEY idx_custody_entity (
        tenant_id,
        entity_id,
        proposal_event_id
    ),

    KEY idx_custody_status (
        tenant_id,
        status
    )
);

CREATE TABLE IF NOT EXISTS entity_links (
    tenant_id VARCHAR(66) NOT NULL,
    link_id VARCHAR(66) NOT NULL,
    source_entity_id VARCHAR(66) NOT NULL,
    target_entity_id VARCHAR(66) NOT NULL,
    link_type VARCHAR(66) NOT NULL,
    organization_id VARCHAR(66) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at BIGINT UNSIGNED NOT NULL,
    created_event_id BIGINT UNSIGNED NOT NULL,
    updated_event_id BIGINT UNSIGNED NOT NULL,

    PRIMARY KEY (
        tenant_id,
        link_id
    ),

    KEY idx_entity_links_source (
        tenant_id,
        source_entity_id,
        active
    ),

    KEY idx_entity_links_target (
        tenant_id,
        target_entity_id,
        active
    )
);

CREATE TABLE IF NOT EXISTS entity_link_events (
    chain_event_id BIGINT UNSIGNED NOT NULL,
    tenant_id VARCHAR(66) NOT NULL,
    link_id VARCHAR(66) NOT NULL,
    source_entity_id VARCHAR(66) NOT NULL,
    target_entity_id VARCHAR(66) NOT NULL,
    link_type VARCHAR(66) NOT NULL,
    active BOOLEAN NOT NULL,
    organization_id VARCHAR(66) NOT NULL,
    role_id VARCHAR(66) NOT NULL,
    actor VARCHAR(42) NOT NULL,
    event_type VARCHAR(66) NOT NULL,
    evidence_hash VARCHAR(66) NOT NULL,
    event_timestamp BIGINT UNSIGNED NOT NULL,
    action VARCHAR(20) NOT NULL,
    block_number BIGINT UNSIGNED NOT NULL,
    transaction_hash VARCHAR(66) NOT NULL,
    log_index INT UNSIGNED NOT NULL,

    PRIMARY KEY (chain_event_id),

    KEY idx_entity_link_events_link (
        tenant_id,
        link_id,
        block_number,
        log_index
    )
);
