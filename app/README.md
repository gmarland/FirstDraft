# FirstDraft Console

React and Vite console for operating a FirstDraft worker fleet. It lets users sign in, create the first user, inspect workers, queue commands, review command history and output, and manage their profile.

## Main Workflows

- Sign in, create the first user, update the current user's profile, and delete the current user's account.
- List workers and inspect worker detail, runtime state, registered paths, advertised skills, accepted task types, and task capacity.
- Enable or disable individual workers, or disable all enabled workers at once.
- Review the active task queue across workers.
- Queue `ai`, `shell`, or `gitflow` commands for a worker.
- Use gitflow repository suggestions when creating repository-backed tasks.
- Review command history, command metadata, streamed output, parsed responses, and cancellation state.
- Cancel queued or running commands when the API and worker can honor the request.

## Routes

- `/login`
- `/create-user`
- `/workers`
- `/workers/:workerId`
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

- `/api/auth/*` for signup, login, current-user lookup, profile updates, and account deletion.
- `/api/workers/*` for workers, worker enablement, task queues, commands, output, responses, cancellation, and gitflow suggestions.

Jira integrations are configured on each worker with the worker CLI, not in the web console.

## Development

```bash
npm install
npm run dev
```

Available package scripts:

```bash
npm run build
npm run preview
npm run lint
```
