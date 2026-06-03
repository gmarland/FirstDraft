import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from "@mui/material";

type Props = {
  externalApiUrl: string;
  open: boolean;
  onClose(): void;
};

const workerSetupCommands = `brew tap gmarland/firstdraft
brew install firstdraft
firstdraft init
firstdraft repos add
firstdraft integrations add jira
firstdraft run`;

export function WorkerSetupDialog({ externalApiUrl, open, onClose }: Props) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>How to set up a worker</DialogTitle>
      <DialogContent>
        <Stack spacing={2.25}>
          <Typography color="text.secondary">
            Install the client worker on a trusted machine that can access the
            repositories, build tools, AI CLI, Jira credentials, and private
            network resources the work needs.
          </Typography>

          <Box>
            <Typography
              sx={{
                mb: 0.75,
                color: "text.secondary",
                fontSize: 12,
                fontWeight: 800,
                textTransform: "uppercase",
              }}
            >
              External API URL
            </Typography>
            <Box
              component="code"
              sx={{
                display: "block",
                p: 1.5,
                border: "1px solid #dce5e9",
                borderRadius: 1,
                bgcolor: "#f5f7f8",
                color: "text.primary",
                overflowX: "auto",
                whiteSpace: "nowrap",
              }}
            >
              {externalApiUrl}
            </Box>
          </Box>

          <Box
            component="pre"
            sx={{
              m: 0,
              p: 2,
              borderRadius: 1,
              bgcolor: "#142126",
              color: "#ecf2f4",
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
              fontSize: 13,
              lineHeight: 1.7,
              overflowX: "auto",
              whiteSpace: "pre",
            }}
          >
            {workerSetupCommands}
          </Box>

          <Stack component="ol" spacing={1} sx={{ pl: 3, m: 0 }}>
            <Typography component="li" color="text.secondary">
              During <Box component="code">firstdraft init</Box>, enter the
              external API URL{" "}
              <Box component="code">{externalApiUrl}</Box> and sign in or create
              a user.
            </Typography>
            <Typography component="li" color="text.secondary">
              Choose the local AI provider, such as Codex or Claude, then select
              the paths and skills this worker is allowed to advertise.
            </Typography>
            <Typography component="li" color="text.secondary">
              Add repositories and optional Jira integrations before starting
              the worker with <Box component="code">firstdraft run</Box>.
            </Typography>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="contained" onClick={onClose}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
