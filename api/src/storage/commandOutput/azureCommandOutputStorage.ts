import { Readable } from "stream";
import {
  BlobServiceClient,
  StorageSharedKeyCredential,
} from "@azure/storage-blob";
import { BufferedCommandOutputStorage } from "./bufferedCommandOutputStorage.js";
import type { StoredCommandOutput } from "./types.js";

export class AzureCommandOutputStorage extends BufferedCommandOutputStorage {
  private serviceClient?: BlobServiceClient;
  private readonly containerClient: ReturnType<
    BlobServiceClient["getContainerClient"]
  >;

  public constructor(
    private readonly options: {
      container: string;
      prefix?: string;
      connectionString?: string;
      accountName?: string;
      accountKey?: string;
      serviceClient?: BlobServiceClient;
    },
  ) {
    super({ prefix: options.prefix });
    this.serviceClient = options.serviceClient;
    this.containerClient = this.getServiceClient().getContainerClient(
      options.container,
    );
  }

  protected async uploadFile(objectKey: string, filePath: string): Promise<void> {
    const blob = this.containerClient.getBlockBlobClient(objectKey);
    await blob.uploadFile(filePath, {
      blobHTTPHeaders: {
        blobContentType: "application/x-ndjson",
      },
    });
  }

  public async getOutput(objectKey: string): Promise<StoredCommandOutput> {
    const blob = this.containerClient.getBlockBlobClient(objectKey);
    const result = await blob.download();

    if (
      !result.readableStreamBody ||
      !(result.readableStreamBody instanceof Readable)
    ) {
      throw new Error("Azure blob body is not readable");
    }

    return {
      body: result.readableStreamBody,
      contentType: result.contentType,
    };
  }

  protected async deleteStoredOutput(objectKey: string): Promise<void> {
    await this.containerClient.getBlockBlobClient(objectKey).deleteIfExists();
  }

  private getServiceClient(): BlobServiceClient {
    if (this.serviceClient) return this.serviceClient;

    if (this.options.connectionString) {
      this.serviceClient = BlobServiceClient.fromConnectionString(
        this.options.connectionString,
      );
      return this.serviceClient;
    }

    if (this.options.accountName && this.options.accountKey) {
      const credential = new StorageSharedKeyCredential(
        this.options.accountName,
        this.options.accountKey,
      );
      this.serviceClient = new BlobServiceClient(
        `https://${this.options.accountName}.blob.core.windows.net`,
        credential,
      );
      return this.serviceClient;
    }

    throw new Error(
      "Azure command output storage requires AZURE_STORAGE_CONNECTION_STRING or AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY",
    );
  }
}
