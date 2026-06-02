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
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import CommitIcon from "@mui/icons-material/Commit";
import HubIcon from "@mui/icons-material/Hub";
import LanIcon from "@mui/icons-material/Lan";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import StorageIcon from "@mui/icons-material/Storage";
import TerminalIcon from "@mui/icons-material/Terminal";
import VisibilityIcon from "@mui/icons-material/Visibility";

type Props = {
  onLogin(): void;
  onCreateUser(): void;
};

const workerInstallCommands = `cd client
dotnet run -- init
dotnet run -- repos add
dotnet run -- integrations add jira
dotnet run -- run`;

const selfHostCommands = `docker pull gmarland/firstdraft-api:latest
docker pull gmarland/firstdraft-app:latest
docker run -e VITE_API_BASE_URL=https://api.example.com gmarland/firstdraft-app:latest`;

const localDevelopmentCommands = `docker compose up -d
cd api && npm install && cp .env.example .env && npm run dev
cd app && npm install && cp .env.example .env.local && npm run dev`;

const workflowSteps = [
  {
    title: "Console",
    description:
      "Sign in to inspect workers, task state, command history, output, and parsed responses.",
    icon: <VisibilityIcon />,
  },
  {
    title: "API",
    description:
      "Records worker state, Jira claims, command metadata, and durable output.",
    icon: <StorageIcon />,
  },
  {
    title: "Workers",
    description:
      "Run near the repositories, credentials, build tools, and private networks the work needs.",
    icon: <LanIcon />,
  },
  {
    title: "Gitflow",
    description:
      "Workers claim eligible Jira issues, execute repository-oriented work locally, and report results.",
    icon: <CommitIcon />,
  },
];

const featureCards = [
  {
    title: "Remote worker registry",
    description:
      "See connected workers, runtime state, advertised paths, skills, repositories, Jira integrations, and task capacity.",
  },
  {
    title: "Jira-driven intake",
    description:
      "Workers poll their own Jira integrations, claim matching repository-backed issues, and avoid duplicate active claims.",
  },
  {
    title: "Auditable output",
    description:
      "Command metadata, terminal output, parsed responses, status, and history are visible from the console.",
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
                  label="AI engineering work, run on machines you control"
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
                    A reporting plane for remote AI coding workers.
                  </Typography>
                  <Typography
                    sx={{
                      maxWidth: 700,
                      color: "#4f6470",
                      fontSize: 18,
                      lineHeight: 1.7,
                    }}
                  >
                    FirstDraft keeps the browser-visible audit trail while work
                    happens close to the repositories, CLI credentials, local
                    toolchains, and private networks it depends on.
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
                  Worker fleet snapshot
                </Box>
                <Stack
                  spacing={0}
                  divider={<Divider sx={{ borderColor: "#2b4148" }} />}
                >
                  <MetricRow label="Workers online" value="6" />
                  <MetricRow label="Ready Jira issues" value="18" />
                  <MetricRow label="Gitflow tasks running" value="4" />
                </Stack>
              </Box>
            </Box>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ py: { xs: 5, md: 7 } }}>
        <SectionHeading
          eyebrow="What it does"
          title="Operate a worker fleet without moving the work away from its context."
          body="Workers register with the API, advertise what they can safely access, claim eligible Jira issues, and send task progress back to the console."
        />
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr))" },
            gap: 2.5,
          }}
        >
          {featureCards.map((feature) => (
            <Box key={feature.title}>
              <Box sx={cardSx}>
                <Typography variant="h2" sx={{ mb: 1.25 }}>
                  {feature.title}
                </Typography>
                <Typography sx={bodyTextSx}>{feature.description}</Typography>
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
            eyebrow="Architecture"
            title="Browser visibility, API coordination, local execution."
            body="The API coordinates reporting and claim guarding. The worker owns execution and keeps credentials, repositories, and network access local."
          />
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "1fr",
                sm: "repeat(2, minmax(0, 1fr))",
                md: "repeat(4, minmax(0, 1fr))",
              },
              gap: 2,
            }}
          >
            {workflowSteps.map((step, index) => (
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
                  <Typography variant="h2" sx={{ mb: 1 }}>
                    {step.title}
                  </Typography>
                  <Typography sx={bodyTextSx}>{step.description}</Typography>
                </Box>
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
              body="Run the worker on a trusted machine that has the target repositories, build tools, AI CLI, Jira credentials, and internal network access."
              code={workerInstallCommands}
              footer="During init, set the external API URL, sign in or create a user, choose Codex or Claude, and select the paths and skills this worker should advertise."
            />
          </Box>
          <Box>
            <SetupPanel
              icon={<CloudUploadIcon />}
              eyebrow="Self-host"
              title="Run your own app and API images"
              body="Use the published Docker images or build your own from this repo. The API needs Postgres plus durable command output storage."
              code={selfHostCommands}
              footer="Set VITE_API_BASE_URL when running the app container so the browser points at your hosted API."
            />
          </Box>
        </Box>
      </Container>
    </Box>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <Stack
      direction="row"
      sx={{
        px: 2,
        py: 1.75,
        alignItems: "center",
        justifyContent: "space-between",
        gap: 2,
      }}
    >
      <Typography sx={{ color: "#9fb0b7" }}>{label}</Typography>
      <Typography sx={{ fontWeight: 900, color: "#ffffff" }}>
        {value}
      </Typography>
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
