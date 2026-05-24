import { Router } from "express";
import { GoogleAuthConfig, GoogleCredentialVerifier } from "../auth/googleAuth.js";
import { JwtConfig } from "../auth/passport.js";
import { requireJwt } from "../auth/requireJwt.js";
import { createAuthController } from "../controllers/auth/authController.js";
import { AppStore } from "../store/tenantStore.js";

export function createAuthRoutes(
  config: JwtConfig,
  tenants: AppStore,
  googleAuth?: GoogleAuthConfig,
  googleVerifier?: GoogleCredentialVerifier
): Router {
  const router = Router();
  const controller = createAuthController(config, tenants, googleAuth, googleVerifier);

  router.post("/signup", controller.signup);
  router.post("/login", controller.login);
  router.get("/google/config", controller.googleConfig);
  router.post("/google/login", controller.googleLogin);
  router.post("/google/signup", controller.googleSignup);
  router.get("/me", requireJwt, controller.me);

  return router;
}
