import { FormEvent, useState } from "react";
import { Alert, Button, Stack, TextField } from "@mui/material";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import { useAuth } from "../../lib/auth";
import { GoogleAuthButton } from "./GoogleAuthButton";

type Props = {
  onCreated(): void;
};

export function CreateUserForm({ onCreated }: Props) {
  const { googleSignup, signup } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await signup({
        email: email.trim(),
        password,
        name: name.trim() || undefined,
      });
      onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create user");
    } finally {
      setSubmitting(false);
    }
  };

  const submitGoogle = async (credential: string) => {
    setSubmitting(true);
    setError(null);

    try {
      await googleSignup(credential);
      onCreated();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to create user with Google");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack component="form" spacing={1.75} onSubmit={submit}>
      <GoogleAuthButton onCredential={submitGoogle} onError={setError} disabled={submitting} />
      <TextField label="Email" value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required fullWidth />
      <TextField label="Name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" fullWidth />
      <TextField
        label="Password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        type="password"
        autoComplete="new-password"
        required
        fullWidth
      />
      <TextField
        label="Confirm password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        type="password"
        autoComplete="new-password"
        required
        fullWidth
      />
      {error && <Alert severity="error">{error}</Alert>}
      <Button variant="contained" type="submit" startIcon={<PersonAddIcon />} disabled={submitting || !email.trim() || !password} fullWidth>
        {submitting ? "Creating" : "Create user"}
      </Button>
    </Stack>
  );
}
