import { RequestHandler } from "express";
import { AppStore } from "../../store/tenantStore.js";
import { User } from "../../types.js";
import { routeParam } from "../routeParams.js";
import { readApiKeyName } from "./userApiKeyRequests.js";

export class UserApiKeyController {
  public constructor(private readonly tenants: AppStore) {}

  public readonly listApiKeys: RequestHandler = async (req, res, next) => {
    try {
      const user = req.user as User;
      if (user.role === "admin") {
        res.json(await this.tenants.listApiKeys());
        return;
      }

      res.json(await this.tenants.listApiKeysForUser(user.userId));
    } catch (error) {
      next(error);
    }
  };

  public readonly createApiKey: RequestHandler = async (req, res, next) => {
    try {
      const user = req.user as User;
      const created = await this.tenants.createApiKey({
        userId: user.userId,
        name: readApiKeyName(req.body)
      });

      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  };

  public readonly revokeApiKey: RequestHandler = async (req, res, next) => {
    try {
      const user = req.user as User;
      const revoked =
        user.role === "admin"
          ? await this.tenants.revokeApiKey(routeParam(req.params, "keyId"))
          : await this.tenants.revokeApiKeyForUser(user.userId, routeParam(req.params, "keyId"));

      if (!revoked) {
        return res.status(404).json({ error: "API key not found" });
      }

      res.json(revoked);
    } catch (error) {
      next(error);
    }
  };
}

export function createUserApiKeyController(tenants: AppStore): UserApiKeyController {
  return new UserApiKeyController(tenants);
}
