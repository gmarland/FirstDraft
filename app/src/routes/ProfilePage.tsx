import { FormEvent, SyntheticEvent, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Snackbar,
  Stack,
  TextField,
} from "@mui/material";
import SaveIcon from "@mui/icons-material/Save";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../lib/auth";
import type { UpdateProfileInput } from "../types/api";

export function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const [email, setEmail] = useState(user?.email ?? "");
  const [name, setName] = useState(user?.name ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState(false);

  useEffect(() => {
    setEmail(user?.email ?? "");
    setName(user?.name ?? "");
  }, [user?.email, user?.name]);

  const closeNotice = (_event?: Event | SyntheticEvent, reason?: string) => {
    if (reason === "clickaway") return;
    setNotice(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(false);

    const trimmedEmail = email.trim();
    const trimmedName = name.trim();
    if (!trimmedEmail) {
      setError("Email is required.");
      return;
    }

    const changingPassword = password.length > 0 || confirmPassword.length > 0;
    if (changingPassword && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (changingPassword && password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    const input: UpdateProfileInput = {
      email: trimmedEmail,
      name: trimmedName,
    };

    if (changingPassword) {
      input.password = password;
    }

    setSaving(true);
    try {
      await updateProfile(input);
      setPassword("");
      setConfirmPassword("");
      setNotice(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={2.75}>
      <PageHeader title="Profile" />

      <Card sx={{ maxWidth: 640 }}>
        <CardContent>
          <Stack component="form" spacing={2} onSubmit={submit}>
            <TextField
              label="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              autoComplete="email"
              required
              disabled={saving}
              fullWidth
            />
            <TextField
              label="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              disabled={saving}
              fullWidth
            />
            <TextField
              label="New password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type="password"
              autoComplete="new-password"
              disabled={saving}
              fullWidth
            />
            <TextField
              label="Confirm new password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              type="password"
              autoComplete="new-password"
              disabled={saving}
              fullWidth
            />
            {error && <Alert severity="error">{error}</Alert>}
            <Button
              variant="contained"
              type="submit"
              startIcon={<SaveIcon />}
              disabled={saving || !email.trim()}
              sx={{ alignSelf: "flex-start" }}
            >
              {saving ? "Saving" : "Save profile"}
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Snackbar
        open={notice}
        autoHideDuration={3500}
        onClose={closeNotice}
        message="Profile updated."
      />
    </Stack>
  );
}
