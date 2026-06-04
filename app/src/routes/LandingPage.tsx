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
import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import CompareArrowsIcon from "@mui/icons-material/CompareArrows";
import GroupsIcon from "@mui/icons-material/Groups";

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
    title: "Ticket becomes ready",
    detail: "A Jira issue hits the configured ready status.",
    icon: <VisibilityIcon />,
  },
  {
    title: "Worker claims it",
    detail: "FirstDraft locks the ticket before any work begins.",
    icon: <LanIcon />,
  },
  {
    title: "Agent implements it",
    detail: "Codex or Claude Code works locally in the target repo.",
    icon: <AutoAwesomeIcon />,
  },
  {
    title: "Draft PR opens",
    detail: "A branch is pushed and linked back to Jira for review.",
    icon: <CommitIcon />,
  },
];

const proofPoints = [
  {
    title: "Backlog-first workflow",
    description:
      "Developers do not need to start every AI session manually. Put the work in Jira and let a worker pick it up.",
    icon: <AssignmentTurnedInIcon />,
  },
  {
    title: "Runs where your code already lives",
    description:
      "Workers run on your own machine or infrastructure, with your repos, tools, credentials, and network access.",
    icon: <TerminalIcon />,
  },
  {
    title: "Built for human review",
    description:
      "FirstDraft does not pretend the AI is done when code is generated. The output is a draft PR for a developer to inspect.",
    icon: <GroupsIcon />,
  },
];

const comparisonRows = [
  {
    firstDraft: "Starts from Jira tickets",
    typical: "Starts from a chat prompt",
  },
  {
    firstDraft: "Workers claim tasks before execution",
    typical: "A developer manually starts each session",
  },
  {
    firstDraft: "Runs continuously against a board",
    typical: "Runs as a one-off coding assistant",
  },
  {
    firstDraft: "Uses local repos, tools, and credentials",
    typical: "Often runs in a separate sandbox",
  },
  {
    firstDraft: "Produces draft PRs for review",
    typical: "Produces code that still needs wiring into workflow",
  },
];

const setupSteps = [
  {
    title: "Install a worker",
    description:
      "Run FirstDraft on a trusted machine that already has Codex or Claude Code, your repos, build tools, GitHub auth, Jira credentials, and network access.",
    icon: <AutoAwesomeIcon />,
  },
  {
    title: "Register the repo",
    description:
      "Add the repository URL plus source and PR target branches. Tickets are only picked up when they match a repository this worker can access.",
    icon: <CommitIcon />,
  },
  {
    title: "Connect Jira",
    description:
      "Choose the board, ready status, processing status, and done status. Optionally restrict intake by assignee.",
    icon: <VisibilityIcon />,
  },
  {
    title: "Let it run",
    description:
      "The worker polls Jira, claims eligible tickets, runs the AI coding agent locally, opens a draft PR, and reports back.",
    icon: <LanIcon />,
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
              <Box sx={logoSx}>
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
          <Box sx={heroGridSx}>
            <Stack spacing={3}>
              <Chip
                label="Autonomous Jira-to-PR workers"
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
                    fontSize: { xs: 38, md: 58 },
                    lineHeight: 1.03,
                    color: "#172026",
                  }}
                >
                  Put work into Jira. Let an AI worker pick it up.
                </Typography>
                <Typography
                  sx={{
                    maxWidth: 700,
                    color: "#4f6470",
                    fontSize: 19,
                    lineHeight: 1.7,
                  }}
                >
                  FirstDraft runs Codex or Claude Code where your code already
                  lives. Workers claim Jira tickets, implement them locally,
                  open draft pull requests, and report progress back for human
                  review.
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
                <Button
                  variant="outlined"
                  size="large"
                  href="https://github.com/gmarland/FirstDraft"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on GitHub
                </Button>
              </Stack>
              <Typography sx={{ color: "#667985", fontSize: 14 }}>
                Built for teams experimenting with AI coding agents but still
                managing real work through Jira and pull requests.
              </Typography>
            </Stack>

            <Box sx={terminalSx}>
              <Box sx={terminalHeaderSx}>Live ticket path</Box>
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
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: { xs: 5, md: 7 } }}>
        <SectionHeading
          eyebrow="Why FirstDraft exists"
          title="AI coding tools still need someone to drive the work. FirstDraft gives them a backlog."
          body="Most AI coding sessions begin with a developer copying context into a chat or terminal. FirstDraft flips that flow: the ticket is the source of work, the worker claims it, and the developer reviews the result."
        />
        <Box sx={threeColumnGridSx}>
          {proofPoints.map((point) => (
            <Box sx={cardSx} key={point.title}>
              <Stack
                direction="row"
                spacing={1.25}
                sx={{ mb: 1.5, alignItems: "center" }}
              >
                <Box sx={iconBoxSx}>{point.icon}</Box>
              </Stack>
              <Typography variant="h2" sx={{ mb: 1.25 }}>
                {point.title}
              </Typography>
              <Typography sx={bodyTextSx}>{point.description}</Typography>
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
            eyebrow="How it is different"
            title="Not another chat-based coding assistant."
            body="FirstDraft is designed for repository-backed Jira work where AI workers run continuously, claim tasks safely, and produce reviewable pull requests."
          />

          <Box sx={comparisonSx}>
            <ComparisonHeader />
            {comparisonRows.map((row) => (
              <ComparisonRow
                key={row.firstDraft}
                firstDraft={row.firstDraft}
                typical={row.typical}
              />
            ))}
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: { xs: 5, md: 7 } }}>
        <SectionHeading
          eyebrow="How it works"
          title="Set up a worker, point it at Jira, and let it take the next ticket."
          body="Each worker advertises what it can reach, polls its configured board, and accepts work only when the ticket matches its repositories and capacity."
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
            <Box key={step.title} sx={stepSx}>
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
            title="From Jira issue to draft PR, without turning your workflow into a chat session."
            body="Once a ticket is claimed, the worker moves it to processing, prepares the repository, runs Codex or Claude Code in a local worktree, commits and pushes a branch, opens a draft pull request, and comments the result back to Jira."
          />
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
          <SetupPanel
            icon={<TerminalIcon />}
            eyebrow="Worker setup"
            title="Install and configure a worker"
            body="The quickest path from a blank machine to an active AI worker that can pick up Jira work and open draft PRs."
            code={workerInstallCommands}
            footer="During init, set the external API URL, sign in or create a user, choose Codex or Claude Code, and select the paths and skills this worker should advertise. Then add a repository and Jira board before starting the worker."
          />

          <SetupPanel
            icon={<CloudUploadIcon />}
            eyebrow="Self-host"
            title="Run the Docker Compose stack"
            body="Clone the FirstDraft repository and start the checked-in Compose file. It pulls the published app and API images, plus Postgres and MinIO."
            code={selfHostCommands}
            footer="Override JWT_SECRET, WORKER_JWT_SECRET, TENANT_ADMIN_KEY, VITE_API_BASE_URL, API_HOST_PORT, or APP_HOST_PORT from a root .env file or shell environment."
          />
        </Box>
      </Container>
      <a
        aria-label="GitHub repository"
        href="https://github.com/gmarland/FirstDraft"
        style={{
          position: "fixed",
          bottom: 16,
          right: 16,
          width: 38,
          height: 38,
        }}
        target="_blank"
        rel="noopener noreferrer"
      >
        <svg viewBox="0 0 20 20">
          <path d="M10 0C4.475 0 0 4.475 0 10a9.994 9.994 0 006.838 9.488c.5.087.687-.213.687-.476 0-.237-.013-1.024-.013-1.862-2.512.463-3.162-.612-3.362-1.175-.113-.287-.6-1.175-1.025-1.412-.35-.188-.85-.65-.013-.663.788-.013 1.35.725 1.538 1.025.9 1.512 2.337 1.087 2.912.825.088-.65.35-1.088.638-1.338-2.225-.25-4.55-1.112-4.55-4.937 0-1.088.387-1.987 1.025-2.688-.1-.25-.45-1.274.1-2.65 0 0 .837-.262 2.75 1.026a9.28 9.28 0 012.5-.338c.85 0 1.7.112 2.5.337 1.912-1.3 2.75-1.024 2.75-1.024.55 1.375.2 2.4.1 2.65.637.7 1.025 1.587 1.025 2.687 0 3.838-2.337 4.688-4.562 4.938.362.312.675.912.675 1.85 0 1.337-.013 2.412-.013 2.75 0 .262.188.574.688.474A10.016 10.016 0 0020 10c0-5.525-4.475-10-10-10z"></path>
        </svg>
      </a>
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
    <Stack spacing={1.25} sx={{ maxWidth: 780, mb: 3 }}>
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
        sx={{ fontSize: { xs: 28, md: 36 }, lineHeight: 1.16 }}
      >
        {title}
      </Typography>
      <Typography sx={{ ...bodyTextSx, fontSize: 16 }}>{body}</Typography>
    </Stack>
  );
}

function ComparisonHeader() {
  return (
    <Box sx={comparisonRowSx}>
      <Typography sx={comparisonHeaderTextSx}>FirstDraft</Typography>
      <Typography sx={comparisonHeaderTextSx}>
        Typical AI coding tools
      </Typography>
    </Box>
  );
}

function ComparisonRow({
  firstDraft,
  typical,
}: {
  firstDraft: string;
  typical: string;
}) {
  return (
    <Box sx={comparisonRowSx}>
      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <CompareArrowsIcon sx={{ color: "#2364aa", fontSize: 18 }} />
        <Typography sx={{ color: "#172026", fontWeight: 800 }}>
          {firstDraft}
        </Typography>
      </Stack>
      <Typography sx={bodyTextSx}>{typical}</Typography>
    </Box>
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

const logoSx = {
  display: "grid",
  placeItems: "center",
  width: 38,
  height: 38,
  borderRadius: 2,
  bgcolor: "#142126",
  color: "#ffffff",
};

const heroGridSx = {
  display: "grid",
  gridTemplateColumns: {
    xs: "1fr",
    md: "minmax(0, 1.35fr) minmax(340px, 0.9fr)",
  },
  gap: { xs: 4, md: 7 },
  alignItems: "center",
};

const terminalSx = {
  border: "1px solid #cfdde3",
  borderRadius: 2,
  bgcolor: "#142126",
  color: "#ecf2f4",
  overflow: "hidden",
  boxShadow: "0 24px 64px rgba(20, 33, 38, 0.18)",
};

const terminalHeaderSx = {
  px: 2,
  py: 1.25,
  borderBottom: "1px solid #2b4148",
  color: "#9fb0b7",
  fontWeight: 800,
  fontSize: 13,
};

const threeColumnGridSx = {
  display: "grid",
  gridTemplateColumns: {
    xs: "1fr",
    md: "repeat(3, minmax(0, 1fr))",
  },
  gap: 2.5,
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

const comparisonSx = {
  border: "1px solid #dde5e8",
  borderRadius: 2,
  overflow: "hidden",
};

const comparisonRowSx = {
  display: "grid",
  gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
  gap: 2,
  p: 2,
  bgcolor: "#ffffff",
  borderBottom: "1px solid #dde5e8",
  "&:last-child": {
    borderBottom: 0,
  },
};

const comparisonHeaderTextSx = {
  color: "#172026",
  fontWeight: 900,
  fontSize: 14,
};
