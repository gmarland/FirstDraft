# FirstDraft

FirstDraft is a control plane for running AI-assisted engineering work on remote machines you control.

Put workers next to the repositories, credentials, build tools, and internal networks they need, then turn those sandboxed workers on from a browser or from Jira. FirstDraft is built for teams who want more than a single local coding agent: a fleet of addressable workers can sit on remote machines, advertise what they can do, and pick up operational work as soon as the UI or an enabled Jira workflow sends it their way.

## Interactive Demo

[FirstDraft Overview](https://demo.arcade.software/xvCA6UuGer9a8t01MOWQ)

Click the image above to launch the full interactive walkthrough.

## Why FirstDraft

AI coding tools are most useful when they can work where the real context lives: cloned repositories, local toolchains, internal services, private networks, and team-specific workflows. FirstDraft turns those machines into an on-demand worker fleet.

- Run multiple workers on remote machines and enable the right one for each job.
- Use the web UI to inspect workers, choose a target, and dispatch work manually.
- Let workers poll their own Jira integrations and claim ready issues without a developer babysitting the queue.
- Queue AI, shell, or gitflow commands against registered workers.
- Watch command status, streamed output, parsed responses, and history from a web console.
- Register worker capabilities and paths so tasks are sent only where they can run.
- Run Codex or Claude through local CLI providers instead of building a new agent runtime.
- Keep worker execution close to source code, credentials, and build environments you already manage.
- Integrate repository workflows and worker-owned Jira polling so operational requests can become worker tasks.

## What You Get

This repository contains the full FirstDraft stack:

| Path | Purpose |
| --- | --- |
| `api/` | Express API, authentication, worker coordination, SignalR-compatible hub, OpenAPI docs, persistence, and integrations |
| `app/` | React/Vite console for users, workers, repositories, API keys, and command history |
| `client/` | .NET worker that connects to the API, advertises skills, and executes shell, AI, and gitflow commands |
| `docker-compose.yml` | Local Postgres and MinIO services for development |

## Architecture

```text
Browser console / Jira / API clients
            |
            v
      FirstDraft API
      Express + Postgres
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

Workers authenticate with a FirstDraft user account, maintain their own worker JWT, keep a live hub connection, and execute commands on the machines where they are installed. The API records command metadata and worker runtime state in Postgres, and writes command output as NDJSON so runs can be audited after the fact.

## Remote Worker Fleet

The main idea is simple: leave capable workers running on the machines that already have the right access.

- A worker on a build server can run tests against heavyweight dependencies.
- A worker inside a private network can reach internal services without exposing them.
- A worker with a checked-out repository can run gitflow tasks and produce pull request-ready output.
- Multiple workers can advertise different paths, skills, and capacity, then be selected from the UI or targeted by automation.

That makes FirstDraft useful as a shared execution layer, not just a chat interface for one laptop.

## Jira-Driven Automation

FirstDraft can connect Jira tickets to the worker fleet. Configure Jira connections on the worker CLI, choose the board and statuses that represent ready, processing, and processed work, then start the worker so it advertises those integrations to the API.

Each worker polls its own enabled Jira integrations, filters issues to repositories configured on that worker, and asks the API to claim a ticket before starting work. The API records which worker claimed the ticket so another worker cannot process the same issue, while status transitions and command output keep the workflow visible.

## Features

- **Remote worker registry**: see connected workers, status, advertised skills, task capacity, and registered paths.
- **UI-driven dispatch**: choose a worker and queue `ai`, `shell`, or `gitflow` commands from the console.
- **Jira polling**: enable Jira workflows that let workers claim ready tickets for repository-backed gitflow tasks.
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

This starts Postgres and MinIO. MinIO creates a local `firstdraft-command-output` bucket for command output storage.

### 2. Run the API

```bash
cd api
npm install
cp .env.example .env
npm run dev
```

The API listens on `http://localhost:5080`. The checked-in `api/.env.example` matches the local `docker-compose.yml` Postgres and MinIO services, including the `firstdraft-command-output` bucket and `AWS_REGION=eu-west-2` for local S3-compatible storage.

### 3. Run the web console

```bash
cd app
npm install
cp .env.example .env.local
npm run dev
```

Open the Vite URL printed by the command, then create the first user from the console. The checked-in `app/.env.example` points the console at `http://localhost:5080`.

### 4. Configure and run a worker

```bash
cd client
dotnet run -- init
dotnet run -- run
```

During `init`, set the external API to `http://localhost:5080`, log in or sign up with your FirstDraft user, choose `Codex` or `Claude`, and select the paths and skills this worker should advertise.

For real use, run this worker on the remote machine that has the repository, network access, credentials, and toolchain needed for the jobs you want it to perform. Repeat the setup on additional machines to build a worker fleet.

### 5. Enable Jira polling

On each worker that should handle Jira work, create a Jira connection with `dotnet run -- integrations add jira`, then configure its board and statuses interactively with `dotnet run -- integrations configure <generated-id>`. The `add jira` command prompts for the Jira site URL, email, and API token, then prints the generated 5-character ID. Once enabled, the worker polls Jira every 60 seconds and claims matching ready issues through the API before running gitflow locally.

## Common Commands

API:

```bash
cd api
npm install
npm run dev
npm test
npm run build
npm start
```

Web console:

```bash
cd app
npm install
npm run dev
npm run build
npm run preview
```

Worker:

```bash
cd client
dotnet build
dotnet run -- init
dotnet run -- skills
dotnet run -- capacity
dotnet run -- taskTypes
dotnet run -- enablePlanning
dotnet run -- repos list
dotnet run -- integrations list
dotnet run -- run
```

Local infrastructure:

```bash
docker compose up -d
docker compose down
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
| `PORT` | No | API port, defaults to `5080` |
| `COMMAND_OUTPUT_BUCKET` | No | Bucket or Azure Blob container for command output |
| `COMMAND_OUTPUT_STORAGE_PROVIDER` | No | Command output storage provider: `s3`/`aws`, `gcs`/`google`, or `azure`/`az`; defaults to `s3` |
| `COMMAND_OUTPUT_PREFIX` | No | Prefix for stored NDJSON command output |
| `S3_ENDPOINT_URL` | No | S3-compatible endpoint for local MinIO or another compatible service |
| `S3_FORCE_PATH_STYLE` | No | Set to `true` for local MinIO path-style bucket access |
| `AWS_ACCESS_KEY_ID` | No | S3-compatible access key for command output storage |
| `AWS_SECRET_ACCESS_KEY` | No | S3-compatible secret key for command output storage |
| `AWS_REGION` | No | S3-compatible region; local development uses `eu-west-2` |

For Google Cloud Storage, set `COMMAND_OUTPUT_STORAGE_PROVIDER=gcs` and `COMMAND_OUTPUT_BUCKET` to the GCS bucket name. Authentication uses Google Application Default Credentials, including `GOOGLE_APPLICATION_CREDENTIALS`; optionally set `GCP_PROJECT_ID` or `GOOGLE_CLOUD_PROJECT`.

For Azure Blob Storage, set `COMMAND_OUTPUT_STORAGE_PROVIDER=azure` and `COMMAND_OUTPUT_BUCKET` to the Blob container name. Authentication uses `AZURE_STORAGE_CONNECTION_STRING`, or `AZURE_STORAGE_ACCOUNT_NAME` with `AZURE_STORAGE_ACCOUNT_KEY`.

Worker configuration is stored locally by the .NET client and can be edited through:

```bash
firstdraft init
firstdraft skills
firstdraft capacity
firstdraft taskTypes
firstdraft enablePlanning
```

## Contributing

Issues and pull requests are welcome. The most useful contributions are focused and reproducible: bug reports with command output, small feature slices, tests around worker dispatch and persistence, and documentation that helps people run the stack safely.
