const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// Mocking the environment variables that deploy.sh would pass
const CRON_SECRET = "change-me-too";
const SITE_URL = "http://127.0.0.1:3000";
const repoRoot = process.cwd();
const outputFile = path.join(repoRoot, "latest-deploy-update-test.json");
const commit = "test-phase-2-commit";
const branch = "main";

const payload = {
  app: "lessonflow",
  branch,
  release: "phase-2-test",
  appliedAt: new Date().toISOString(),
  commit,
  shortCommit: "ph2-c1",
  previousCommit: "test-commit-hash-1",
  commits: [
    {
      hash: commit,
      shortHash: "ph2-c1",
      authorName: "Tester Phase 2",
      authoredAt: new Date().toISOString(),
      subject: "Test Phase 2",
      body: "Testing the curl call from the deploy script logic."
    }
  ]
};

async function test() {
  console.log("Simulating deploy.sh recording logic...");

  // 1. Write to local JSON file
  try {
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2) + "\n", "utf8");
    console.log("JSON file written to:", outputFile);
  } catch (err) {
    console.error("Failed to write JSON:", err.message);
  }

  // 2. Record in database via API (simulating the curl call in deploy.sh)
  if (CRON_SECRET && SITE_URL) {
    const url = `${SITE_URL.replace(/\/+$/, "")}/api/admin/deploy-updates/record`;
    try {
      const data = JSON.stringify(payload);
      execFileSync("curl", [
        "-X", "POST",
        "-H", "Content-Type: application/json",
        "-H", `Authorization: Bearer ${CRON_SECRET}`,
        "-d", data,
        "--silent",
        "--max-time", "10",
        url
      ]);
      console.log("API call via curl successful.");
    } catch (err) {
      console.error("Failed to record via curl:", err.message);
      process.exit(1);
    }
  }

  console.log("\nPhase 2 Deployment Integration verification complete.");
}

test().catch(console.error);
