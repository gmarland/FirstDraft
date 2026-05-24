import { Router } from "express";
import { JwtConfig } from "../auth/passport.js";
import { requireJwt } from "../auth/requireJwt.js";
import { createAuthController } from "../controllers/auth/authController.js";
import { CommandOutputStorage } from "../storage/commandOutputStorage.js";
import { AppStore } from "../store/tenantStore.js";

export function createAuthRoutes(
  config: JwtConfig,
  tenants: AppStore,
  outputStorage?: CommandOutputStorage
): Router {
  const router = Router();
  const controller = createAuthController(config, tenants, outputStorage);

  router.post("/signup", controller.signup);
  router.post("/login", controller.login);
  router.get("/me", requireJwt, controller.me);
  router.patch("/me", requireJwt, controller.updateMe);
  router.delete("/me", requireJwt, controller.deleteMe);

  return router;
}
