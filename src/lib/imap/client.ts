import { ImapFlow } from "imapflow";

import { getImapConfig } from "@/lib/env";

/**
 * Creates a configured IMAP client for inbox polling.
 */
export function createImapClient(): ImapFlow {
  const config = getImapConfig();

  // Refuse to send credentials in clear text in production. `IMAP_TLS=false`
  // remains usable in non-production environments for local testing.
  if (!config.secure && process.env.NODE_ENV === "production") {
    throw new Error(
      "IMAP TLS is disabled (IMAP_TLS=false) but plaintext IMAP is not permitted in production."
    );
  }

  return new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    // Always verify certificates and require a modern TLS version. ImapFlow
    // forwards these to the underlying TLS socket (used when `secure` is true
    // and for STARTTLS upgrades).
    tls: {
      rejectUnauthorized: true,
      minVersion: "TLSv1.2"
    },
    auth: {
      user: config.user,
      pass: config.pass
    },
    logger: false
  });
}
