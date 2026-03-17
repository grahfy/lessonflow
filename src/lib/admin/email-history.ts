export type EmailRecordDirection = "inbound" | "outbound";

export interface EmailRecord {
  id: string;
  fromEmail: string;
  toEmail: string;
  subject: string;
  htmlBody?: string;
  textBody?: string;
  status: string;
  provider?: string;
  source?: string;
  error?: string;
  createdAt: string;
  direction: EmailRecordDirection;
}

export type EmailRefreshResult = {
  ok: boolean;
  gmail?: {
    importedCount: number;
    skippedCount: number;
  };
  imap?: {
    importedCount: number;
    skippedCount: number;
  };
};

export function getEmailSourceLabel(source?: string): string | null {
  switch (source) {
    case "app":
      return "via App";
    case "gmail":
      return "via Gmail";
    case "imap":
      return "via IMAP";
    default:
      return source ? `via ${source}` : null;
  }
}
