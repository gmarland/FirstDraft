# FirstDraft Worker

.NET worker that connects to the FirstDraft API, registers its identity and capabilities, and executes remote commands on the machine where it is running. Workers should be installed next to the repositories, credentials, toolchains, and network access needed for the jobs they accept.

The project targets `net10.0` and builds the `firstdraft` assembly. At runtime the worker uses a SignalR client connection to the API's `/WorkerHub` endpoint.

## Prerequisites

- .NET SDK 10.
- A FirstDraft user account.
- Network access to the FirstDraft API.
- Codex CLI or Claude CLI when using `ai` commands.
- `git` on `PATH` when advertising the `git` skill or running `gitflow` commands.
- `npm` on `PATH` when advertising the `npm` skill.

## Commands

Run commands from the `client/` directory:

```bash
dotnet run -- init
dotnet run -- skills
dotnet run -- capacity
dotnet run -- taskTypes
dotnet run -- task-types
dotnet run -- enablePlanning
dotnet run -- run
dotnet run -- run --task-types ai,shell,gitflow
dotnet run -- help
```

Command details:

- `init`: create or update the local worker configuration interactively.
- `skills`: update advertised worker skills.
- `capacity`: update the maximum number of concurrent gitflow tasks.
- `taskTypes` or `task-types`: update which task types this worker accepts.
- `enablePlanning`: configure whether AI commands use a planning pass.
- `repos list|add|update|remove`: manage Git repositories and enforced source/PR target branches for this worker.
- `run`: start the worker and connect it to the API.
- `run --task-types ai,shell,gitflow`: override enabled task types for this run only without changing saved configuration.
- `help`: print command help.

Running with no command defaults to `run`.

## Supported Command Modes

- `ai`: executes a prompt through the configured Codex or Claude CLI provider.
- `shell`: executes a shell command on the worker machine.
- `gitflow`: executes repository-oriented implementation or follow-up work.

`gitflow` requires the worker to advertise the `git` skill. Configured skills are validated against executables on `PATH` before registration.
Workers accept all command modes by default. Configure `EnabledTaskTypes` to restrict a worker to specific modes.

## Gitflow Workspaces

Gitflow tasks use `GitWorkspaceDirectory` as the workspace root when configured, otherwise they fall back to the worker's application workspace. The worker clones missing repositories into that workspace and reuses existing repository workspaces for later tasks.

Each worker advertises its own Git repositories from local configuration. Manage them with:

```bash
dotnet run -- repos add https://github.com/example/repo.git --source main --target main
dotnet run -- repos list
dotnet run -- repos update https://github.com/example/repo.git --source develop --target main
dotnet run -- repos remove https://github.com/example/repo.git
```

The configured source and PR target branches are enforced by the API for manual and queued gitflow tasks.

Jira image attachments are downloaded through the API with the worker access token before the AI prompt is built. Attachment download therefore depends on valid worker authentication and a reachable `ExternalAPI` URL.

`MaxConcurrentTasks` controls concurrent gitflow execution and must be between `1` and `8`.

## Configuration

The worker stores local configuration through `ApplicationData`. Important fields include:

- `WorkerId`: stable worker identifier generated during configuration.
- `Name` and `Tags`: optional labels shown to API and console users.
- `AuthUserId`, `AuthEmail`, and `AuthName`: metadata for the user account that owns the worker.
- `EncryptedWorkerRefreshToken` and `ConfigEncryptionKey`: encrypted worker refresh-token storage.
- `ExternalAPI`: base URL for the FirstDraft API.
- `ApplicationFolder`: local folder used by the worker application.
- `LogsFolder`: local log output folder.
- `ApplicationPaths`: paths advertised to the API for worker selection.
- `Skills`: configured skills such as `git` and `npm`.
- `EnabledTaskTypes`: accepted task types. Missing or empty values default to `ai`, `shell`, and `gitflow`.
- `AIProvider`: `Codex` or `Claude`.
- `PlanningEnabled`: whether AI execution performs a planning pass before implementation.
- `AIWorkingDirectory`: base working directory for AI commands.
- `GitWorkspaceDirectory`: workspace root for gitflow repository work.
- `MaxConcurrentTasks`: maximum concurrent gitflow tasks, from `1` to `8`.
- `GitRepositories`: worker-local Git repositories with enforced source and PR target branches.

Credentials can be encrypted in the config. Keep the worker configuration private and run workers only on machines trusted to access the configured repositories, credentials, tools, and networks.

## Local Setup

Create or update configuration:

```bash
dotnet run -- init
```

During setup, set the external API URL, log in or sign up with your FirstDraft user, choose the AI provider, and select the task types, paths, and skills this worker should advertise.

Start the worker:

```bash
dotnet run -- run
```

For real deployments, run one or more workers on the machines that already have the target repositories, build tools, private network access, and CLI credentials required for the work they should perform.
