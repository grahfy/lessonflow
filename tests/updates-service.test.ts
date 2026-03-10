import { describe, expect, it, vi } from "vitest";
import { getUpdateStatus, getPendingCommits } from "@/lib/services/updates-service";
import { exec } from "node:child_process";

// Mock child_process.exec
vi.mock("node:child_process", () => ({
  exec: vi.fn()
}));

// Mock util.promisify to return the exec mock directly
vi.mock("node:util", () => ({
  promisify: vi.fn((fn) => fn)
}));

describe("updates-service", () => {
  describe("getUpdateStatus", () => {
    it("returns updateAvailable: true when remote has new commits", async () => {
      // Mock git rev-parse HEAD (local) and git rev-parse origin/main (remote)
      (exec as any).mockImplementation((cmd: string) => {
        if (cmd.includes("rev-parse HEAD")) {
          return Promise.resolve({ stdout: "local-sha\n" });
        } else if (cmd.includes("rev-parse origin/main")) {
          return Promise.resolve({ stdout: "remote-sha\n" });
        } else if (cmd.includes("fetch")) {
          return Promise.resolve({ stdout: "" });
        }
        return Promise.resolve({ stdout: "" });
      });

      const status = await getUpdateStatus(true);
      expect(status.updateAvailable).toBe(true);
      expect(status.localSha).toBe("local-sha");
      expect(status.remoteSha).toBe("remote-sha");
    });

    it("returns updateAvailable: false when local and remote SHAs match", async () => {
      (exec as any).mockImplementation((cmd: string) => {
        if (cmd.includes("rev-parse HEAD")) {
          return Promise.resolve({ stdout: "same-sha\n" });
        } else if (cmd.includes("rev-parse origin/main")) {
          return Promise.resolve({ stdout: "same-sha\n" });
        } else if (cmd.includes("fetch")) {
          return Promise.resolve({ stdout: "" });
        }
        return Promise.resolve({ stdout: "" });
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

      (exec as any).mockImplementation((cmd: string) => {
        if (cmd.includes("log")) {
          return Promise.resolve({ stdout: mockLogOutput + "\n" });
        }
        return Promise.resolve({ stdout: "" });
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
