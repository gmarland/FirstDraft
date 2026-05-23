import jwt from "jsonwebtoken";
import { JwtConfig } from "../../auth/passport.js";
import { User } from "../../types.js";

export function createAuthResponse(user: User, config: JwtConfig) {
  const token = jwt.sign(
    {
      email: user.email,
      role: user.role
    },
    config.secret,
    {
      subject: user.userId,
      issuer: config.issuer,
      audience: config.audience,
      expiresIn: config.expiresIn
    }
  );

  return {
    token,
    tokenType: "Bearer",
    expiresIn: config.expiresIn,
    user: toAuthUserResponse(user)
  };
}

export function toAuthUserResponse(user: User): User {
  return user;
}
