import type { Readable } from "stream";

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
  completeCommand(
    workerId: string,
    transactionId: string,
  ): Promise<CommandOutputMetadata | undefined>;
  getOutput(objectKey: string): Promise<StoredCommandOutput>;
  deleteOutput(objectKey: string): Promise<void>;
};

export type CommandOutputStorageProvider = "s3" | "gcs" | "azure";
