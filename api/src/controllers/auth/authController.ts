import { RequestHandler } from "express";
import passport from "passport";
import { JwtConfig } from "../../auth/passport.js";
import { CommandOutputStorage } from "../../storage/commandOutputStorage.js";
import { AppStore } from "../../store/tenantStore.js";
import { User } from "../../types.js";
import { createAuthResponse, toAuthUserResponse } from "./authResponses.js";
import { isUniqueViolation, readUpdateProfileInput, validateUpdateProfileInput, validateUserInput } from "./authValidation.js";

export class AuthController {
  public constructor(
    private readonly config: JwtConfig,
    private readonly tenants: AppStore,
    private readonly outputStorage?: CommandOutputStorage
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

  public readonly me: RequestHandler = (req, res) => {
    res.json({ user: toAuthUserResponse(req.user as User) });
  };

  public readonly updateMe: RequestHandler = async (req, res, next) => {
    try {
      const input = readUpdateProfileInput(req.body);
      const inputError = validateUpdateProfileInput(input);
      if (inputError) {
        return res.status(400).json({ error: inputError });
      }

      const currentUser = req.user as User | undefined;
      if (!currentUser) {
        return res.status(401).json({ error: "authentication required" });
      }

      const user = await this.tenants.updateUser(currentUser.userId, input);
      if (!user) {
        return res.status(404).json({ error: "user not found" });
      }

      res.json({ user: toAuthUserResponse(user) });
    } catch (error) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({ error: "email already exists" });
      }

      next(error);
    }
  };

  public readonly deleteMe: RequestHandler = async (req, res, next) => {
    try {
      const currentUser = req.user as User | undefined;
      if (!currentUser) {
        return res.status(401).json({ error: "authentication required" });
      }

      const outputStorage = this.outputStorage;
      if (outputStorage) {
        const outputObjectKeys = await this.tenants.listCommandOutputObjectKeysForUser(currentUser.userId);
        await Promise.all(outputObjectKeys.map((objectKey) => outputStorage.deleteOutput(objectKey)));
      }

      const deleted = await this.tenants.deleteUser(currentUser.userId);
      if (!deleted) {
        return res.status(404).json({ error: "user not found" });
      }

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}

export function createAuthController(
  config: JwtConfig,
  tenants: AppStore,
  outputStorage?: CommandOutputStorage
): AuthController {
  return new AuthController(config, tenants, outputStorage);
}
