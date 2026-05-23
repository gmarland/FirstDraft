# FirstDraft

FirstDraft is a self-hosted control plane for running AI-assisted engineering work on remote machines you control.

Put workers next to the repositories, credentials, build tools, and internal networks they need, then turn those workers on from a browser or from Jira. FirstDraft is built for teams who want more than a single local coding agent: a fleet of addressable workers can sit on remote machines, advertise what they can do, and pick up operational work as soon as the UI or an enabled Jira workflow sends it their way.

## Why FirstDraft

AI coding tools are most useful when they can work where the real context lives: cloned repositories, local toolchains, internal services, private networks, and team-specific workflows. FirstDraft turns those machines into an on-demand worker fleet.

- Run multiple workers on remote machines and enable the right one for each job.
- Use the web UI to inspect workers, choose a target, and dispatch work manually.
- Use Jira intake to turn ready issues into worker tasks without a developer babysitting the queue.
- Queue AI, shell, or gitflow commands against registered workers.
- Watch command status, streamed output, parsed responses, and history from a web console.
- Register worker capabilities and paths so tasks are sent only where they can run.
- Run Codex or Claude through local CLI providers instead of building a new agent runtime.
- Keep worker execution close to source code, credentials, and build environments you already manage.
- Integrate repository workflows and Jira intake so operational requests can become worker tasks.

## What You Get

This repository contains the full FirstDraft stack:

| Path | Purpose |
| --- | --- |
| `api/` | Express API, authentication, worker coordination, SignalR-compatible hub, OpenAPI docs, persistence, and integrations |
| `app/` | React/Vite console for users, workers, repositories, integrations, API keys, and command history |
| `client/` | .NET worker that connects to the API, advertises skills, and executes shell, AI, and gitflow commands |
| `docker-compose.yml` | Local Postgres, Redis, and MinIO services for development |

## Architecture

```text
Browser console / Jira / API clients
            |
            v
      FirstDraft API
   Express + Postgres + Redis
            |
            v
      WorkerHub connection
            |
            v
  firstdraft .NET workers
  shell | Codex | Claude | gitflow
            |
            v
 local repositories and toolchains
```

Workers authenticate with API credentials, maintain a live hub connection, and execute commands on the machines where they are installed. The API records command metadata in Postgres, tracks live state in Redis, and writes command output as NDJSON so runs can be audited after the fact.

## Remote Worker Fleet

The main idea is simple: leave capable workers running on the machines that already have the right access.

- A worker on a build server can run tests against heavyweight dependencies.
- A worker inside a private network can reach internal services without exposing them.
- A worker with a checked-out repository can run gitflow tasks and produce pull request-ready output.
- Multiple workers can advertise different paths, skills, and capacity, then be selected from the UI or targeted by automation.

That makes FirstDraft useful as a shared execution layer, not just a chat interface for one laptop.

## Jira-Driven Automation

FirstDraft can connect Jira intake to the worker fleet. Configure a Jira connection, choose the board and statuses that represent ready, processing, and processed work, then enable intake from the UI.

When intake runs, FirstDraft finds eligible issues and queues repository-backed worker tasks. This is where the system becomes more than manual dispatch: Jira can become the trigger for remote AI engineering work, with status transitions and command output keeping the workflow visible.

## Features

- **Remote worker registry**: see connected workers, status, advertised skills, task capacity, and registered paths.
- **UI-driven dispatch**: choose a worker and queue `ai`, `shell`, or `gitflow` commands from the console.
- **Jira intake**: enable Jira workflows that turn ready tickets into repository-backed worker tasks.
- **Live output**: stream command output while retaining durable command history.
- **Gitflow workflows**: let workers clone or reuse repository workspaces, run agent tasks, and format pull request-oriented results.
- **Scoped worker config**: configure application paths, logs, AI working directory, skills, and concurrent gitflow capacity.
- **User auth and API keys**: create users, sign in, and manage per-user API keys.
- **OpenAPI docs**: inspect the API at `/api/docs` and fetch the raw spec at `/swagger.json`.

## Quick Start

### Prerequisites

- Node.js 20+
- npm
- Docker and Docker Compose
- .NET SDK 10
- Codex CLI or Claude CLI if you want AI command execution

### 1. Start local infrastructure

```bash
docker compose up -d
```

This starts Postgres, Redis, and MinIO. MinIO creates a local `firstdraft-command-output` bucket for command output storage.

### 2. Run the API

```bash
cd api
npm install

cat > .env <<'EOF'
DATABASE_URL=postgres://firstdraft:firstdraft@localhost:5432/firstdraft
JWT_SECRET=replace-with-a-local-development-secret
REDIS_URL=redis://localhost:6379
PORT=5080
COMMAND_OUTPUT_BUCKET=firstdraft-command-output
COMMAND_OUTPUT_PREFIX=dev/
S3_ENDPOINT_URL=http://localhost:9000
S3_FORCE_PATH_STYLE=true
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_REGION=us-east-1
EOF

npm run dev
```

The API listens on `http://localhost:5080`.

### 3. Run the web console

```bash
cd app
npm install
npm run dev
```

Open the Vite URL printed by the command, then create the first user from the console.

### 4. Create worker API credentials

In the console, create an API key for your user. Keep the generated key and secret available for worker setup.

### 5. Configure and run a worker

```bash
cd client
dotnet run -- init
dotnet run -- run
```

During `init`, provide the API key and secret, set the external API to `http://localhost:5080`, choose `Codex` or `Claude`, and select the paths and skills this worker should advertise.

For real use, run this worker on the remote machine that has the repository, network access, credentials, and toolchain needed for the jobs you want it to perform. Repeat the setup on additional machines to build a worker fleet.

### 6. Enable Jira intake

Open the Integrations page, add a Jira connection, choose the board and workflow statuses, then enable intake. Once enabled, Jira issues in the selected ready status can be picked up and queued as worker tasks.

## Common Commands

API:

```bash
cd api
npm run dev
npm test
npm run build
```

Web console:

```bash
cd app
npm run dev
npm run build
```

Worker:

```bash
cd client
dotnet run -- init
dotnet run -- skills
dotnet run -- capacity
dotnet run -- run
```

## API Example

Queue an AI command for a connected worker:

```bash
curl -X POST http://localhost:5080/api/workers/<workerId>/commands \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"command":"summarize the repository and suggest the next test to add","commandMode":"ai"}'
```

Supported command modes:

- `ai`: run a prompt through the configured local Codex or Claude CLI.
- `shell`: run a shell command through the worker.
- `gitflow`: run repository-oriented agent workflows. Workers must advertise the `git` skill.

## Configuration

Important API environment variables:

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Postgres connection string |
| `JWT_SECRET` | Yes | Secret used to sign user JWTs |
| `REDIS_URL` | No | Redis connection string, defaults to `redis://localhost:6379` |
| `PORT` | No | API port, defaults to `5080` |
| `COMMAND_OUTPUT_BUCKET` | No | S3-compatible bucket for command output |
| `COMMAND_OUTPUT_PREFIX` | No | Prefix for stored NDJSON command output |

Worker configuration is stored locally by the .NET client and can be edited through:

```bash
firstdraft init
firstdraft skills
firstdraft capacity
```

## Contributing

Issues and pull requests are welcome. The most useful contributions are focused and reproducible: bug reports with command output, small feature slices, tests around worker dispatch and persistence, and documentation that helps people run the stack safely.
