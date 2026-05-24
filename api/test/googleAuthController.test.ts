import assert from "node:assert/strict";
import { RequestHandler } from "express";
import { createAuthController } from "../src/controllers/auth/authController.js";
import { GoogleCredentialVerifier, GoogleProfile } from "../src/auth/googleAuth.js";
import { AppStore } from "../src/store/tenantStore.js";
import { User } from "../src/types.js";

const jwtConfig = {
  secret: "test-secret",
  issuer: "firstdraft-test",
  audience: "firstdraft-web-test",
  expiresIn: "1h" as const
};

class FakeVerifier implements GoogleCredentialVerifier {
  public profile: GoogleProfile = {
    subject: "google-sub-1",
    email: "user@example.com",
    emailVerified: true,
    name: "Example User"
  };

  public async verifyCredential(): Promise<GoogleProfile> {
    return this.profile;
  }
}

class FakeStore implements Partial<AppStore> {
  public users: User[] = [];
  private readonly googleSubjects = new Map<string, string>();

  public async createGoogleUser(input: { email: string; googleSub: string; name?: string; role?: "admin" | "user" }): Promise<User> {
    const user: User = {
      userId: `user-${this.users.length + 1}`,
      email: input.email,
      name: input.name,
      role: input.role ?? "user",
      createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString()
    };
    this.users.push(user);
    this.googleSubjects.set(input.googleSub, user.userId);
    return user;
  }

  public async listUsers(): Promise<User[]> {
    return this.users;
  }

  public async getUserByEmail(email: string): Promise<User | undefined> {
    return this.users.find((user) => user.email.toLowerCase() === email.toLowerCase());
  }

  public async findByGoogleSubject(googleSub: string): Promise<User | undefined> {
    const userId = this.googleSubjects.get(googleSub);
    return userId ? this.users.find((user) => user.userId === userId) : undefined;
  }

  public async linkGoogleSubjectToUser(userId: string, googleSub: string): Promise<User | undefined> {
    const user = this.users.find((candidate) => candidate.userId === userId);
    if (!user) return undefined;
    this.googleSubjects.set(googleSub, user.userId);
    return user;
  }
}

async function invoke(handler: RequestHandler, body: unknown = {}): Promise<{ statusCode: number; payload: unknown }> {
  let statusCode = 200;
  let payload: unknown;
  await handler(
    { body } as never,
    {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(value: unknown) {
        payload = value;
        return this;
      }
    } as never,
    (error?: unknown) => {
      if (error) throw error;
    }
  );

  return { statusCode, payload };
}

async function testDisabledGoogleLogin(): Promise<void> {
  const controller = createAuthController(jwtConfig, new FakeStore() as AppStore);
  const response = await invoke(controller.googleLogin, { credential: "token" });
  assert.equal(response.statusCode, 404);
}

async function testGoogleSignupCreatesFirstAdmin(): Promise<void> {
  const store = new FakeStore();
  const controller = createAuthController(jwtConfig, store as AppStore, { enabled: true, clientId: "client-id" }, new FakeVerifier());
  const response = await invoke(controller.googleSignup, { credential: "token" });
  assert.equal(response.statusCode, 201);
  assert.equal(store.users[0].email, "user@example.com");
  assert.equal(store.users[0].role, "admin");
  assert.equal(typeof (response.payload as { token?: unknown }).token, "string");
}

async function testGoogleLoginLinksExistingVerifiedEmail(): Promise<void> {
  const store = new FakeStore();
  store.users.push({
    userId: "user-1",
    email: "user@example.com",
    role: "user",
    createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString()
  });
  const controller = createAuthController(jwtConfig, store as AppStore, { enabled: true, clientId: "client-id" }, new FakeVerifier());
  const response = await invoke(controller.googleLogin, { credential: "token" });
  assert.equal(response.statusCode, 200);
  assert.equal(await store.findByGoogleSubject("google-sub-1"), store.users[0]);
}

await testDisabledGoogleLogin();
await testGoogleSignupCreatesFirstAdmin();
await testGoogleLoginLinksExistingVerifiedEmail();

console.log("google auth controller tests passed");
