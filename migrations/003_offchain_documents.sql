CREATE TABLE IF NOT EXISTS offchain_documents (
    content_hash VARCHAR(66) NOT NULL,
    document_kind VARCHAR(64) NOT NULL,
    source_ref VARCHAR(512) NOT NULL,
    byte_length BIGINT UNSIGNED NOT NULL,
    document_json JSON NOT NULL,
    raw_text LONGTEXT NOT NULL,
    imported_at TIMESTAMP NOT NULL
        DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (content_hash),

    KEY idx_offchain_documents_kind (
        document_kind
    )
);
