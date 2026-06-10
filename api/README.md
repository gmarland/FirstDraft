# FirstDraft API

Express and TypeScript API for the FirstDraft reporting plane. It handles user authentication, worker authentication, worker registration, worker-reported `gitflow` task history, command output storage, worker-local Git repository advertisements, worker-local Jira integration snapshots, Jira ticket claim guarding, and OpenAPI documentation.

## Runtime Dependencies

- Postgres for users, worker authentication, worker-local Git repository advertisements, Jira integration snapshots, Jira intake events, ticket claims, workers, and command records.
- MinIO, another S3-compatible service, Google Cloud Storage, or Azure Blob Storage for durable command output.

The local `docker-compose.yml` starts Postgres and MinIO, then creates a `firstdraft-command-output` bucket.

## API Surface

System and docs:

- `GET /health`
- `GET /api/docs`
- `GET /swagger.json`

Authentication:

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `PATCH /api/auth/me`
- `DELETE /api/auth/me`

Worker authentication and reporting:

- `POST /api/worker-auth/token` with a user bearer token
- `POST /api/worker-auth/refresh`
- `POST /api/worker-auth/register`
- `POST /api/worker-auth/heartbeat`
- `POST /api/worker-auth/tasks/start`
- `POST /api/worker-auth/tasks/:transactionId/output`
- `POST /api/worker-auth/tasks/:transactionId/complete`
- `POST /api/worker-auth/tasks/:transactionId/reject`

Workers, queue, and command history:

- `GET /api/workers`
- `GET /api/workers/task-queue`
- `GET /api/workers/:workerId/state`
- `GET /api/workers/:workerId/commands`
- `GET /api/workers/:workerId/commands/:transactionId`
- `GET /api/workers/:workerId/commands/:transactionId/output`
- `GET /api/workers/:workerId/commands/:transactionId/responses`

There is no public API surface for direct command creation, worker enablement toggles, forced command stops, personal access credential management, or integration management. Repositories and Jira integrations are configured on the worker CLI and synced to the API during worker registration.

## Command Lifecycle

Workers own task intake. A running worker registers its metadata, sends heartbeats every 30 seconds, polls its enabled Jira integrations, and calls `POST /api/worker-auth/tasks/start` before executing a matching Jira issue. The API verifies that the worker is eligible, confirms the repository and integration match the worker's synced configuration, enforces active-claim duplicate guarding, and records a command in `queued` or `in_progress` flow.

During execution, the worker appends command output through `POST /api/worker-auth/tasks/:transactionId/output`. Output chunks are stored as NDJSON at:

```text
workers/<workerId>/commands/<transactionId>/output.ndjson
```

The object key can be prefixed with `COMMAND_OUTPUT_PREFIX`.

When work finishes, the worker calls `complete` with a result or error message. If work cannot be accepted after claiming, the worker can call `reject`. The console reads command metadata, output, and parsed responses from the `/api/workers/*` endpoints.

## Commands

The current public command mode is:

- `gitflow`: repository-oriented implementation or follow-up work. The target worker must advertise the `git` skill and the relevant Git repository.

API validation and OpenAPI schemas currently expose `gitflow` only.

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
| `COMMAND_OUTPUT_BUCKET` | No | Bucket or Azure Blob container for command output |
| `COMMAND_OUTPUT_STORAGE_PROVIDER` | No | Command output storage provider: `s3`/`aws`, `gcs`/`google`, or `azure`/`az`; defaults to `s3` |
| `COMMAND_OUTPUT_PREFIX` | No | Prefix for stored NDJSON command output |
| `S3_ENDPOINT_URL` | No | S3-compatible endpoint for local MinIO or another compatible service |
| `S3_FORCE_PATH_STYLE` | No | Set to `true` for local MinIO path-style bucket access |
| `AWS_ACCESS_KEY_ID` | No | S3-compatible access key for command output storage |
| `AWS_SECRET_ACCESS_KEY` | No | S3-compatible secret key for command output storage |
| `AWS_REGION` | No | S3-compatible region |

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
