import { RequestHandler } from "express";
import passport from "passport";

export const requireJwt: RequestHandler = passport.authenticate("jwt", { session: false });
