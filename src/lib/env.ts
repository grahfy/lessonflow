export function getOwnerEmail(): string {
  return process.env.ADMIN_EMAIL || "owner@example.com";
}

export function getCronSecret(): string {
  return process.env.CRON_SECRET || "";
}
