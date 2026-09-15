import { Sandbox } from "@vercel/sandbox";
import {
  KAI_CODING_POLICY,
  authorizeCommand,
  safeWorkspacePath,
  type CodingCheckpoint,
  type CodingEnvironment,
  type CodingEnvironmentProvider,
  type CommandResult,
} from "@zeus/runtime/coding";

const ROOT = "/vercel/sandbox";
const REPOSITORY_ROOT = "repo";

function bounded(value: string): string {
  return value.slice(0, KAI_CODING_POLICY.maxOutputBytes);
}

export class VercelCodingEnvironmentProvider implements CodingEnvironmentProvider {
  async create(input: {
    readonly workspaceId: string;
    readonly runId: string;
    readonly repositoryUrl?: string;
    readonly revision?: string;
    readonly signal?: AbortSignal;
  }): Promise<CodingEnvironment> {
    input.signal?.throwIfAborted();
    let sandbox = await Sandbox.create({
      persistent: false,
      timeout: 10 * 60_000,
      networkPolicy: input.repositoryUrl ? "allow-all" : "deny-all",
    });

    if (input.repositoryUrl) {
      const args = ["clone", "--depth", "1"];
      if (input.revision) args.push("--branch", input.revision);
      args.push(input.repositoryUrl, REPOSITORY_ROOT);
      const clone = await sandbox.runCommand("git", args);
      if (clone.exitCode !== 0) {
        const detail = bounded(await clone.stderr());
        await sandbox.stop();
        throw new Error(`Repository clone failed: ${detail}`);
      }
      await sandbox.update({ networkPolicy: "deny-all" });
    }

    const environment: CodingEnvironment = {
      id: sandbox.name,
      workspaceId: input.workspaceId,
      runId: input.runId,
      root: ROOT,
      async run(request) {
        const authorized = authorizeCommand(request);
        input.signal?.throwIfAborted();
        const startedAt = Date.now();
        const result = await sandbox.runCommand({
          cmd: authorized.argv[0]!,
          args: [...authorized.argv.slice(1)],
          cwd: authorized.cwd ? `${ROOT}/${safeWorkspacePath(authorized.cwd)}` : ROOT,
        });
        return {
          exitCode: result.exitCode,
          stdout: bounded(await result.stdout()),
          stderr: bounded(await result.stderr()),
          durationMs: Date.now() - startedAt,
        } satisfies CommandResult;
      },
      async readFile(path) {
        const content = await sandbox.readFileToBuffer({ path: safeWorkspacePath(path) });
        if (!content) throw new Error("Sandbox file not found.");
        return bounded(content.toString("utf8"));
      },
      async writeFile(path, content) {
        const safePath = safeWorkspacePath(path);
        await sandbox.writeFiles([{ path: safePath, content: Buffer.from(content, "utf8") }]);
      },
      async checkpoint(label) {
        const snapshot = await sandbox.snapshot();
        return {
          id: snapshot.snapshotId,
          createdAt: new Date().toISOString(),
          label: label.slice(0, 160),
        } satisfies CodingCheckpoint;
      },
      async restore(checkpointId) {
        await sandbox.stop();
        sandbox = await Sandbox.create({
          persistent: false,
          timeout: 10 * 60_000,
          networkPolicy: "deny-all",
          source: { type: "snapshot", snapshotId: checkpointId },
        });
      },
      async destroy() {
        await sandbox.stop();
      },
    };
    return environment;
  }
}
