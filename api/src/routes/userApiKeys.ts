import { Router } from "express";
import { createUserApiKeyController } from "../controllers/userApiKeys/userApiKeyController.js";
import { AppStore } from "../store/tenantStore.js";

export function createUserApiKeyRoutes(tenants: AppStore): Router {
  const router = Router();
  const controller = createUserApiKeyController(tenants);

  router.get("/", controller.listApiKeys);
  router.post("/", controller.createApiKey);
  router.delete("/:keyId", controller.revokeApiKey);

  return router;
}
