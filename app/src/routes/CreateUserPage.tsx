import { Button, Stack } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import { AuthHeader } from "../components/auth/AuthHeader";
import { AuthPageLayout } from "../components/auth/AuthPageLayout";
import { CreateUserForm } from "../components/auth/CreateUserForm";

type Props = {
  onBackToLogin(): void;
  onCreated(): void;
};

export function CreateUserPage({ onBackToLogin, onCreated }: Props) {
  return (
    <AuthPageLayout maxWidth={560}>
      <Stack spacing={2.5}>
        <Button variant="outlined" startIcon={<ChevronLeftIcon />} onClick={onBackToLogin} sx={{ alignSelf: "flex-start" }}>
          Back to sign in
        </Button>
        <AuthHeader title="Create User" />
        <CreateUserForm onCreated={onCreated} />
      </Stack>
    </AuthPageLayout>
  );
}
