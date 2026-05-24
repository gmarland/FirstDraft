import { OAuth2Client } from "google-auth-library";

export type GoogleAuthConfig = {
  enabled: boolean;
  clientId?: string;
};

export type GoogleProfile = {
  subject: string;
  email: string;
  emailVerified: boolean;
  name?: string;
};

export type GoogleCredentialVerifier = {
  verifyCredential(credential: string): Promise<GoogleProfile>;
};

export class GoogleIdTokenVerifier implements GoogleCredentialVerifier {
  private readonly client: OAuth2Client;

  public constructor(private readonly clientId: string) {
    this.client = new OAuth2Client(clientId);
  }

  public async verifyCredential(credential: string): Promise<GoogleProfile> {
    const ticket = await this.client.verifyIdToken({
      idToken: credential,
      audience: this.clientId
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload.email) {
      throw new Error("invalid Google credential");
    }

    return {
      subject: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified === true,
      name: payload.name
    };
  }
}

export function createGoogleAuthConfigFromEnv(): GoogleAuthConfig {
  const enabled = process.env.GOOGLE_AUTH_ENABLED === "true";
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();

  if (enabled && !clientId) {
    throw new Error("GOOGLE_CLIENT_ID is required when GOOGLE_AUTH_ENABLED=true");
  }

  return {
    enabled,
    clientId: clientId || undefined
  };
}

export function createGoogleCredentialVerifier(config: GoogleAuthConfig): GoogleCredentialVerifier | undefined {
  if (!config.enabled || !config.clientId) return undefined;
  return new GoogleIdTokenVerifier(config.clientId);
}
