CREATE TABLE IF NOT EXISTS indexer_checkpoints (
    chain_id BIGINT UNSIGNED NOT NULL,
    contract_address VARCHAR(42) NOT NULL,
    last_processed_block BIGINT UNSIGNED NOT NULL,
    updated_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (
        chain_id,
        contract_address
    )
);

CREATE TABLE IF NOT EXISTS chain_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

    chain_id BIGINT UNSIGNED NOT NULL,
    contract_address VARCHAR(42) NOT NULL,

    block_number BIGINT UNSIGNED NOT NULL,
    block_hash VARCHAR(66) NOT NULL,

    transaction_hash VARCHAR(66) NOT NULL,
    transaction_index INT UNSIGNED NOT NULL,
    log_index INT UNSIGNED NOT NULL,

    topics JSON NOT NULL,
    data LONGTEXT NOT NULL,

    event_name VARCHAR(128) NOT NULL,
    event_args JSON NOT NULL,

    indexed_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),

    UNIQUE KEY uq_chain_event (
        chain_id,
        transaction_hash,
        log_index
    ),

    KEY idx_chain_events_block (
        chain_id,
        contract_address,
        block_number,
        transaction_index,
        log_index
    ),

    KEY idx_chain_events_name (
        chain_id,
        contract_address,
        event_name,
        block_number
    )
);
