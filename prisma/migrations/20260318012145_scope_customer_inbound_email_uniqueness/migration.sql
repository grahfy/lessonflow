DROP INDEX `CustomerInboundEmail_provider_externalId_key` ON `CustomerInboundEmail`;

CREATE UNIQUE INDEX `CustomerInboundEmail_customerId_provider_externalId_key`
  ON `CustomerInboundEmail`(`customerId`, `provider`, `externalId`);

CREATE INDEX `CustomerInboundEmail_provider_externalId_idx`
  ON `CustomerInboundEmail`(`provider`, `externalId`);
