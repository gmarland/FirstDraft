import { FormEvent, SyntheticEvent, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import { DeleteConfirmationDialog } from "../components/DeleteConfirmationDialog";
import { PageHeader } from "../components/PageHeader";
import { useAuth } from "../lib/auth";
import type { UpdateProfileInput } from "../types/api";

export function ProfilePage() {
  const { user, updateProfile, deleteProfile } = useAuth();
  const [tab, setTab] = useState<"profile" | "delete">("profile");
  const [email, setEmail] = useState(user?.email ?? "");
  const [name, setName] = useState(user?.name ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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

  const confirmDeleteProfile = async () => {
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteProfile();
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : "Unable to delete profile");
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  };

  return (
    <Stack spacing={2.75}>
      <PageHeader title="Profile" />

      <Card sx={{ maxWidth: 640 }}>
        <Tabs
          value={tab}
          onChange={(_event, value: "profile" | "delete") => {
            setTab(value);
            setError(null);
            setDeleteError(null);
          }}
          aria-label="Profile sections"
          sx={{ borderBottom: 1, borderColor: "divider", px: 2 }}
        >
          <Tab label="Profile" value="profile" />
          <Tab label="Delete" value="delete" />
        </Tabs>
        <CardContent>
          {tab === "profile" ? (
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
          ) : (
            <Stack spacing={2}>
              <Typography variant="h6" component="h2">
                Delete profile
              </Typography>
              <Typography color="text.secondary">
                Permanently delete your profile and data from FirstDraft.
              </Typography>
              {deleteError && <Alert severity="error">{deleteError}</Alert>}
              <Button
                variant="contained"
                color="error"
                startIcon={<DeleteIcon />}
                disabled={deleting}
                onClick={() => {
                  setDeleteError(null);
                  setDeleteDialogOpen(true);
                }}
                sx={{ alignSelf: "flex-start" }}
              >
                {deleting ? "Deleting" : "Delete profile"}
              </Button>
            </Stack>
          )}
        </CardContent>
      </Card>

      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        title="Delete profile?"
        description="Deleting your profile cannot be undone. This will permanently delete your profile and all of your FirstDraft data."
        confirmLabel="Delete profile"
        submitting={deleting}
        onClose={() => {
          if (!deleting) setDeleteDialogOpen(false);
        }}
        onConfirm={confirmDeleteProfile}
      />

      <Snackbar
        open={notice}
        autoHideDuration={3500}
        onClose={closeNotice}
        message="Profile updated."
      />
    </Stack>
  );
}
