-- Add dedicated customer session invalidation state so logout and credential
-- rotation can revoke previously issued stateless student portal cookies.
ALTER TABLE `Customer`
  ADD COLUMN `sessionInvalidBefore` DATETIME(3) NULL;
