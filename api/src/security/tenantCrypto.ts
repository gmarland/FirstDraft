import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

export type EncryptedValue = {
  v: 1;
  alg: "AES-256-GCM";
  iv: string;
  tag: string;
  ciphertext: string;
};

export class TenantCrypto {
  private readonly key: Buffer;

  public constructor(encryptionKey: string) {
    this.key = decodeBase64Url(encryptionKey);
    if (this.key.length !== KEY_LENGTH) {
      throw new Error("tenant encryption key must be 32 bytes");
    }
  }

  public encrypt(value: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const encrypted: EncryptedValue = {
      v: 1,
      alg: "AES-256-GCM",
      iv: iv.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
      ciphertext: ciphertext.toString("base64url")
    };

    return JSON.stringify(encrypted);
  }

  public decrypt(value: string): string {
    const encrypted = JSON.parse(value) as EncryptedValue;
    if (encrypted.v !== 1 || encrypted.alg !== "AES-256-GCM") {
      throw new Error("unsupported encrypted value format");
    }

    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(encrypted.iv, "base64url"));
    decipher.setAuthTag(Buffer.from(encrypted.tag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(encrypted.ciphertext, "base64url")),
      decipher.final()
    ]);

    return plaintext.toString("utf8");
  }

  public lookupHash(value: string): string {
    return createHmac("sha256", this.key).update(value, "utf8").digest("base64url");
  }
}

export function generateTenantEncryptionKey(): string {
  return randomBytes(KEY_LENGTH).toString("base64url");
}

export function publicConfigEncryptionKey(encryptionKey: string): string {
  return createHash("sha256").update(`firstdraft-worker-config:${encryptionKey}`, "utf8").digest("base64url");
}

function decodeBase64Url(value: string): Buffer {
  try {
    return Buffer.from(value, "base64url");
  } catch {
    throw new Error("tenant encryption key is not valid base64url");
  }
}
