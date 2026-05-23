import { Button, Stack, Typography } from "@mui/material";
import { AuthHeader } from "../components/auth/AuthHeader";
import { AuthPageLayout } from "../components/auth/AuthPageLayout";
import { LoginForm } from "../components/auth/LoginForm";
import { api } from "../lib/api";

type Props = {
  onCreateUser(): void;
  onLoggedIn(): void;
};

export function LoginPage({ onCreateUser, onLoggedIn }: Props) {
  return (
    <AuthPageLayout maxWidth={440}>
      <Stack spacing={2.5}>
        <AuthHeader title="Operations Console" />
        <LoginForm onLoggedIn={onLoggedIn} />
        <Button variant="outlined" onClick={onCreateUser} fullWidth>
          Create user
        </Button>
        <Typography variant="body2" color="text.secondary">
          API: {api.baseUrl}
        </Typography>
      </Stack>
    </AuthPageLayout>
  );
}
