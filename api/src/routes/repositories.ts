import { Router } from "express";
import { createRepositoryController } from "../controllers/repositories/repositoryController.js";
import { GitRepositoryStore } from "../store/gitRepositories/gitRepositoryStore.js";

export function createRepositoryRoutes(gitRepositories: GitRepositoryStore): Router {
  const router = Router();
  const controller = createRepositoryController(gitRepositories);

  router.get("/", controller.listRepositories);
  router.post("/", controller.createRepository);
  router.put("/:normalizedRepositoryUrl", controller.updateRepository);
  router.delete("/:normalizedRepositoryUrl", controller.deleteRepository);

  return router;
}
