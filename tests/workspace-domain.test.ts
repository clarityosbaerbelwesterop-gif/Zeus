import { describe, expect, it } from "vitest";
import {
  MAX_INLINE_FILE_BYTES,
  can,
  canTransitionTask,
  deriveAgentPresence,
  fileStorageKey,
  isMemoryType,
  normalizeSearchQuery,
  normalizeSequence,
  safeFileName,
  validateUpload,
} from "../packages/workspace/src/index.js";

describe("Workspace OS permissions", () => {
  it("keeps viewers read only", () => {
    expect(can("viewer", "workspace.read")).toBe(true);
    expect(can("viewer", "task.read")).toBe(true);
    expect(can("viewer", "file.read")).toBe(true);
    expect(can("viewer", "task.write")).toBe(false);
    expect(can("viewer", "file.write")).toBe(false);
    expect(can("viewer", "workspace.manage")).toBe(false);
    expect(can("viewer", "member.manage")).toBe(false);
  });

  it("allows members to work without granting administration", () => {
    expect(can("member", "conversation.write")).toBe(true);
    expect(can("member", "memory.write")).toBe(true);
    expect(can("member", "workspace.manage")).toBe(false);
    expect(can("admin", "workspace.manage")).toBe(true);
    expect(can("owner", "member.manage")).toBe(true);
  });
});

describe("Workspace OS task lifecycle", () => {
  it("supports deliberate forward and repair transitions", () => {
    expect(canTransitionTask("backlog", "ready")).toBe(true);
    expect(canTransitionTask("ready", "in_progress")).toBe(true);
    expect(canTransitionTask("in_progress", "review")).toBe(true);
    expect(canTransitionTask("review", "completed")).toBe(true);
    expect(canTransitionTask("completed", "in_progress")).toBe(true);
  });

  it("rejects status jumps that bypass the workflow", () => {
    expect(canTransitionTask("backlog", "completed")).toBe(false);
    expect(canTransitionTask("ready", "completed")).toBe(false);
  });
});

describe("Workspace OS memory and plans", () => {
  it("accepts only explicit durable memory classes", () => {
    for (const type of ["goal", "decision", "fact", "preference", "constraint", "project_context"]) {
      expect(isMemoryType(type)).toBe(true);
    }
    expect(isMemoryType("raw_chat_dump")).toBe(false);
    expect(isMemoryType("chain_of_thought")).toBe(false);
  });

  it("orders persisted plan steps deterministically", () => {
    expect(
      normalizeSequence([{ sequence: 4 }, { sequence: 1 }, { sequence: 3 }]).map(
        (step) => step.sequence,
      ),
    ).toEqual([1, 3, 4]);
  });
});

describe("Workspace OS presence", () => {
  const now = new Date("2026-09-14T20:00:00Z");

  it("derives presence only from persisted run state", () => {
    expect(deriveAgentPresence(undefined, now)).toBe("idle");
    expect(deriveAgentPresence({ status: "queued", createdAt: now }, now)).toBe("thinking");
    expect(deriveAgentPresence({ status: "running", createdAt: now }, now)).toBe("working");
    expect(deriveAgentPresence({ status: "waiting", createdAt: now }, now)).toBe("waiting");
    expect(deriveAgentPresence({ status: "failed", createdAt: now }, now)).toBe("blocked");
    expect(
      deriveAgentPresence(
        { status: "completed", createdAt: now, completedAt: new Date("2026-09-14T19:55:00Z") },
        now,
      ),
    ).toBe("completed");
    expect(
      deriveAgentPresence(
        { status: "completed", createdAt: now, completedAt: new Date("2026-09-14T18:00:00Z") },
        now,
      ),
    ).toBe("idle");
  });
});

describe("Workspace OS file security", () => {
  it("normalizes safe file names without accepting user-controlled paths", () => {
    expect(safeFileName("brief.pdf")).toBe("brief.pdf");
    expect(() => safeFileName("../../secret.txt")).toThrow(/filename/iu);
    expect(() => safeFileName("folder\\payload.txt")).toThrow(/filename/iu);
    expect(() => safeFileName(".env")).toThrow(/Hidden/iu);
    expect(() => safeFileName("payload.exe")).toThrow(/Executable/iu);
  });

  it("bounds uploads and blocks executable MIME types", () => {
    expect(
      validateUpload({ filename: "requirements.pdf", contentType: "application/pdf", size: 1024 }),
    ).toBe("requirements.pdf");
    expect(() =>
      validateUpload({
        filename: "large.txt",
        contentType: "text/plain",
        size: MAX_INLINE_FILE_BYTES + 1,
      }),
    ).toThrow(/at most/iu);
    expect(() =>
      validateUpload({ filename: "payload.bin", contentType: "application/x-msdownload", size: 20 }),
    ).toThrow(/Unsupported/iu);
  });

  it("derives storage keys from validated workspace/file identities", () => {
    expect(
      fileStorageKey(
        "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      ),
    ).toBe(
      "workspace/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/files/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    );
    expect(() => fileStorageKey("../../a", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb")).toThrow(
      /storage identity/iu,
    );
  });
});

describe("Workspace OS search", () => {
  it("normalizes and bounds user search strings", () => {
    expect(normalizeSearchQuery("  OAuth   provider\n registry  ")).toBe("OAuth provider registry");
    expect(normalizeSearchQuery("x".repeat(500))).toHaveLength(120);
  });
});
