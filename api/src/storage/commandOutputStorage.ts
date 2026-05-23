import { createReadStream } from "fs";
import { appendFile, mkdir, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { Readable } from "stream";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type CommandOutputChunkInput = {
  workerId: string;
  transactionId: string;
  sequence: number;
  stream: "stdout" | "stderr";
  text: string;
  emittedAt: string;
};

export type CommandOutputMetadata = {
  outputObjectKey: string;
  outputBytes: number;
  outputStartedAt?: string;
  outputUpdatedAt?: string;
};

export type StoredCommandOutput = {
  body: Readable;
  contentType?: string;
};

export type CommandOutputStorage = {
  appendChunk(input: CommandOutputChunkInput): Promise<void>;
  completeCommand(workerId: string, transactionId: string): Promise<CommandOutputMetadata | undefined>;
  getOutput(objectKey: string): Promise<StoredCommandOutput>;
};

type CommandOutputState = {
  filePath: string;
  objectKey: string;
  outputStartedAt?: string;
  outputUpdatedAt?: string;
  seenSequences: Set<number>;
  pendingWrite: Promise<void>;
};

export function createCommandOutputStorageFromEnv(): CommandOutputStorage | undefined {
  const bucket = process.env.COMMAND_OUTPUT_BUCKET;
  if (!bucket) return undefined;

  return new S3CommandOutputStorage({
    bucket,
    region: process.env.AWS_REGION,
    prefix: process.env.COMMAND_OUTPUT_PREFIX,
    endpoint: process.env.S3_ENDPOINT_URL,
    forcePathStyle: parseBoolean(process.env.S3_FORCE_PATH_STYLE)
  });
}

export class S3CommandOutputStorage implements CommandOutputStorage {
  private readonly client: S3Client;
  private readonly states = new Map<string, CommandOutputState>();
  private readonly tempRoot = path.join(tmpdir(), "firstdraft-command-output");

  public constructor(private readonly options: { bucket: string; region?: string; prefix?: string; endpoint?: string; forcePathStyle?: boolean }) {
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle
    });
  }

  public async appendChunk(input: CommandOutputChunkInput): Promise<void> {
    const state = await this.getOrCreateState(input.workerId, input.transactionId);
    if (state.seenSequences.has(input.sequence)) return;

    const emittedAt = input.emittedAt || new Date().toISOString();
    state.outputStartedAt ??= emittedAt;
    state.outputUpdatedAt = emittedAt;

    const line = JSON.stringify({
      sequence: input.sequence,
      stream: input.stream,
      text: input.text,
      emittedAt
    }) + "\n";

    state.pendingWrite = state.pendingWrite.then(() => appendFile(state.filePath, line, "utf8"));
    await state.pendingWrite;
    state.seenSequences.add(input.sequence);
  }

  public async completeCommand(workerId: string, transactionId: string): Promise<CommandOutputMetadata | undefined> {
    const state = this.states.get(stateKey(workerId, transactionId));
    if (!state) return undefined;

    await state.pendingWrite;

    const fileStats = await stat(state.filePath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: state.objectKey,
        Body: createReadStream(state.filePath),
        ContentType: "application/x-ndjson"
      })
    );

    await rm(state.filePath, { force: true });
    this.states.delete(stateKey(workerId, transactionId));

    return {
      outputObjectKey: state.objectKey,
      outputBytes: fileStats.size,
      outputStartedAt: state.outputStartedAt,
      outputUpdatedAt: state.outputUpdatedAt
    };
  }

  public async getOutput(objectKey: string): Promise<StoredCommandOutput> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: objectKey
      })
    );

    if (!result.Body || !(result.Body instanceof Readable)) {
      throw new Error("S3 object body is not readable");
    }

    return {
      body: result.Body,
      contentType: result.ContentType
    };
  }

  private async getOrCreateState(workerId: string, transactionId: string): Promise<CommandOutputState> {
    const key = stateKey(workerId, transactionId);
    const existing = this.states.get(key);
    if (existing) return existing;

    await mkdir(this.tempRoot, { recursive: true });

    const objectKey = this.buildObjectKey(workerId, transactionId);
    const state: CommandOutputState = {
      filePath: path.join(this.tempRoot, `${sanitize(workerId)}-${sanitize(transactionId)}.ndjson`),
      objectKey,
      seenSequences: new Set<number>(),
      pendingWrite: Promise.resolve()
    };

    this.states.set(key, state);
    return state;
  }

  private buildObjectKey(workerId: string, transactionId: string): string {
    const prefix = normalizePrefix(this.options.prefix);
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

function parseBoolean(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
