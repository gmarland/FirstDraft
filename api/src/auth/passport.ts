import passport from "passport";
import { SignOptions } from "jsonwebtoken";
import { Strategy as JwtStrategy, ExtractJwt, StrategyOptions as JwtStrategyOptions } from "passport-jwt";
import { Strategy as LocalStrategy } from "passport-local";
import { AppStore } from "../store/tenantStore.js";
import { JwtUserPayload } from "./authTypes.js";

export type JwtConfig = {
  secret: string;
  issuer: string;
  audience: string;
  expiresIn: SignOptions["expiresIn"];
};

export function createJwtConfigFromEnv(): JwtConfig {
  const secret = process.env.JWT_SECRET ?? (process.env.NODE_ENV === "production" ? "" : "dev-only-jwt-secret");
  if (!secret) {
    throw new Error("JWT_SECRET is required");
  }

  return {
    secret,
    issuer: process.env.JWT_ISSUER ?? "firstdraft-api",
    audience: process.env.JWT_AUDIENCE ?? "firstdraft-web",
    expiresIn: (process.env.JWT_EXPIRES_IN ?? "1h") as SignOptions["expiresIn"]
  };
}

export function configurePassport(tenants: AppStore, jwt: JwtConfig): typeof passport {
  passport.use(
    new LocalStrategy(
      {
        usernameField: "email",
        passwordField: "password",
        passReqToCallback: true,
        session: false
      },
      async (req, email, password, done) => {
        try {
          if (!email || !password) {
            return done(null, false);
          }

          const user = await tenants.authenticateUser(email, password);
          return done(null, user ?? false);
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  const jwtOptions: JwtStrategyOptions = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: jwt.secret,
    issuer: jwt.issuer,
    audience: jwt.audience
  };

  passport.use(
    new JwtStrategy(jwtOptions, async (payload: JwtUserPayload, done) => {
      try {
        const user = await tenants.getUser(payload.sub);
        if (!user || user.disabledAt) {
          return done(null, false);
        }

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    })
  );

  return passport;
}
