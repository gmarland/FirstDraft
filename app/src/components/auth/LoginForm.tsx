import { FormEvent, useState } from "react";
import { Alert, Button, Stack, TextField } from "@mui/material";
import { useAuth } from "../../lib/auth";

type Props = {
  onLoggedIn(): void;
};

export function LoginForm({ onLoggedIn }: Props) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await login({ email: email.trim(), password });
      onLoggedIn();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack component="form" spacing={1.75} onSubmit={submit}>
      <TextField label="Email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required fullWidth />
      <TextField
        label="Password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        type="password"
        autoComplete="current-password"
        required
        fullWidth
      />
      {error && <Alert severity="error">{error}</Alert>}
      <Button variant="contained" type="submit" disabled={submitting} fullWidth>
        {submitting ? "Signing in" : "Sign in"}
      </Button>
    </Stack>
  );
}
