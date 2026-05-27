import { RequestHandler } from "express";
import { GitRepositoryStore } from "../../store/gitRepositories/gitRepositoryStore.js";
import { User } from "../../types.js";
import { routeParam } from "../routeParams.js";
import { parseRepositoryInput, validateRepositoryInput } from "./repositoryRequests.js";

export class RepositoryController {
  public constructor(private readonly gitRepositories: GitRepositoryStore) {}

  public readonly listRepositories: RequestHandler = async (req, res, next) => {
    try {
      const user = currentUser(req);
      res.json({ repositories: await this.gitRepositories.listRepositories(user.userId) });
    } catch (error) {
      next(error);
    }
  };

  public readonly createRepository: RequestHandler = async (req, res, next) => {
    try {
      const user = currentUser(req);
      const input = parseRepositoryInput(req.body);
      const validationError = validateRepositoryInput(input);
      if (validationError) return res.status(400).json({ error: validationError });

      res.status(201).json(await this.gitRepositories.saveRepository(user.userId, input));
    } catch (error) {
      next(error);
    }
  };

  public readonly updateRepository: RequestHandler = async (req, res, next) => {
    try {
      const user = currentUser(req);
      const input = parseRepositoryInput(req.body, true);
      const validationError = validateRepositoryInput(input, true);
      if (validationError) return res.status(400).json({ error: validationError });

      const saved = await this.gitRepositories.updateRepository(user.userId, routeParam(req, "normalizedRepositoryUrl"), input);
      if (!saved) return res.status(404).json({ error: "Repository not found" });
      res.json(saved);
    } catch (error) {
      next(error);
    }
  };

  public readonly deleteRepository: RequestHandler = async (req, res, next) => {
    try {
      const user = currentUser(req);
      const deleted = await this.gitRepositories.deleteRepository(user.userId, routeParam(req, "normalizedRepositoryUrl"));
      if (!deleted) return res.status(404).json({ error: "Repository not found" });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}

export function createRepositoryController(gitRepositories: GitRepositoryStore): RepositoryController {
  return new RepositoryController(gitRepositories);
}

function currentUser(req: { user?: User }): User {
  if (!req.user) throw new Error("authentication required");
  return req.user;
}
