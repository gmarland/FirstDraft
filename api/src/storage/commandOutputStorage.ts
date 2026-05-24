import { AzureCommandOutputStorage } from "./commandOutput/azureCommandOutputStorage.js";
import { GcsCommandOutputStorage } from "./commandOutput/gcsCommandOutputStorage.js";
import { S3CommandOutputStorage } from "./commandOutput/s3CommandOutputStorage.js";
import type {
  CommandOutputStorage,
  CommandOutputStorageProvider,
} from "./commandOutput/types.js";

export type {
  CommandOutputChunkInput,
  CommandOutputMetadata,
  CommandOutputStorage,
  CommandOutputStorageProvider,
  StoredCommandOutput,
} from "./commandOutput/types.js";
export { BufferedCommandOutputStorage } from "./commandOutput/bufferedCommandOutputStorage.js";
export { AzureCommandOutputStorage } from "./commandOutput/azureCommandOutputStorage.js";
export { GcsCommandOutputStorage } from "./commandOutput/gcsCommandOutputStorage.js";
export { S3CommandOutputStorage } from "./commandOutput/s3CommandOutputStorage.js";

export function createCommandOutputStorageFromEnv():
  | CommandOutputStorage
  | undefined {
  const bucket = process.env.COMMAND_OUTPUT_BUCKET;
  if (!bucket) return undefined;

  const provider = getCommandOutputStorageProviderFromEnv();

  if (provider === "azure") {
    return new AzureCommandOutputStorage({
      container: bucket,
      prefix: process.env.COMMAND_OUTPUT_PREFIX,
      connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
      accountName: process.env.AZURE_STORAGE_ACCOUNT_NAME,
      accountKey: process.env.AZURE_STORAGE_ACCOUNT_KEY,
    });
  }

  if (provider === "gcs") {
    return new GcsCommandOutputStorage({
      bucket,
      prefix: process.env.COMMAND_OUTPUT_PREFIX,
      projectId: process.env.GCP_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT,
    });
  }

  if (provider === "s3") {
    return new S3CommandOutputStorage({
      bucket,
      region: process.env.AWS_REGION,
      prefix: process.env.COMMAND_OUTPUT_PREFIX,
      endpoint: process.env.S3_ENDPOINT_URL,
      forcePathStyle: parseBoolean(process.env.S3_FORCE_PATH_STYLE),
    });
  }

  throw new Error(`Unsupported command output storage provider: ${provider}`);
}

export function getCommandOutputStorageProviderFromEnv(): CommandOutputStorageProvider {
  return parseStorageProvider(process.env.COMMAND_OUTPUT_STORAGE_PROVIDER);
}

export function parseStorageProvider(
  value: string | undefined,
): CommandOutputStorageProvider {
  const normalized = (value ?? "s3").trim().toLowerCase();
  if (normalized === "s3" || normalized === "aws") return "s3";
  if (normalized === "gcs" || normalized === "google") return "gcs";
  if (normalized === "azure" || normalized === "az") return "azure";
  throw new Error(
    "Unsupported COMMAND_OUTPUT_STORAGE_PROVIDER. Expected one of: s3, aws, gcs, google, azure, az",
  );
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
