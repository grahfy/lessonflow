import fs from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { prisma } from "../src/lib/db";
import { sendEmail } from "../src/lib/email/service";
import { ownerSystemUpdateTemplate } from "../src/lib/email/templates";
import { getOwnerEmail } from "../src/lib/env";

async function main() {
  // SHARED_DIR is passed from the update.sh script to point to the shared production storage.
  const sharedDataDir = process.env.SHARED_DIR 
    ? path.join(process.env.SHARED_DIR, "data", "deploy")
    : path.join(process.cwd(), ".data", "deploy");
    
  const updateFilePath = path.join(sharedDataDir, "latest-deploy-update.json");
  
  console.log(`Loading update metadata from: ${updateFilePath}`);
  
  let updateData;
  try {
    const raw = await readFile(updateFilePath, "utf8");
    updateData = JSON.parse(raw);
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
    commits: updateData.commits.map((c: any) => ({
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
    await prisma.$disconnect();
  });
