# FirstDraft

FirstDraft is a reporting plane for AI-assisted engineering work on remote machines you control.

Run workers next to the repositories, credentials, build tools, and internal networks they need. The workers register with the API, advertise their Git repositories and Jira integrations, claim eligible Jira issues, run `gitflow` work locally, and report task history and output back to the web console.

## Interactive Demo

[FirstDraft Overview](https://demo.arcade.software/xvCA6UuGer9a8t01MOWQ)

Click the image above to launch the full interactive walkthrough.

## Why FirstDraft

AI coding tools are most useful when they can work where the real context lives: cloned repositories, local toolchains, internal services, private networks, and team-specific workflows. FirstDraft turns those machines into a worker fleet with a shared browser-visible audit trail.

- Run multiple workers on remote machines and see which ones are alive.
- Let workers advertise local paths, skills, repositories, Jira integrations, and task capacity.
- Let workers poll their own Jira integrations and claim ready repository-backed issues.
- Keep execution close to source code, CLI credentials, build tools, and internal networks.
- Run repository-oriented `gitflow` tasks through a local Codex or Claude CLI provider.
- Record task metadata, output, parsed responses, status, and history in one console.
- Store durable command output in S3-compatible storage, Google Cloud Storage, or Azure Blob Storage.

## What You Get

This repository contains the full FirstDraft stack:

| Path | Purpose |
| --- | --- |
| `api/` | Express API, authentication, worker reporting endpoints, OpenAPI docs, persistence, Jira claim tracking, and command output storage |
| `app/` | React/Vite console for users, workers, task queue visibility, command history, worker resources, and profile management |
| `client/` | .NET worker that connects to the API, advertises resources, polls Jira, and executes `gitflow` work locally |
| `docker-compose.yml` | Local Postgres and MinIO services for development |

## Architecture

```text
Browser console / Jira
          |
          v
    FirstDraft API
  Express + Postgres
          ^
          |
 worker reports, heartbeats,
 claims, output, completion
          |
          v
 firstdraft .NET workers
 Jira polling | gitflow
 Codex or Claude CLI
          |
          v
local repositories and toolchains
```

Workers authenticate with a FirstDraft user account, maintain their own worker JWT, register over HTTP, send heartbeats, and report task start/output/completion from the machines where they are installed. The API records worker runtime state and command metadata in Postgres, stores synced worker repository and Jira settings for visibility and claim checks, and writes command output as NDJSON for later review.

## Remote Worker Fleet

The main idea is simple: leave capable workers running on the machines that already have the right access.

- A worker on a build server can run tests against heavyweight dependencies.
- A worker inside a private network can reach internal services without exposing them.
- A worker with a checked-out or cloneable repository can run `gitflow` work and produce pull request-oriented output.
- Multiple workers can advertise different repositories, skills, Jira integrations, and capacity.

That makes FirstDraft useful as a shared execution layer for repository work, not just a chat interface for one laptop.

## Jira-Driven Automation

FirstDraft can connect Jira tickets to the worker fleet. Configure Jira connections on the worker CLI, choose the board and statuses that represent ready, processing, and processed work, then start the worker so it advertises those integrations to the API.

Each worker polls its enabled Jira integrations every 60 seconds, filters issues to repositories configured on that worker, downloads Jira image attachments directly with its local Jira credentials, and attempts to claim matching issues through the API before execution. The API rejects duplicate active claims for the same issue and records intake status, while the worker reports command output and final results through the normal task history.

## Console Workflows

The web console is the operational view for the fleet:

- Sign in, create the first user, update profile details, or delete the current account.
- View registered workers, runtime state, advertised paths, skills, task capacity, repositories, and Jira integrations.
- Inspect worker command history, output streams, parsed responses, and status.
- Review the global task queue with status filters and sortable source, task, worker, repository, and created columns.

Repositories and Jira integrations are configured on each worker with the worker CLI. Current task execution is worker-owned and `gitflow`-only.

## Features

- **Remote worker registry**: see connected workers, status, advertised skills, task capacity, registered paths, repositories, and Jira integrations.
- **Task queue visibility**: inspect queued, in-progress, completed, and failed work across the current user's workers.
- **Jira polling**: let workers claim ready Jira tickets for repository-backed `gitflow` tasks.
- **Claim guarding**: prevent duplicate active work for the same Jira issue.
- **Durable output**: retain NDJSON command output and expose streamed output and parsed responses.
- **Gitflow workflows**: clone or reuse repository workspaces, run agent tasks, and format pull request-oriented results.
- **Scoped worker config**: configure application paths, logs, AI working directory, Git workspace, skills, repositories, Jira integrations, planning, and concurrent `gitflow` capacity.
- **User auth**: create users, sign in, update profile details, and delete account data.
- **OpenAPI docs**: inspect the API at `/api/docs` and fetch the raw spec at `/swagger.json`.

## Quick Start

### Prerequisites

- Node.js 26.3.0+
- npm
- Docker and Docker Compose
- .NET SDK 10
- Codex CLI or Claude CLI for `gitflow` execution
- `git` on `PATH` for workers that execute `gitflow`

The root, API, and web console directories include `.nvmrc` files pinned to Node.js 26.3.0.

### 1. Start the local Docker stack

```bash
docker compose up -d
```

This pulls and starts the published FirstDraft API and web console images, plus Postgres and MinIO. MinIO creates a local `firstdraft-command-output` bucket for command output storage.

The API listens on `http://localhost:5080`, and the web console is available at `http://localhost:8080`.

The checked-in compose file uses development auth/admin secrets. Override `JWT_SECRET`, `WORKER_JWT_SECRET`, `TENANT_ADMIN_KEY`, or `VITE_API_BASE_URL` from a root `.env` file or shell environment for anything beyond local testing. If local ports are already in use, override `API_HOST_PORT` or `APP_HOST_PORT`.

### 2. Run the API from source

```bash
cd api
npm install
cp .env.example .env
npm run dev
```

Use this instead of the `api` compose service when developing the API locally. The checked-in `api/.env.example` matches the local `docker-compose.yml` Postgres and MinIO services, including the `firstdraft-command-output` bucket and `AWS_REGION=eu-west-2` for local S3-compatible storage.

### 3. Run the web console from source

```bash
cd app
npm install
cp .env.example .env.local
npm run dev
```

Use this instead of the `app` compose service when developing the console locally. Open the Vite URL printed by the command, then create the first user from the console. The checked-in `app/.env.example` points the console at `http://localhost:5080`.

### 4. Configure and run a worker

```bash
cd client
dotnet run -- init
dotnet run -- run
```

During `init`, use the default external API `https://api.firstdraft.run` unless you are running a local API, log in or sign up with your FirstDraft user, choose `Codex` or `Claude`, and select the paths and skills this worker should advertise.

For real use, run this worker on the remote machine that has the repository, network access, credentials, and toolchain needed for the jobs you want it to perform. Repeat the setup on additional machines to build a worker fleet.

### 5. Configure repositories and Jira polling

Configure the repositories a worker is allowed to process:

```bash
cd client
dotnet run -- repos add https://github.com/example/repo.git --source main --target main
```

On each worker that should handle Jira work, create a Jira connection and configure its board, statuses, and optional assignee filter:

```bash
dotnet run -- integrations add jira
dotnet run -- integrations configure <generated-id>
```

Once enabled, the worker polls Jira every 60 seconds and claims matching ready issues through the API before running `gitflow` locally.

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
npm run lint
```

Worker:

```bash
cd client
dotnet build
dotnet run -- init
dotnet run -- skills
dotnet run -- capacity
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

## Task Mode

Workers currently advertise and execute one task mode:

- `gitflow`: repository-oriented implementation or follow-up work. Workers must advertise the `git` skill, have `git` available on `PATH`, and have the target repository configured locally.

The worker source still contains legacy command handler classes for other modes, but runtime registration and API validation currently expose `gitflow` only.

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
firstdraft enablePlanning
firstdraft repos list|add|update|remove
firstdraft integrations list|details|add|configure|remove
```

## Contributing

Issues and pull requests are welcome. The most useful contributions are focused and reproducible: bug reports with command output, small feature slices, tests around worker reporting and persistence, and documentation that helps people run the stack safely.
