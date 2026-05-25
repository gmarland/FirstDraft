import { Button, Stack } from "@mui/material";
import { AuthHeader } from "../components/auth/AuthHeader";
import { AuthPageLayout } from "../components/auth/AuthPageLayout";
import { LoginForm } from "../components/auth/LoginForm";

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
      </Stack>
    </AuthPageLayout>
  );
}
