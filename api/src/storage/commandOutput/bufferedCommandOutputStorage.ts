import { appendFile, mkdir, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import type {
  CommandOutputChunkInput,
  CommandOutputMetadata,
  CommandOutputStorage,
  StoredCommandOutput,
} from "./types.js";

type CommandOutputState = {
  filePath: string;
  objectKey: string;
  outputStartedAt?: string;
  outputUpdatedAt?: string;
  seenSequences: Set<number>;
  pendingWrite: Promise<void>;
};

export abstract class BufferedCommandOutputStorage
  implements CommandOutputStorage
{
  private readonly states = new Map<string, CommandOutputState>();
  private readonly tempRoot: string;

  public constructor(
    private readonly bufferOptions: { prefix?: string; tempRoot?: string } = {},
  ) {
    this.tempRoot =
      bufferOptions.tempRoot ??
      path.join(tmpdir(), "firstdraft-command-output");
  }

  public async appendChunk(input: CommandOutputChunkInput): Promise<void> {
    const state = await this.getOrCreateState(
      input.workerId,
      input.transactionId,
    );
    if (state.seenSequences.has(input.sequence)) return;

    const emittedAt = input.emittedAt || new Date().toISOString();
    state.outputStartedAt ??= emittedAt;
    state.outputUpdatedAt = emittedAt;

    const line =
      JSON.stringify({
        sequence: input.sequence,
        stream: input.stream,
        text: input.text,
        emittedAt,
      }) + "\n";

    state.pendingWrite = state.pendingWrite.then(() =>
      appendFile(state.filePath, line, "utf8"),
    );
    await state.pendingWrite;
    state.seenSequences.add(input.sequence);
  }

  public async completeCommand(
    workerId: string,
    transactionId: string,
  ): Promise<CommandOutputMetadata | undefined> {
    const state = this.states.get(stateKey(workerId, transactionId));
    if (!state) return undefined;

    await state.pendingWrite;

    const fileStats = await stat(state.filePath);
    await this.uploadFile(state.objectKey, state.filePath);

    await rm(state.filePath, { force: true });
    this.states.delete(stateKey(workerId, transactionId));

    return {
      outputObjectKey: state.objectKey,
      outputBytes: fileStats.size,
      outputStartedAt: state.outputStartedAt,
      outputUpdatedAt: state.outputUpdatedAt,
    };
  }

  public abstract getOutput(objectKey: string): Promise<StoredCommandOutput>;

  protected abstract uploadFile(
    objectKey: string,
    filePath: string,
  ): Promise<void>;

  private async getOrCreateState(
    workerId: string,
    transactionId: string,
  ): Promise<CommandOutputState> {
    const key = stateKey(workerId, transactionId);
    const existing = this.states.get(key);
    if (existing) return existing;

    await mkdir(this.tempRoot, { recursive: true });

    const objectKey = this.buildObjectKey(workerId, transactionId);
    const state: CommandOutputState = {
      filePath: path.join(
        this.tempRoot,
        `${sanitize(workerId)}-${sanitize(transactionId)}.ndjson`,
      ),
      objectKey,
      seenSequences: new Set<number>(),
      pendingWrite: Promise.resolve(),
    };

    this.states.set(key, state);
    return state;
  }

  private buildObjectKey(workerId: string, transactionId: string): string {
    const prefix = normalizePrefix(this.bufferOptions.prefix);
    return `${prefix}workers/${sanitize(workerId)}/commands/${sanitize(transactionId)}/output.ndjson`;
  }
}

function stateKey(workerId: string, transactionId: string): string {
  return `${workerId}:${transactionId}`;
}

function normalizePrefix(prefix?: string): string {
  if (!prefix) return "";
  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}

function sanitize(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}
