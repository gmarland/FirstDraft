import { createReadStream } from "fs";
import { Readable } from "stream";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { BufferedCommandOutputStorage } from "./bufferedCommandOutputStorage.js";
import type { StoredCommandOutput } from "./types.js";

export class S3CommandOutputStorage extends BufferedCommandOutputStorage {
  private readonly client: S3Client;

  public constructor(
    private readonly options: {
      bucket: string;
      region?: string;
      prefix?: string;
      endpoint?: string;
      forcePathStyle?: boolean;
      client?: S3Client;
    },
  ) {
    super({ prefix: options.prefix });
    this.client =
      options.client ??
      new S3Client({
        region: options.region,
        endpoint: options.endpoint,
        forcePathStyle: options.forcePathStyle,
      });
  }

  protected async uploadFile(objectKey: string, filePath: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: objectKey,
        Body: createReadStream(filePath),
        ContentType: "application/x-ndjson",
      }),
    );
  }

  public async getOutput(objectKey: string): Promise<StoredCommandOutput> {
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: objectKey,
      }),
    );

    if (!result.Body || !(result.Body instanceof Readable)) {
      throw new Error("S3 object body is not readable");
    }

    return {
      body: result.Body,
      contentType: result.ContentType,
    };
  }

  protected async deleteStoredOutput(objectKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.options.bucket,
        Key: objectKey,
      }),
    );
  }
}
