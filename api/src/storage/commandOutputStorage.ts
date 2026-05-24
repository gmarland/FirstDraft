import { createReadStream } from "fs";
import { appendFile, mkdir, rm, stat } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { BlobServiceClient, StorageSharedKeyCredential } from "@azure/storage-blob";
import { Storage } from "@google-cloud/storage";

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

export type CommandOutputStorageProvider = "s3" | "gcs" | "azure";

export function createCommandOutputStorageFromEnv(): CommandOutputStorage | undefined {
  const bucket = process.env.COMMAND_OUTPUT_BUCKET;
  if (!bucket) return undefined;

  const provider = getCommandOutputStorageProviderFromEnv();

  if (provider === "azure") {
    return new AzureCommandOutputStorage({
      container: bucket,
      prefix: process.env.COMMAND_OUTPUT_PREFIX,
      connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
      accountName: process.env.AZURE_STORAGE_ACCOUNT_NAME,
      accountKey: process.env.AZURE_STORAGE_ACCOUNT_KEY
    });
  }

  if (provider === "gcs") {
    return new GcsCommandOutputStorage({
      bucket,
      prefix: process.env.COMMAND_OUTPUT_PREFIX,
      projectId: process.env.GCP_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT
    });
  }

  if (provider === "s3") {
    return new S3CommandOutputStorage({
      bucket,
      region: process.env.AWS_REGION,
      prefix: process.env.COMMAND_OUTPUT_PREFIX,
      endpoint: process.env.S3_ENDPOINT_URL,
      forcePathStyle: parseBoolean(process.env.S3_FORCE_PATH_STYLE)
    });
  }

  throw new Error(`Unsupported command output storage provider: ${provider}`);
}

export function getCommandOutputStorageProviderFromEnv(): CommandOutputStorageProvider {
  return parseStorageProvider(process.env.COMMAND_OUTPUT_STORAGE_PROVIDER);
}

export function parseStorageProvider(value: string | undefined): CommandOutputStorageProvider {
  const normalized = (value ?? "s3").trim().toLowerCase();
  if (normalized === "s3" || normalized === "aws") return "s3";
  if (normalized === "gcs" || normalized === "google") return "gcs";
  if (normalized === "azure" || normalized === "az") return "azure";
  throw new Error("Unsupported COMMAND_OUTPUT_STORAGE_PROVIDER. Expected one of: s3, aws, gcs, google, azure, az");
}

export abstract class BufferedCommandOutputStorage implements CommandOutputStorage {
  private readonly states = new Map<string, CommandOutputState>();
  private readonly tempRoot: string;

  public constructor(private readonly bufferOptions: { prefix?: string; tempRoot?: string } = {}) {
    this.tempRoot = bufferOptions.tempRoot ?? path.join(tmpdir(), "firstdraft-command-output");
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
    await this.uploadFile(state.objectKey, state.filePath);

    await rm(state.filePath, { force: true });
    this.states.delete(stateKey(workerId, transactionId));

    return {
      outputObjectKey: state.objectKey,
      outputBytes: fileStats.size,
      outputStartedAt: state.outputStartedAt,
      outputUpdatedAt: state.outputUpdatedAt
    };
  }

  public abstract getOutput(objectKey: string): Promise<StoredCommandOutput>;

  protected abstract uploadFile(objectKey: string, filePath: string): Promise<void>;

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
    const prefix = normalizePrefix(this.bufferOptions.prefix);
    return `${prefix}workers/${sanitize(workerId)}/commands/${sanitize(transactionId)}/output.ndjson`;
  }
}

export class S3CommandOutputStorage extends BufferedCommandOutputStorage {
  private readonly client: S3Client;

  public constructor(private readonly options: { bucket: string; region?: string; prefix?: string; endpoint?: string; forcePathStyle?: boolean; client?: S3Client }) {
    super({ prefix: options.prefix });
    this.client = options.client ?? new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle
    });
  }

  protected async uploadFile(objectKey: string, filePath: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: objectKey,
        Body: createReadStream(filePath),
        ContentType: "application/x-ndjson"
      })
    );
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
}

export class GcsCommandOutputStorage extends BufferedCommandOutputStorage {
  private readonly bucket: ReturnType<Storage["bucket"]>;

  public constructor(private readonly options: { bucket: string; prefix?: string; projectId?: string; storage?: Storage }) {
    super({ prefix: options.prefix });
    const storage = options.storage ?? new Storage({ projectId: options.projectId });
    this.bucket = storage.bucket(options.bucket);
  }

  protected async uploadFile(objectKey: string, filePath: string): Promise<void> {
    const file = this.bucket.file(objectKey);
    await pipeline(
      createReadStream(filePath),
      file.createWriteStream({
        metadata: {
          contentType: "application/x-ndjson"
        }
      })
    );
  }

  public async getOutput(objectKey: string): Promise<StoredCommandOutput> {
    const file = this.bucket.file(objectKey);
    const [metadata] = await file.getMetadata();

    return {
      body: file.createReadStream(),
      contentType: typeof metadata.contentType === "string" ? metadata.contentType : undefined
    };
  }
}

export class AzureCommandOutputStorage extends BufferedCommandOutputStorage {
  private serviceClient?: BlobServiceClient;
  private readonly containerClient: ReturnType<BlobServiceClient["getContainerClient"]>;

  public constructor(private readonly options: {
    container: string;
    prefix?: string;
    connectionString?: string;
    accountName?: string;
    accountKey?: string;
    serviceClient?: BlobServiceClient;
  }) {
    super({ prefix: options.prefix });
    this.serviceClient = options.serviceClient;
    this.containerClient = this.getServiceClient().getContainerClient(options.container);
  }

  protected async uploadFile(objectKey: string, filePath: string): Promise<void> {
    const blob = this.containerClient.getBlockBlobClient(objectKey);
    await blob.uploadFile(filePath, {
      blobHTTPHeaders: {
        blobContentType: "application/x-ndjson"
      }
    });
  }

  public async getOutput(objectKey: string): Promise<StoredCommandOutput> {
    const blob = this.containerClient.getBlockBlobClient(objectKey);
    const result = await blob.download();

    if (!result.readableStreamBody || !(result.readableStreamBody instanceof Readable)) {
      throw new Error("Azure blob body is not readable");
    }

    return {
      body: result.readableStreamBody,
      contentType: result.contentType
    };
  }

  private getServiceClient(): BlobServiceClient {
    if (this.serviceClient) return this.serviceClient;

    if (this.options.connectionString) {
      this.serviceClient = BlobServiceClient.fromConnectionString(this.options.connectionString);
      return this.serviceClient;
    }

    if (this.options.accountName && this.options.accountKey) {
      const credential = new StorageSharedKeyCredential(this.options.accountName, this.options.accountKey);
      this.serviceClient = new BlobServiceClient(`https://${this.options.accountName}.blob.core.windows.net`, credential);
      return this.serviceClient;
    }

    throw new Error("Azure command output storage requires AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY");
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
