# FirstDraft Console

React and Vite console for operating a FirstDraft worker fleet. It lets users sign in, create the first user, inspect workers, queue commands, review command history and output, manage repositories, configure Jira intake, and create API keys for workers.

## Main Workflows

- Sign in or create the first user.
- List workers and inspect worker detail, state, paths, skills, and capacity.
- Queue `ai`, `shell`, or `gitflow` commands for a worker.
- Review command history, command metadata, streamed output, parsed responses, and cancellation state.
- Cancel queued or running commands when the API and worker can honor the request.
- Manage repository records used by gitflow and Jira intake.
- Configure Jira connections, boards, workflow statuses, and intake.
- Create and revoke user API keys for worker authentication.

## Routes

- `/login`
- `/create-user`
- `/workers`
- `/workers/:workerId`
- `/repositories`
- `/integrations`
- `/settings/api-keys`

The root route redirects authenticated users to `/workers`. Unknown routes also redirect to `/workers`.

## API Usage

The console talks to the FirstDraft API. By default it expects the API at `http://localhost:5080`.

Set `VITE_API_BASE_URL` when the API is hosted somewhere else:

```bash
VITE_API_BASE_URL=http://localhost:5080
```

Important API areas used by the console include:

- `/api/auth/*` for signup, login, and current-user lookup.
- `/api/workers/*` for workers, commands, output, responses, cancellation, and gitflow suggestions.
- `/api/repositories/*` for repository records.
- `/api/integrations/jira/*` for Jira connection and intake setup.
- `/api/me/api-keys/*` for worker API credentials.

## Development

```bash
npm install
npm run dev
```

Build and lint:

```bash
npm run build
npm run lint
```
