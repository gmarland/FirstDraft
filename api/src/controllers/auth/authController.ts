import { RequestHandler } from "express";
import passport from "passport";
import { GoogleAuthConfig, GoogleCredentialVerifier, GoogleProfile } from "../../auth/googleAuth.js";
import { JwtConfig } from "../../auth/passport.js";
import { AppStore } from "../../store/tenantStore.js";
import { User } from "../../types.js";
import { createAuthResponse, toAuthUserResponse } from "./authResponses.js";
import { isUniqueViolation, validateUserInput } from "./authValidation.js";

export class AuthController {
  public constructor(
    private readonly config: JwtConfig,
    private readonly tenants: AppStore,
    private readonly googleAuth: GoogleAuthConfig = { enabled: false },
    private readonly googleVerifier?: GoogleCredentialVerifier
  ) {}

  public readonly signup: RequestHandler = async (req, res, next) => {
    try {
      const { email, password, name } = req.body as {
        email?: string;
        password?: string;
        name?: string;
      };

      const userInputError = validateUserInput(email, password);
      if (userInputError) {
        return res.status(400).json({ error: userInputError });
      }

      const existingUsers = await this.tenants.listUsers();
      const user = await this.tenants.createUser({
        email: email!.trim(),
        password: password!,
        name: name?.trim() || undefined,
        role: existingUsers.length === 0 ? "admin" : "user"
      });

      res.status(201).json(createAuthResponse(user, this.config));
    } catch (error) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({ error: "email already exists" });
      }

      next(error);
    }
  };

  public readonly login: RequestHandler = (req, res, next) => {
    passport.authenticate("local", { session: false }, (error: unknown, user?: User | false) => {
      if (error) {
        return next(error);
      }

      if (!user) {
        return res.status(401).json({ error: "invalid email or password" });
      }

      res.json(createAuthResponse(user, this.config));
    })(req, res, next);
  };

  public readonly googleConfig: RequestHandler = (_req, res) => {
    res.json({
      enabled: this.googleAuth.enabled && Boolean(this.googleAuth.clientId),
      clientId: this.googleAuth.enabled ? this.googleAuth.clientId : undefined
    });
  };

  public readonly googleLogin: RequestHandler = async (req, res, next) => {
    try {
      if (!this.isGoogleAuthEnabled()) {
        return res.status(404).json({ error: "Google auth is disabled" });
      }

      const profile = await this.verifyGoogleCredential(req.body);
      if (!profile.emailVerified) {
        return res.status(401).json({ error: "Google email is not verified" });
      }

      let user = await this.tenants.findByGoogleSubject(profile.subject);
      if (!user) {
        const userByEmail = await this.tenants.getUserByEmail(profile.email);
        if (!userByEmail) {
          return res.status(401).json({ error: "Google account is not linked to a user" });
        }

        if (userByEmail.disabledAt) {
          return res.status(401).json({ error: "user is disabled" });
        }

        user = await this.tenants.linkGoogleSubjectToUser(userByEmail.userId, profile.subject);
      }

      if (!user || user.disabledAt) {
        return res.status(401).json({ error: "user is disabled" });
      }

      res.json(createAuthResponse(user, this.config));
    } catch (error) {
      if (isGoogleCredentialError(error)) {
        return res.status(401).json({ error: "invalid Google credential" });
      }

      next(error);
    }
  };

  public readonly googleSignup: RequestHandler = async (req, res, next) => {
    try {
      if (!this.isGoogleAuthEnabled()) {
        return res.status(404).json({ error: "Google auth is disabled" });
      }

      const profile = await this.verifyGoogleCredential(req.body);
      if (!profile.emailVerified) {
        return res.status(401).json({ error: "Google email is not verified" });
      }

      const existingGoogleUser = await this.tenants.findByGoogleSubject(profile.subject);
      if (existingGoogleUser) {
        return res.status(409).json({ error: "Google account already exists" });
      }

      const existingEmailUser = await this.tenants.getUserByEmail(profile.email);
      if (existingEmailUser) {
        return res.status(409).json({ error: "email already exists" });
      }

      const existingUsers = await this.tenants.listUsers();
      const user = await this.tenants.createGoogleUser({
        email: profile.email,
        googleSub: profile.subject,
        name: profile.name,
        role: existingUsers.length === 0 ? "admin" : "user"
      });

      res.status(201).json(createAuthResponse(user, this.config));
    } catch (error) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({ error: "email already exists" });
      }

      if (isGoogleCredentialError(error)) {
        return res.status(401).json({ error: "invalid Google credential" });
      }

      next(error);
    }
  };

  public readonly me: RequestHandler = (req, res) => {
    res.json({ user: toAuthUserResponse(req.user as User) });
  };

  private isGoogleAuthEnabled(): boolean {
    return this.googleAuth.enabled && Boolean(this.googleAuth.clientId) && Boolean(this.googleVerifier);
  }

  private async verifyGoogleCredential(body: unknown): Promise<GoogleProfile> {
    const credential = typeof body === "object" && body !== null && "credential" in body
      ? (body as { credential?: unknown }).credential
      : undefined;
    if (typeof credential !== "string" || !credential.trim()) {
      throw new Error("missing Google credential");
    }

    if (!this.googleVerifier) {
      throw new Error("Google auth is disabled");
    }

    try {
      return await this.googleVerifier.verifyCredential(credential);
    } catch {
      throw new Error("invalid Google credential");
    }
  }
}

export function createAuthController(
  config: JwtConfig,
  tenants: AppStore,
  googleAuth?: GoogleAuthConfig,
  googleVerifier?: GoogleCredentialVerifier
): AuthController {
  return new AuthController(config, tenants, googleAuth, googleVerifier);
}

function isGoogleCredentialError(error: unknown): boolean {
  return error instanceof Error && (
    error.message === "missing Google credential" ||
    error.message === "invalid Google credential"
  );
}
