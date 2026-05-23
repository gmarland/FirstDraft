import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);
const PASSWORD_KEY_LENGTH = 64;

export class UserPasswordHasher {
  public async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString("base64url");
    const derivedKey = (await scryptAsync(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;
    return `scrypt:${salt}:${derivedKey.toString("base64url")}`;
  }

  public async verifyPassword(password: string, hash: string): Promise<boolean> {
    const [algorithm, salt, expectedKey] = hash.split(":");
    if (algorithm !== "scrypt" || !salt || !expectedKey) return false;

    const expected = Buffer.from(expectedKey, "base64url");
    const actual = (await scryptAsync(password, salt, expected.length)) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
