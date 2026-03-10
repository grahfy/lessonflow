import { describe, expect, it, vi } from "vitest";
import { getUpdateStatus, getPendingCommits } from "@/lib/services/updates-service";
import { exec } from "node:child_process";

// Mock child_process.exec
vi.mock("node:child_process", () => ({
  exec: vi.fn()
}));

describe("updates-service", () => {
  describe("getUpdateStatus", () => {
    it("returns updateAvailable: true when remote has new commits", async () => {
      // Mock git rev-parse HEAD (local) and git rev-parse origin/main (remote)
      // We'll mock exec to return different SHAs
      (exec as any).mockImplementation((cmd: string, callback: any) => {
        if (cmd.includes("rev-parse HEAD")) {
          callback(null, { stdout: "local-sha\n" });
        } else if (cmd.includes("rev-parse origin/main")) {
          callback(null, { stdout: "remote-sha\n" });
        } else if (cmd.includes("fetch")) {
          callback(null, { stdout: "" });
        }
      });

      const status = await getUpdateStatus(true);
      expect(status.updateAvailable).toBe(true);
      expect(status.localSha).toBe("local-sha");
      expect(status.remoteSha).toBe("remote-sha");
    });

    it("returns updateAvailable: false when local and remote SHAs match", async () => {
      (exec as any).mockImplementation((cmd: string, callback: any) => {
        if (cmd.includes("rev-parse HEAD")) {
          callback(null, { stdout: "same-sha\n" });
        } else if (cmd.includes("rev-parse origin/main")) {
          callback(null, { stdout: "same-sha\n" });
        } else if (cmd.includes("fetch")) {
          callback(null, { stdout: "" });
        }
      });

      const status = await getUpdateStatus(true);
      expect(status.updateAvailable).toBe(false);
    });
  });

  describe("getPendingCommits", () => {
    it("returns a list of commits between local and remote", async () => {
      const mockLogOutput = [
        "hash1|Author One|2026-03-10|Message one",
        "hash2|Author Two|2026-03-09|Message two"
      ].join("\n");

      (exec as any).mockImplementation((cmd: string, callback: any) => {
        if (cmd.includes("log")) {
          callback(null, { stdout: mockLogOutput + "\n" });
        }
      });

      const commits = await getPendingCommits("local-sha", "remote-sha");
      expect(commits).toHaveLength(2);
      expect(commits[0]).toEqual({
        sha: "hash1",
        author: "Author One",
        date: "2026-03-10",
        message: "Message one"
      });
    });
  });
});
