import { ImapFlow } from "imapflow";

import { getImapConfig } from "@/lib/env";

/**
 * Creates a configured IMAP client for inbox polling.
 */
export function createImapClient(): ImapFlow {
  const config = getImapConfig();

  return new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass
    },
    logger: false
  });
}
