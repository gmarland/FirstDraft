import cors from "cors";
import express, { RequestHandler, Router } from "express";
import morgan from "morgan";
import passport from "passport";
import { requireJwt } from "../auth/requireJwt.js";
import { openApiDocument, swaggerHtml } from "../openapi.js";

type CreateAppOptions = {
  authRoutes: Router;
  workerAuthRoutes: Router;
  workerRoutes: Router;
  userApiKeyRoutes: Router;
  negotiateHandler: RequestHandler;
};

export function createApp({
  authRoutes,
  workerAuthRoutes,
  workerRoutes,
  userApiKeyRoutes,
  negotiateHandler
}: CreateAppOptions): express.Express {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("dev"));
  app.use(passport.initialize());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/swagger.json", (_req, res) => {
    res.json(openApiDocument);
  });

  app.get("/api/docs", (_req, res) => {
    res.type("html").send(swaggerHtml());
  });

  app.post("/WorkerHub/negotiate", negotiateHandler);
  app.use("/api/auth", authRoutes);
  app.use("/api/worker-auth", workerAuthRoutes);
  app.use("/api/me/api-keys", requireJwt, userApiKeyRoutes);
  app.use("/api/workers", requireJwt, workerRoutes);

  return app;
}
