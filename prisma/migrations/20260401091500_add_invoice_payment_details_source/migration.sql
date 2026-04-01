ALTER TABLE `Invoice`
  ADD COLUMN `paymentDetailsSource` ENUM('system', 'custom') NOT NULL DEFAULT 'system'
  AFTER `bankAccountNumber`;
