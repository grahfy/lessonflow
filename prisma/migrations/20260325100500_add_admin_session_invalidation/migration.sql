-- Add dedicated admin session invalidation state so password changes can
-- revoke previously issued stateless cookies.
ALTER TABLE `AdminUser`
  ADD COLUMN `sessionInvalidBefore` DATETIME(3) NULL;
