# FirstDraft Console

React and Vite console for operating a FirstDraft worker fleet. It is an operations and visibility UI: users can sign in, create the first user, inspect workers, review the global task queue, open worker command history and output, view advertised worker resources, update profile details, and delete their account.

Task intake is currently worker-owned. Repositories and Jira integrations are configured on each worker with the worker CLI, and workers claim Jira-backed `gitflow` tasks through the API.

## Main Workflows

- Sign in, create the first user, update the current user's profile, or delete the current account.
- List workers and inspect worker detail, runtime state, registered paths, advertised skills, accepted task types, and task capacity.
- View worker resource tabs for advertised Git repositories and Jira integrations.
- Review command history, command metadata, streamed output, parsed responses, and terminal status.
- Review the global task queue across workers.
- Filter task queue rows by `queued`, `in_progress`, `completed`, and `failed`.
- Sort task queue rows by status, source, task, worker, repository, or created time.

## Routes

- `/login`
- `/create-user`
- `/workers`
- `/workers/:workerId`
- `/task-queue`
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
- `/api/workers` for the worker list.
- `/api/workers/task-queue` for global task queue filtering, sorting, and pagination.
- `/api/workers/:workerId/state` for worker detail, registered repositories, and registered Jira integrations.
- `/api/workers/:workerId/commands/*` for command history, command detail, output, and parsed responses.

Jira integrations and Git repositories are configured on each worker with the worker CLI, not in the web console.

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
