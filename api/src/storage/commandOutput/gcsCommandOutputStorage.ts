import { createReadStream } from "fs";
import { pipeline } from "stream/promises";
import { Storage } from "@google-cloud/storage";
import { BufferedCommandOutputStorage } from "./bufferedCommandOutputStorage.js";
import type { StoredCommandOutput } from "./types.js";

export class GcsCommandOutputStorage extends BufferedCommandOutputStorage {
  private readonly bucket: ReturnType<Storage["bucket"]>;

  public constructor(
    private readonly options: {
      bucket: string;
      prefix?: string;
      projectId?: string;
      storage?: Storage;
    },
  ) {
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
          contentType: "application/x-ndjson",
        },
      }),
    );
  }

  public async getOutput(objectKey: string): Promise<StoredCommandOutput> {
    const file = this.bucket.file(objectKey);
    const [metadata] = await file.getMetadata();

    return {
      body: file.createReadStream(),
      contentType:
        typeof metadata.contentType === "string"
          ? metadata.contentType
          : undefined,
    };
  }

  public async deleteOutput(objectKey: string): Promise<void> {
    await this.bucket.file(objectKey).delete({ ignoreNotFound: true });
  }
}
