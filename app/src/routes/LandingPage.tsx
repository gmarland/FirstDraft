import {
  Box,
  Button,
  Chip,
  Container,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CommitIcon from "@mui/icons-material/Commit";
import HubIcon from "@mui/icons-material/Hub";
import LanIcon from "@mui/icons-material/Lan";
import TerminalIcon from "@mui/icons-material/Terminal";
import VisibilityIcon from "@mui/icons-material/Visibility";

type Props = {
  onLogin(): void;
  onCreateUser(): void;
};

const workerInstallCommands = `brew tap gmarland/firstdraft
brew install firstdraft
firstdraft init
firstdraft repos add
firstdraft integrations add jira
firstdraft run`;

const selfHostCommands = `git clone https://github.com/gmarland/FirstDraft.git
cd FirstDraft
docker compose up -d`;

const pipelineSteps = [
  {
    title: "Jira issue",
    detail: "FD-142 is ready on the configured board.",
    icon: <VisibilityIcon />,
  },
  {
    title: "Worker claim",
    detail: "A local worker claims it.",
    icon: <LanIcon />,
  },
  {
    title: "AI worker run",
    detail: "Codex or Claude Code implements it in the target repository.",
    icon: <AutoAwesomeIcon />,
  },
  {
    title: "Draft PR",
    detail: "A branch is pushed and a reviewable draft PR is opened.",
    icon: <CommitIcon />,
  },
];

const setupSteps = [
  {
    title: "Install a worker",
    description:
      "Run a FirstDraft AI worker on a trusted machine that already has Codex or Claude Code, your repos, build tools, GitHub auth, Jira credentials, and network access.",
    icon: <AutoAwesomeIcon />,
  },
  {
    title: "Register the repo",
    description:
      "Add the repository URL plus source and PR target branches. Jira tickets are only picked up when their repository matches this worker.",
    icon: <CommitIcon />,
  },
  {
    title: "Point it at Jira",
    description:
      "Connect a Jira board, choose ready, processing, and processed statuses, and optionally filter by assignee.",
    icon: <VisibilityIcon />,
  },
  {
    title: "Let it run",
    description:
      "The worker polls Jira, claims eligible tickets, runs gitflow locally, and sends status and output back to the console.",
    icon: <LanIcon />,
  },
];

const executionFacts = [
  {
    title: "Runs your AI coding agent locally",
    description:
      "Each ticket is handed to the configured Codex or Claude Code CLI with the local repository, attachments, tools, and credentials already available.",
  },
  {
    title: "Claims before execution",
    description:
      "The API records Jira claims and rejects duplicate active claims, so one ticket is handled by one worker.",
  },
  {
    title: "Generates reviewer-ready output",
    description:
      "Gitflow creates a branch, commits changes, pushes to origin, opens a draft PR, and posts completion details back to Jira.",
  },
];

export function LandingPage({ onLogin, onCreateUser }: Props) {
  return (
    <Box component="main" sx={{ minHeight: "100vh", bgcolor: "#f5f7f8" }}>
      <Box
        component="header"
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          borderBottom: "1px solid #dce5e9",
          bgcolor: "rgba(245, 247, 248, 0.94)",
          backdropFilter: "blur(12px)",
        }}
      >
        <Container maxWidth="lg">
          <Stack
            direction="row"
            sx={{
              minHeight: 72,
              alignItems: "center",
              justifyContent: "space-between",
              gap: 2,
            }}
          >
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
              <Box
                sx={{
                  display: "grid",
                  placeItems: "center",
                  width: 38,
                  height: 38,
                  borderRadius: 2,
                  bgcolor: "#142126",
                  color: "#ffffff",
                }}
              >
                <HubIcon fontSize="small" />
              </Box>
              <Typography
                variant="h2"
                component="div"
                sx={{ fontSize: 20, color: "#172026" }}
              >
                FirstDraft
              </Typography>
            </Stack>
            <Stack direction="row" spacing={1}>
              <Button variant="text" onClick={onLogin}>
                Login
              </Button>
              <Button
                variant="contained"
                onClick={onCreateUser}
                endIcon={<ArrowForwardIcon />}
              >
                Sign up
              </Button>
            </Stack>
          </Stack>
        </Container>
      </Box>

      <Box
        sx={{
          borderBottom: "1px solid #dde5e8",
          background:
            "linear-gradient(135deg, rgba(35, 100, 170, 0.12), rgba(46, 125, 50, 0.08) 52%, rgba(237, 108, 2, 0.08)), #f5f7f8",
        }}
      >
        <Container maxWidth="lg" sx={{ py: { xs: 6, md: 9 } }}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                md: "minmax(0, 1.4fr) minmax(340px, 0.9fr)",
              },
              gap: { xs: 4, md: 7 },
              alignItems: "center",
            }}
          >
            <Box>
              <Stack spacing={3}>
                <Chip
                  label="AI workers for Jira-to-PR flow"
                  sx={{
                    alignSelf: "flex-start",
                    bgcolor: "#e8f0f5",
                    color: "#2364aa",
                    fontWeight: 800,
                  }}
                />
                <Stack spacing={2}>
                  <Typography
                    variant="h1"
                    sx={{
                      maxWidth: 760,
                      fontSize: { xs: 38, md: 56 },
                      lineHeight: 1.05,
                      color: "#172026",
                    }}
                  >
                    Point an AI worker at Jira. Codex or Claude Code picks up
                    tickets and opens draft PRs.
                  </Typography>
                  <Typography
                    sx={{
                      maxWidth: 700,
                      color: "#4f6470",
                      fontSize: 18,
                      lineHeight: 1.7,
                    }}
                  >
                    Install FirstDraft on a machine with Codex or Claude Code,
                    your repositories, tools, credentials, and network access.
                    Connect a Jira board, choose the statuses that mean ready,
                    processing, and done, and the AI worker claims eligible
                    tickets, implements them locally, and reports every step
                    back to the console.
                  </Typography>
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                  <Button
                    variant="contained"
                    size="large"
                    onClick={onCreateUser}
                    endIcon={<ArrowForwardIcon />}
                  >
                    Create user
                  </Button>
                  <Button variant="outlined" size="large" onClick={onLogin}>
                    Login
                  </Button>
                </Stack>
              </Stack>
            </Box>
            <Box>
              <Box
                sx={{
                  border: "1px solid #cfdde3",
                  borderRadius: 2,
                  bgcolor: "#142126",
                  color: "#ecf2f4",
                  overflow: "hidden",
                  boxShadow: "0 24px 64px rgba(20, 33, 38, 0.18)",
                }}
              >
                <Box
                  sx={{
                    px: 2,
                    py: 1.25,
                    borderBottom: "1px solid #2b4148",
                    color: "#9fb0b7",
                    fontWeight: 800,
                    fontSize: 13,
                  }}
                >
                  Live ticket path
                </Box>
                <Stack
                  spacing={0}
                  divider={<Divider sx={{ borderColor: "#2b4148" }} />}
                >
                  {pipelineSteps.map((step, index) => (
                    <PipelineRow key={step.title} step={step} index={index} />
                  ))}
                </Stack>
              </Box>
            </Box>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: { xs: 5, md: 7 } }}>
        <SectionHeading
          eyebrow="How it works"
          title="Set up a Codex or Claude Code worker, point it at a Jira board, and let it take the next ticket."
          body="FirstDraft is worker-owned intake for repository-backed Jira work. Each AI worker advertises what it can reach, polls its configured board, and accepts work only when the ticket matches its repositories and capacity."
        />
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr",
              sm: "repeat(2, minmax(0, 1fr))",
              md: "repeat(4, minmax(0, 1fr))",
            },
            gap: 2.5,
          }}
        >
          {setupSteps.map((step, index) => (
            <Box key={step.title}>
              <Box sx={stepSx}>
                <Stack
                  direction="row"
                  spacing={1.25}
                  sx={{ mb: 1.5, alignItems: "center" }}
                >
                  <Box sx={iconBoxSx}>{step.icon}</Box>
                  <Typography sx={{ color: "#667985", fontWeight: 800 }}>
                    {String(index + 1).padStart(2, "0")}
                  </Typography>
                </Stack>
                <Typography variant="h2" sx={{ mb: 1.25 }}>
                  {step.title}
                </Typography>
                <Typography sx={bodyTextSx}>{step.description}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Container>

      <Box
        sx={{
          bgcolor: "#ffffff",
          borderTop: "1px solid #dde5e8",
          borderBottom: "1px solid #dde5e8",
        }}
      >
        <Container maxWidth="lg" sx={{ py: { xs: 5, md: 7 } }}>
          <SectionHeading
            eyebrow="Execution"
            title="The AI worker turns a Jira issue into a reviewable draft PR."
            body="Once a ticket is claimed, the worker moves the issue to processing, prepares the repository, runs Codex or Claude Code in a local worktree, commits and pushes the branch, creates a draft pull request, and comments the result back to Jira."
          />
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                md: "repeat(3, minmax(0, 1fr))",
              },
              gap: 2.5,
            }}
          >
            {executionFacts.map((fact) => (
              <Box sx={cardSx} key={fact.title}>
                <Typography variant="h2" sx={{ mb: 1.25 }}>
                  {fact.title}
                </Typography>
                <Typography sx={bodyTextSx}>{fact.description}</Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: { xs: 5, md: 7 } }}>
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
            gap: 3,
          }}
        >
          <Box>
            <SetupPanel
              icon={<TerminalIcon />}
              eyebrow="Worker setup"
              title="Install and configure a worker"
              body="This is the path from a blank machine to an active AI worker that can pick up Jira work and open draft PRs."
              code={workerInstallCommands}
              footer="During init, set the external API URL, sign in or create a user, choose Codex or Claude Code, and select the paths and skills this AI worker should advertise. Then add a repository and Jira board before starting the worker."
            />
          </Box>
          <Box>
            <SetupPanel
              icon={<CloudUploadIcon />}
              eyebrow="Self-host"
              title="Run the GitHub Docker Compose stack"
              body="Clone the FirstDraft repository and start the checked-in Compose file. It pulls the published app and API images, plus Postgres and MinIO."
              code={selfHostCommands}
              footer="Override JWT_SECRET, WORKER_JWT_SECRET, TENANT_ADMIN_KEY, VITE_API_BASE_URL, API_HOST_PORT, or APP_HOST_PORT from a root .env file or shell environment."
            />
          </Box>
        </Box>
      </Container>
    </Box>
  );
}

function PipelineRow({
  step,
  index,
}: {
  step: { title: string; detail: string; icon: ReactNode };
  index: number;
}) {
  return (
    <Stack
      direction="row"
      sx={{
        px: 2,
        py: 1.5,
        alignItems: "center",
        gap: 1.5,
      }}
    >
      <Box
        sx={{
          display: "grid",
          placeItems: "center",
          width: 34,
          height: 34,
          borderRadius: 1.5,
          bgcolor: "#20343c",
          color: "#8ec5ff",
          flexShrink: 0,
        }}
      >
        {step.icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography
          sx={{
            color: "#ecf2f4",
            fontWeight: 900,
            lineHeight: 1.25,
          }}
        >
          {String(index + 1).padStart(2, "0")} {step.title}
        </Typography>
        <Typography sx={{ color: "#9fb0b7", fontSize: 13, lineHeight: 1.45 }}>
          {step.detail}
        </Typography>
      </Box>
    </Stack>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <Stack spacing={1.25} sx={{ maxWidth: 760, mb: 3 }}>
      <Typography
        sx={{
          color: "#2364aa",
          fontWeight: 900,
          fontSize: 13,
          textTransform: "uppercase",
        }}
      >
        {eyebrow}
      </Typography>
      <Typography
        variant="h1"
        sx={{ fontSize: { xs: 28, md: 34 }, lineHeight: 1.18 }}
      >
        {title}
      </Typography>
      <Typography sx={{ ...bodyTextSx, fontSize: 16 }}>{body}</Typography>
    </Stack>
  );
}

function SetupPanel({
  icon,
  eyebrow,
  title,
  body,
  code,
  footer,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  body: string;
  code: string;
  footer: string;
}) {
  return (
    <Box sx={cardSx}>
      <Stack
        direction="row"
        spacing={1.25}
        sx={{ mb: 1.5, alignItems: "center" }}
      >
        <Box sx={iconBoxSx}>{icon}</Box>
        <Typography
          sx={{
            color: "#2364aa",
            fontWeight: 900,
            fontSize: 13,
            textTransform: "uppercase",
          }}
        >
          {eyebrow}
        </Typography>
      </Stack>
      <Typography variant="h2" sx={{ mb: 1 }}>
        {title}
      </Typography>
      <Typography sx={{ ...bodyTextSx, mb: 2 }}>{body}</Typography>
      <Box component="pre" className="code-block landing-code-block">
        <code>{code}</code>
      </Box>
      <Typography sx={{ ...bodyTextSx, mt: 2 }}>{footer}</Typography>
    </Box>
  );
}

const bodyTextSx = {
  color: "#667985",
  lineHeight: 1.65,
};

const cardSx = {
  height: "100%",
  border: "1px solid #dde5e8",
  borderRadius: 2,
  bgcolor: "#ffffff",
  p: { xs: 2.25, md: 2.75 },
};

const stepSx = {
  ...cardSx,
  bgcolor: "#f8fafb",
};

const iconBoxSx = {
  display: "grid",
  placeItems: "center",
  width: 36,
  height: 36,
  borderRadius: 1.5,
  bgcolor: "#e8f0f5",
  color: "#2364aa",
  flexShrink: 0,
};
