# FirstDraft Console

React console for inspecting registered workers, queueing commands, and reviewing command history/output.

## Main Workflows

- sign in or create the first user
- list registered workers
- inspect worker state, paths, and skills
- queue AI, shell, or gitflow commands for a worker
- inspect command status, metadata, parsed responses, and stored NDJSON output
- manage user API keys

## API Contract

Workers:

- `GET /api/workers`
- `GET /api/workers/:workerId/state`

Commands:

- `GET /api/workers/:workerId/commands`
- `POST /api/workers/:workerId/commands`
- `GET /api/workers/:workerId/commands/:transactionId`
- `GET /api/workers/:workerId/commands/:transactionId/output`
- `GET /api/workers/:workerId/commands/:transactionId/responses`

API keys:

- `GET /api/me/api-keys`
- `POST /api/me/api-keys`
- `DELETE /api/me/api-keys/:keyId`

## Routes

- `/login`
- `/create-user`
- `/workers`
- `/workers/:workerId`
- `/settings/api-keys`

## Development

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

Set `VITE_API_BASE_URL` when the API is not running at `http://localhost:5080`.
