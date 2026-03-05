import fs from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";

type UpdateCommit = {
  shortHash: string;
  authorName: string;
  subject: string;
  authoredAt: string;
};

type UpdateData = {
  appliedAt: string;
  commit: string;
  shortCommit: string;
  branch: string;
  commits: UpdateCommit[];
};

type PrismaClientLike = {
  $disconnect(): Promise<void>;
};

let prismaClient: PrismaClientLike | null = null;

function loadRuntimeEnv(): void {
  const candidatePaths = [
    process.env.SHARED_DIR ? path.join(process.env.SHARED_DIR, ".env") : null,
    path.join(process.cwd(), ".env")
  ];
  const loadedPaths = new Set<string>();

  for (const envPath of candidatePaths) {
    if (!envPath || loadedPaths.has(envPath) || !fs.existsSync(envPath)) {
      continue;
    }

    const result = dotenv.config({ path: envPath, override: false });
    if (result.error) {
      console.warn(`Failed to load env file at ${envPath}: ${result.error.message}`);
      continue;
    }

    loadedPaths.add(envPath);
    console.log(`Loaded environment from: ${envPath}`);
  }
}

function parseUpdateData(raw: string): UpdateData {
  const parsed: unknown = JSON.parse(raw);

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Update metadata is not a JSON object.");
  }

  const candidate = parsed as Partial<UpdateData>;
  const commits = Array.isArray(candidate.commits) ? candidate.commits : [];

  return {
    appliedAt: String(candidate.appliedAt || ""),
    commit: String(candidate.commit || ""),
    shortCommit: String(candidate.shortCommit || ""),
    branch: String(candidate.branch || ""),
    commits: commits.map((commit) => ({
      shortHash: String(commit?.shortHash || ""),
      authorName: String(commit?.authorName || ""),
      subject: String(commit?.subject || ""),
      authoredAt: String(commit?.authoredAt || "")
    }))
  };
}

async function main() {
  loadRuntimeEnv();

  const [{ prisma }, { sendEmail }, { ownerSystemUpdateTemplate }, { getOwnerEmail }] =
    await Promise.all([
      import("../src/lib/db"),
      import("../src/lib/email/service"),
      import("../src/lib/email/templates"),
      import("../src/lib/env")
    ]);
  prismaClient = prisma;

  // SHARED_DIR is passed from the update.sh script to point to the shared production storage.
  const sharedDataDir = process.env.SHARED_DIR
    ? path.join(process.env.SHARED_DIR, "data", "deploy")
    : path.join(process.cwd(), ".data", "deploy");

  const updateFilePath = path.join(sharedDataDir, "latest-deploy-update.json");

  console.log(`Loading update metadata from: ${updateFilePath}`);

  let updateData: UpdateData;
  try {
    const raw = await readFile(updateFilePath, "utf8");
    updateData = parseUpdateData(raw);
  } catch (error) {
    console.error(`Failed to read update metadata: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  const adminEmail = process.env.ADMIN_EMAIL || getOwnerEmail();
  if (!adminEmail) {
    console.error("ADMIN_EMAIL not set in environment or env.ts");
    process.exit(1);
  }

  console.log(`Sending update notification to: ${adminEmail}`);

  const template = ownerSystemUpdateTemplate({
    appliedAt: new Date(updateData.appliedAt),
    commit: updateData.commit,
    shortCommit: updateData.shortCommit,
    branch: updateData.branch,
    commits: updateData.commits
  });

  const result = await sendEmail({
    to: adminEmail,
    subject: template.subject,
    html: template.html
  });

  if (result.status === "sent") {
    console.log("Update notification email sent successfully.");
  } else if (result.status === "queued_no_smtp") {
    console.log("Update notification email queued (SMTP not configured).");
  } else {
    console.error(`Failed to send update notification email: ${result.error}`);
  }

  // Create a public announcement file that the student portal can fetch.
  const announcementPath = path.join(process.cwd(), "public", "latest-announcement.json");
  const announcement = {
    appliedAt: updateData.appliedAt,
    shortCommit: updateData.shortCommit,
    commits: updateData.commits.map((c) => ({
      subject: c.subject,
      authoredAt: c.authoredAt
    }))
  };

  try {
    fs.writeFileSync(announcementPath, JSON.stringify(announcement, null, 2), "utf8");
    console.log(`Public announcement file updated: ${announcementPath}`);
  } catch (error) {
    console.error(`Failed to write public announcement: ${error}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    if (prismaClient) {
      await prismaClient.$disconnect();
    }
  });
