CREATE TABLE IF NOT EXISTS semantic_registry (
    chain_id BIGINT UNSIGNED NOT NULL,
    contract_address VARCHAR(42) NOT NULL,
    semantic_kind VARCHAR(32) NOT NULL,
    semantic_hash VARCHAR(66) NOT NULL,
    semantic_value VARCHAR(255) NOT NULL,
    display_label VARCHAR(255) NOT NULL,
    source_ref VARCHAR(512) NOT NULL,
    updated_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (
        chain_id,
        contract_address,
        semantic_kind,
        semantic_hash
    ),

    KEY idx_semantic_registry_value (
        chain_id,
        contract_address,
        semantic_kind,
        semantic_value
    )
);
