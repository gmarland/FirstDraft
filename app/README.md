# FirstDraft Console

React and Vite console for operating a FirstDraft worker fleet. It lets users sign in, create the first user, inspect workers, queue commands, review command history and output, configure Jira intake, update their profile, and create API keys for workers.

## Main Workflows

- Sign in, create the first user, and update the current user's profile.
- List workers and inspect worker detail, runtime state, registered paths, advertised skills, accepted task types, and task capacity.
- Enable or disable individual workers, or disable all enabled workers at once.
- Review the active task queue across workers.
- Queue `ai`, `shell`, or `gitflow` commands for a worker.
- Use gitflow repository suggestions when creating repository-backed tasks.
- Review command history, command metadata, streamed output, parsed responses, and cancellation state.
- Cancel queued or running commands when the API and worker can honor the request.
- Configure Jira connections, boards, workflow statuses, ready issue sampling, and intake.
- Create and revoke user API keys for worker authentication.

## Routes

- `/login`
- `/create-user`
- `/workers`
- `/workers/:workerId`
- `/integrations`
- `/settings/api-keys`
- `/profile`

The root route redirects authenticated users to `/workers`. Unknown routes also redirect to `/workers`.

## API Usage

The console talks to the FirstDraft API. By default it expects the API at `http://localhost:5080`.

Copy the example environment file when you need to point the console at another API:

```bash
cp .env.example .env.local
```

Set `VITE_API_BASE_URL` when the API is hosted somewhere else:

```bash
VITE_API_BASE_URL=http://localhost:5080
```

Important API areas used by the console include:

- `/api/auth/*` for signup, login, current-user lookup, and profile updates.
- `/api/workers/*` for workers, worker enablement, task queues, commands, output, responses, cancellation, and gitflow suggestions.
- `/api/integrations/jira/*` for Jira connection, workflow, ready status, and intake setup.
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
