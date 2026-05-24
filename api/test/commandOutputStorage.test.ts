import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import {
  AzureCommandOutputStorage,
  BufferedCommandOutputStorage,
  createCommandOutputStorageFromEnv,
  GcsCommandOutputStorage,
  S3CommandOutputStorage,
  StoredCommandOutput
} from "../src/storage/commandOutputStorage.js";

type Upload = {
  objectKey: string;
  body: string;
};

class FakeBufferedCommandOutputStorage extends BufferedCommandOutputStorage {
  public readonly uploads: Upload[] = [];

  public constructor(tempRoot: string, prefix?: string) {
    super({ prefix, tempRoot });
  }

  public async getOutput(objectKey: string): Promise<StoredCommandOutput> {
    const upload = this.uploads.find((candidate) => candidate.objectKey === objectKey);
    if (!upload) throw new Error("object not found");

    return {
      body: Readable.from(upload.body),
      contentType: "application/x-ndjson"
    };
  }

  public async deleteOutput(objectKey: string): Promise<void> {
    const index = this.uploads.findIndex((candidate) => candidate.objectKey === objectKey);
    if (index >= 0) {
      this.uploads.splice(index, 1);
    }
  }

  protected async uploadFile(objectKey: string, filePath: string): Promise<void> {
    this.uploads.push({
      objectKey,
      body: await readFile(filePath, "utf8")
    });
  }
}

async function withEnv(input: Record<string, string | undefined>, test: () => void | Promise<void>): Promise<void> {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(input)) {
    previous.set(key, process.env[key]);
    const value = input[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    await test();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function testFactoryReturnsUndefinedWithoutBucket(): Promise<void> {
  await withEnv({ COMMAND_OUTPUT_BUCKET: undefined, COMMAND_OUTPUT_STORAGE_PROVIDER: "gcs" }, () => {
    assert.equal(createCommandOutputStorageFromEnv(), undefined);
  });
}

async function testFactoryDefaultsToS3(): Promise<void> {
  await withEnv({ COMMAND_OUTPUT_BUCKET: "bucket", COMMAND_OUTPUT_STORAGE_PROVIDER: undefined }, () => {
    assert.ok(createCommandOutputStorageFromEnv() instanceof S3CommandOutputStorage);
  });
}

async function testFactorySelectsS3Aliases(): Promise<void> {
  await withEnv({ COMMAND_OUTPUT_BUCKET: "bucket", COMMAND_OUTPUT_STORAGE_PROVIDER: "s3" }, () => {
    assert.ok(createCommandOutputStorageFromEnv() instanceof S3CommandOutputStorage);
  });

  await withEnv({ COMMAND_OUTPUT_BUCKET: "bucket", COMMAND_OUTPUT_STORAGE_PROVIDER: "aws" }, () => {
    assert.ok(createCommandOutputStorageFromEnv() instanceof S3CommandOutputStorage);
  });
}

async function testFactorySelectsGcsAliases(): Promise<void> {
  await withEnv({ COMMAND_OUTPUT_BUCKET: "bucket", COMMAND_OUTPUT_STORAGE_PROVIDER: "gcs" }, () => {
    assert.ok(createCommandOutputStorageFromEnv() instanceof GcsCommandOutputStorage);
  });

  await withEnv({ COMMAND_OUTPUT_BUCKET: "bucket", COMMAND_OUTPUT_STORAGE_PROVIDER: "google" }, () => {
    assert.ok(createCommandOutputStorageFromEnv() instanceof GcsCommandOutputStorage);
  });
}

async function testFactorySelectsAzureAliases(): Promise<void> {
  await withEnv({
    COMMAND_OUTPUT_BUCKET: "container",
    COMMAND_OUTPUT_STORAGE_PROVIDER: "azure",
    AZURE_STORAGE_ACCOUNT_NAME: "account",
    AZURE_STORAGE_ACCOUNT_KEY: "a2V5"
  }, () => {
    assert.ok(createCommandOutputStorageFromEnv() instanceof AzureCommandOutputStorage);
  });

  await withEnv({
    COMMAND_OUTPUT_BUCKET: "container",
    COMMAND_OUTPUT_STORAGE_PROVIDER: "az",
    AZURE_STORAGE_ACCOUNT_NAME: "account",
    AZURE_STORAGE_ACCOUNT_KEY: "a2V5"
  }, () => {
    assert.ok(createCommandOutputStorageFromEnv() instanceof AzureCommandOutputStorage);
  });
}

async function testFactoryRejectsUnsupportedProvider(): Promise<void> {
  await withEnv({ COMMAND_OUTPUT_BUCKET: "bucket", COMMAND_OUTPUT_STORAGE_PROVIDER: "bogus" }, () => {
    assert.throws(
      () => createCommandOutputStorageFromEnv(),
      /Unsupported COMMAND_OUTPUT_STORAGE_PROVIDER/
    );
  });
}

async function testBufferedStorageUploadsNdjsonAndIgnoresDuplicates(): Promise<void> {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "firstdraft-command-output-test-"));
  try {
    const storage = new FakeBufferedCommandOutputStorage(tempRoot, "prefix");
    await storage.appendChunk({
      workerId: "worker/one",
      transactionId: "command:one",
      sequence: 1,
      stream: "stdout",
      text: "hello",
      emittedAt: "2026-05-23T10:00:00.000Z"
    });
    await storage.appendChunk({
      workerId: "worker/one",
      transactionId: "command:one",
      sequence: 1,
      stream: "stdout",
      text: "duplicate",
      emittedAt: "2026-05-23T10:00:01.000Z"
    });
    await storage.appendChunk({
      workerId: "worker/one",
      transactionId: "command:one",
      sequence: 2,
      stream: "stderr",
      text: "world",
      emittedAt: "2026-05-23T10:00:02.000Z"
    });

    const metadata = await storage.completeCommand("worker/one", "command:one");

    assert.deepEqual(metadata, {
      outputObjectKey: "prefix/workers/worker_one/commands/command_one/output.ndjson",
      outputBytes: storage.uploads[0].body.length,
      outputStartedAt: "2026-05-23T10:00:00.000Z",
      outputUpdatedAt: "2026-05-23T10:00:02.000Z"
    });
    assert.equal(storage.uploads.length, 1);
    assert.equal(storage.uploads[0].objectKey, "prefix/workers/worker_one/commands/command_one/output.ndjson");
    assert.deepEqual(
      storage.uploads[0].body.trim().split("\n").map((line) => JSON.parse(line)),
      [
        {
          sequence: 1,
          stream: "stdout",
          text: "hello",
          emittedAt: "2026-05-23T10:00:00.000Z"
        },
        {
          sequence: 2,
          stream: "stderr",
          text: "world",
          emittedAt: "2026-05-23T10:00:02.000Z"
        }
      ]
    );
    await storage.deleteOutput("prefix/workers/worker_one/commands/command_one/output.ndjson");
    assert.equal(storage.uploads.length, 0);
    assert.equal(await storage.completeCommand("worker/one", "command:one"), undefined);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

await testFactoryReturnsUndefinedWithoutBucket();
await testFactoryDefaultsToS3();
await testFactorySelectsS3Aliases();
await testFactorySelectsGcsAliases();
await testFactorySelectsAzureAliases();
await testFactoryRejectsUnsupportedProvider();
await testBufferedStorageUploadsNdjsonAndIgnoresDuplicates();

console.log("command output storage tests passed");
