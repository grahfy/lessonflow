SET @customer_inbound_email_table_exists := (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'CustomerInboundEmail'
);

SET @customer_inbound_email_old_unique_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'CustomerInboundEmail'
    AND INDEX_NAME = 'CustomerInboundEmail_provider_externalId_key'
);

SET @customer_inbound_email_scoped_unique_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'CustomerInboundEmail'
    AND INDEX_NAME = 'CustomerInboundEmail_customerId_provider_externalId_key'
);

SET @customer_inbound_email_lookup_idx_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'CustomerInboundEmail'
    AND INDEX_NAME = 'CustomerInboundEmail_provider_externalId_idx'
);

SET @customer_inbound_email_sql := IF(
  @customer_inbound_email_table_exists > 0
  AND @customer_inbound_email_old_unique_exists > 0,
  'DROP INDEX `CustomerInboundEmail_provider_externalId_key` ON `CustomerInboundEmail`',
  'SELECT 1'
);
PREPARE customer_inbound_email_stmt FROM @customer_inbound_email_sql;
EXECUTE customer_inbound_email_stmt;
DEALLOCATE PREPARE customer_inbound_email_stmt;

SET @customer_inbound_email_sql := IF(
  @customer_inbound_email_table_exists > 0
  AND @customer_inbound_email_scoped_unique_exists = 0,
  'CREATE UNIQUE INDEX `CustomerInboundEmail_customerId_provider_externalId_key` ON `CustomerInboundEmail`(`customerId`, `provider`, `externalId`)',
  'SELECT 1'
);
PREPARE customer_inbound_email_stmt FROM @customer_inbound_email_sql;
EXECUTE customer_inbound_email_stmt;
DEALLOCATE PREPARE customer_inbound_email_stmt;

SET @customer_inbound_email_sql := IF(
  @customer_inbound_email_table_exists > 0
  AND @customer_inbound_email_lookup_idx_exists = 0,
  'CREATE INDEX `CustomerInboundEmail_provider_externalId_idx` ON `CustomerInboundEmail`(`provider`, `externalId`)',
  'SELECT 1'
);
PREPARE customer_inbound_email_stmt FROM @customer_inbound_email_sql;
EXECUTE customer_inbound_email_stmt;
DEALLOCATE PREPARE customer_inbound_email_stmt;
