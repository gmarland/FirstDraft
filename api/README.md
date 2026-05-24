# FirstDraft API

Express and TypeScript API for the FirstDraft control plane. It handles user authentication, worker authentication, worker registration, command dispatch, command history, command output storage, repositories, Jira integrations, and OpenAPI documentation.

## Runtime Dependencies

- Postgres for users, API keys, repositories, integrations, workers, and command records.
- Redis for live worker runtime state.
- MinIO, another S3-compatible service, or Google Cloud Storage for durable command output.

The local `docker-compose.yml` starts Postgres, Redis, MinIO, and creates a `firstdraft-command-output` bucket.

## API Surface

Authentication:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`

Worker authentication:

- `POST /api/worker-auth/token`
- `POST /api/worker-auth/refresh`
- `GET /api/worker-auth/public-key`
- `GET /api/worker-auth/jira-attachments/:integrationId/:issueId/:attachmentId`

User API keys:

- `GET /api/me/api-keys`
- `POST /api/me/api-keys`
- `DELETE /api/me/api-keys/:keyId`

Workers and commands:

- `GET /api/workers`
- `GET /api/workers/:workerId/state`
- `GET /api/workers/:workerId/commands`
- `POST /api/workers/:workerId/commands`
- `GET /api/workers/:workerId/gitflow-suggestions`
- `GET /api/workers/:workerId/commands/:transactionId`
- `POST /api/workers/:workerId/commands/:transactionId/cancel`
- `GET /api/workers/:workerId/commands/:transactionId/output`
- `GET /api/workers/:workerId/commands/:transactionId/responses`

Repositories:

- `GET /api/repositories`
- `POST /api/repositories`
- `PUT /api/repositories/:normalizedRepositoryUrl`
- `DELETE /api/repositories/:normalizedRepositoryUrl`

Jira integrations:

- `GET /api/integrations`
- `GET /api/integrations/jira`
- `PUT /api/integrations/jira/connection`
- `PUT /api/integrations/jira/:integrationId/connection`
- `POST /api/integrations/jira/test-connection`
- `POST /api/integrations/jira/:integrationId/test-connection`
- `POST /api/integrations/jira/intake`
- `POST /api/integrations/jira/:integrationId/intake`
- `GET /api/integrations/jira/:integrationId/boards`
- `PUT /api/integrations/jira/:integrationId/board`
- `GET /api/integrations/jira/:integrationId/boards/:boardId/statuses`
- `PUT /api/integrations/jira/:integrationId/workflow`
- `PUT /api/integrations/jira/:integrationId/enabled`
- `GET /api/integrations/jira/:integrationId/ready-issues/sample`
- `GET /api/integrations/jira/:integrationId/issues/:issueKey/transitions`
- `PUT /api/integrations/jira/:integrationId/processed-status`
- `PUT /api/integrations/jira/:integrationId/processed-transition`
- `PUT /api/integrations/jira/:integrationId/settings`
- `POST /api/integrations/jira/:integrationId/test`
- `DELETE /api/integrations/jira/:integrationId`

OpenAPI:

- `GET /api/docs`
- `GET /swagger.json`

## Commands

The API queues work for connected workers. Supported command modes are:

- `ai`: run a prompt through the worker's configured Codex or Claude CLI provider.
- `shell`: run a shell command on the worker.
- `gitflow`: run repository-oriented implementation or follow-up work. The target worker must advertise the `git` skill.

Command output is stored as NDJSON at `workers/<workerId>/commands/<transactionId>/output.ndjson`, optionally prefixed by `COMMAND_OUTPUT_PREFIX`.

## Environment

Required:

```bash
DATABASE_URL=postgres://firstdraft:firstdraft@localhost:5432/firstdraft
JWT_SECRET=replace-with-a-secret
```

Common local settings:

```bash
PORT=5080
COMMAND_OUTPUT_BUCKET=firstdraft-command-output
COMMAND_OUTPUT_STORAGE_PROVIDER=s3
COMMAND_OUTPUT_PREFIX=dev/
S3_ENDPOINT_URL=http://localhost:9000
S3_FORCE_PATH_STYLE=true
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_REGION=us-east-1
```

| Variable | Required | Description |
| --- | --- | --- |
| `COMMAND_OUTPUT_BUCKET` | No | Bucket for command output |
| `COMMAND_OUTPUT_STORAGE_PROVIDER` | No | Command output storage provider: `s3`/`aws` or `gcs`/`google`; defaults to `s3` |
| `COMMAND_OUTPUT_PREFIX` | No | Prefix for stored NDJSON command output |

For Google Cloud Storage, set `COMMAND_OUTPUT_STORAGE_PROVIDER=gcs` and `COMMAND_OUTPUT_BUCKET` to the GCS bucket name. Authentication uses Google Application Default Credentials, including `GOOGLE_APPLICATION_CREDENTIALS`; optionally set `GCP_PROJECT_ID` or `GOOGLE_CLOUD_PROJECT`.

## Development

```bash
npm install
npm run dev
```

The API listens on `http://localhost:5080` by default.

Run tests and build:

```bash
npm test
npm run build
```

## Queue A Command

```bash
curl -X POST http://localhost:5080/api/workers/<workerId>/commands \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"command":"summarize this repository","commandMode":"ai"}'
```
