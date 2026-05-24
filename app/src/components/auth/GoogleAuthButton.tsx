import { useEffect, useState } from "react";
import { Alert, Box, Divider } from "@mui/material";
import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { api } from "../../lib/api";

const googleAuthEnabled = import.meta.env.VITE_GOOGLE_AUTH_ENABLED === "true";
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();

type Props = {
  onCredential(credential: string): Promise<void>;
  onError(message: string): void;
  disabled?: boolean;
};

export function GoogleAuthButton({ onCredential, onError, disabled }: Props) {
  const [available, setAvailable] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadConfig() {
      if (!googleAuthEnabled || !googleClientId) return;

      try {
        const config = await api.googleAuthConfig();
        if (!active) return;
        if (!config.enabled) return;
        if (config.clientId && config.clientId !== googleClientId) {
          setConfigError("Google auth is not configured correctly.");
          return;
        }

        setAvailable(true);
      } catch {
        if (active) setAvailable(false);
      }
    }

    void loadConfig();

    return () => {
      active = false;
    };
  }, []);

  if (configError) {
    return <Alert severity="error">{configError}</Alert>;
  }

  if (!available || !googleClientId) {
    return null;
  }

  return (
    <>
      <Box sx={{ opacity: disabled ? 0.6 : 1, pointerEvents: disabled ? "none" : "auto" }}>
        <GoogleOAuthProvider clientId={googleClientId}>
          <GoogleLogin
            text="continue_with"
            shape="rectangular"
            width="100%"
            onSuccess={(response) => {
              if (!response.credential) {
                onError("Google did not return a credential.");
                return;
              }

              void onCredential(response.credential);
            }}
            onError={() => onError("Unable to sign in with Google.")}
          />
        </GoogleOAuthProvider>
      </Box>
      <Divider>or</Divider>
    </>
  );
}
