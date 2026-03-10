const { execFileSync } = require("node:child_process");

const CRON_SECRET = process.env.CRON_SECRET || "test-secret";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000";

const payload = {
  branch: "main",
  release: "20260310120000",
  commit: "test-commit-hash-1",
  shortCommit: "test-c1",
  previousCommit: null,
  appliedAt: new Date().toISOString(),
  commits: [
    {
      hash: "test-commit-hash-1",
      shortHash: "test-c1",
      authorName: "Tester",
      authoredAt: new Date().toISOString(),
      subject: "Test Commit 1",
      body: "This is a test commit body."
    }
  ]
};

async function test() {
  console.log("Testing deployment recording...");
  
  // 1. Record a deployment
  const recordResponse = await fetch(`${SITE_URL}/api/admin/deploy-updates/record`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${CRON_SECRET}`
    },
    body: JSON.stringify(payload)
  });

  const recordResult = await recordResponse.json();
  console.log("Record Response:", recordResponse.status, recordResult);

  if (recordResponse.status !== 200) {
    console.error("Failed to record deployment");
    process.exit(1);
  }

  // Note: We can't easily test the GET endpoints here without a valid admin session cookie
  // unless we mock the admin session or run this in a context where we have one.
  // For now, confirming the record API works is a huge step.
  
  console.log("\nPhase 1 Infrastructure verification (Backend) complete.");
}

test().catch(console.error);
