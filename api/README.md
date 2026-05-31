# FirstDraft API

Express and TypeScript API for the FirstDraft control plane. It handles user authentication, worker authentication, worker registration, command dispatch, command history, command output storage, worker-local Git repository advertisements, Jira integrations, and OpenAPI documentation.

## Runtime Dependencies

- Postgres for users, worker authentication, worker-local Git repository advertisements, integrations, workers, and command records.
- MinIO, another S3-compatible service, Google Cloud Storage, or Azure Blob Storage for durable command output.

The local `docker-compose.yml` starts Postgres and MinIO, then creates a `firstdraft-command-output` bucket.

## API Surface

System and docs:

- `GET /health`
- `POST /WorkerHub/negotiate`
- `GET /api/docs`
- `GET /swagger.json`

Authentication:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `PATCH /api/auth/me`
- `DELETE /api/auth/me`

Worker authentication:

- `POST /api/worker-auth/token` with a user bearer token
- `POST /api/worker-auth/refresh`
- `GET /api/worker-auth/public-key`
- `GET /api/worker-auth/jira-attachments/:eventId/:attachmentId`

Workers and commands:

- `GET /api/workers`
- `POST /api/workers/disable-all`
- `GET /api/workers/task-queue`
- `PATCH /api/workers/:workerId`
- `GET /api/workers/:workerId/state`
- `GET /api/workers/:workerId/commands`
- `POST /api/workers/:workerId/commands`
- `GET /api/workers/:workerId/gitflow-suggestions`
- `GET /api/workers/:workerId/commands/:transactionId`
- `POST /api/workers/:workerId/commands/:transactionId/cancel`
- `GET /api/workers/:workerId/commands/:transactionId/output`
- `GET /api/workers/:workerId/commands/:transactionId/responses`

Jira integrations are worker-local. Configure them with the client CLI; workers advertise their Jira integration list during registration, and the API stores that synced copy for ticket claiming, attachment download, and lifecycle transitions. Workers poll Jira themselves and use `POST /api/worker-auth/integration-tickets/jira/claim` to atomically record which worker claimed a ready issue. There is no public `/api/integrations` management surface.

## Commands

The API queues work for connected workers. Supported command modes are:

- `ai`: run a prompt through the worker's configured Codex or Claude CLI provider.
- `shell`: run a shell command on the worker.
- `gitflow`: run repository-oriented implementation or follow-up work. The target worker must advertise the `git` skill.

Command output is stored as NDJSON at `workers/<workerId>/commands/<transactionId>/output.ndjson`, optionally prefixed by `COMMAND_OUTPUT_PREFIX`.

## Environment

Start from the checked-in template:

```bash
cp .env.example .env
```

Required for local development:

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
AWS_REGION=eu-west-2
```

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Postgres connection string |
| `JWT_SECRET` | Yes | Secret used to sign user JWTs |
| `JWT_EXPIRES_IN` | No | User JWT lifetime, defaults to `1h` |
| `JWT_ISSUER` | No | User JWT issuer |
| `JWT_AUDIENCE` | No | User JWT audience |
| `WORKER_JWT_SECRET` | No | Worker JWT secret; falls back to `JWT_SECRET` outside production |
| `WORKER_JWT_ISSUER` | No | Worker JWT issuer, defaults to `firstdraft-api` |
| `WORKER_JWT_AUDIENCE` | No | Worker JWT audience, defaults to `firstdraft-worker-api` |
| `TENANT_ADMIN_KEY` | No | Admin key used by tenant administration flows |
| `API_TO_WORKER_PRIVATE_KEY` | No | Optional PEM private key for API-to-worker command tokens, with escaped newlines |
| `API_TO_WORKER_PUBLIC_KEY` | No | Optional PEM public key paired with `API_TO_WORKER_PRIVATE_KEY` |
| `COMMAND_OUTPUT_BUCKET` | No | Bucket or Azure Blob container for command output |
| `COMMAND_OUTPUT_STORAGE_PROVIDER` | No | Command output storage provider: `s3`/`aws`, `gcs`/`google`, or `azure`/`az`; defaults to `s3` |
| `COMMAND_OUTPUT_PREFIX` | No | Prefix for stored NDJSON command output |

For local MinIO, use the S3 settings shown above. For Google Cloud Storage, set `COMMAND_OUTPUT_STORAGE_PROVIDER=gcs` and `COMMAND_OUTPUT_BUCKET` to the GCS bucket name. Authentication uses Google Application Default Credentials, including `GOOGLE_APPLICATION_CREDENTIALS`; optionally set `GCP_PROJECT_ID` or `GOOGLE_CLOUD_PROJECT`.

For Azure Blob Storage, set `COMMAND_OUTPUT_STORAGE_PROVIDER=azure` and `COMMAND_OUTPUT_BUCKET` to the Blob container name. Authentication uses `AZURE_STORAGE_CONNECTION_STRING`, or `AZURE_STORAGE_ACCOUNT_NAME` with `AZURE_STORAGE_ACCOUNT_KEY`.

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

Run the compiled API after building:

```bash
npm start
```

## Queue A Command

```bash
curl -X POST http://localhost:5080/api/workers/<workerId>/commands \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"command":"summarize this repository","commandMode":"ai"}'
```
