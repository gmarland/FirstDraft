# FirstDraft API

Express API for registering workers, queueing commands, tracking command status, and reading stored command output.

## Core Endpoints

Workers:

- `GET /api/workers`
- `GET /api/workers/:workerId/state`

Commands:

- `GET /api/workers/:workerId/commands`
- `POST /api/workers/:workerId/commands`
- `GET /api/workers/:workerId/commands/:transactionId`
- `GET /api/workers/:workerId/commands/:transactionId/output`
- `GET /api/workers/:workerId/commands/:transactionId/responses`

Command modes:

- `ai`
- `shell`
- `gitflow`

Gitflow commands require the worker to advertise the `git` skill.

## Storage

Users, API key pairs, worker records, and command records are stored in Postgres. Worker runtime state is stored in Redis.

Stored command output is written as NDJSON at `workers/<workerId>/commands/<transactionId>/output.ndjson`, optionally prefixed by `COMMAND_OUTPUT_PREFIX`.

## Environment

Required:

```bash
DATABASE_URL=postgres://...
JWT_SECRET=...
```

Common optional settings:

```bash
PORT=5080
REDIS_URL=redis://localhost:6379
COMMAND_OUTPUT_BUCKET=firstdraft-command-output
COMMAND_OUTPUT_PREFIX=dev/
```

## Development

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## Queue A Command

```bash
curl -X POST http://localhost:5080/api/workers/<workerId>/commands \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d "{\"command\":\"say hello\",\"commandMode\":\"ai\"}"
```
