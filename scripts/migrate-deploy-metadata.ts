import { prisma } from "../src/lib/db";
import { readLatestDeployUpdate } from "../src/lib/deploy-updates";

async function migrate() {
  console.log("Migrating existing deployment JSON to database...");
  
  const latest = await readLatestDeployUpdate();
  if (!latest) {
    console.log("No JSON metadata found to migrate.");
    return;
  }

  console.log(`Found deployment for commit: ${latest.commit}`);

  try {
    const deployUpdate = await prisma.deployUpdate.upsert({
      where: { commit: latest.commit },
      update: {
        branch: latest.branch,
        release: latest.release,
        appliedAt: new Date(latest.appliedAt),
        shortCommit: latest.shortCommit,
        previousCommit: latest.previousCommit,
      },
      create: {
        branch: latest.branch,
        release: latest.release,
        appliedAt: new Date(latest.appliedAt),
        commit: latest.commit,
        shortCommit: latest.shortCommit,
        previousCommit: latest.previousCommit,
      },
    });

    await prisma.deployCommit.deleteMany({
      where: { deployUpdateId: deployUpdate.id },
    });

    if (Array.isArray(latest.commits) && latest.commits.length > 0) {
      await prisma.deployCommit.createMany({
        data: latest.commits.map((c) => ({
          deployUpdateId: deployUpdate.id,
          hash: c.hash,
          shortHash: c.shortHash,
          authorName: c.authorName,
          authoredAt: new Date(c.authoredAt),
          subject: c.subject,
          body: c.body || null,
        })),
      });
    }

    console.log("Migration successful.");
  } catch (err: any) {
    console.error("Migration failed:", err.message);
  }
}

migrate().catch(console.error).finally(() => process.exit(0));
