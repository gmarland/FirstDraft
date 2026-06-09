# FirstDraft Worker

.NET worker that registers with the FirstDraft API, reports its runtime state, polls worker-local Jira integrations, claims eligible Jira issues, and executes repository-oriented `gitflow` work on the machine where it is running. Workers should be installed next to the repositories, credentials, toolchains, and network access needed for the jobs they accept.

The project targets `net10.0` and builds the `firstdraft` assembly. At runtime the worker uses worker-auth HTTP endpoints to register, heartbeat, claim tasks, append output, and report completion.

## Prerequisites

- .NET SDK 10.
- A FirstDraft user account.
- Network access to the FirstDraft API.
- Codex CLI or Claude CLI for `gitflow` implementation.
- `git` on `PATH` when advertising the `git` skill or running `gitflow` commands.
- `npm` on `PATH` when advertising the `npm` skill.

## Commands

Run commands from the `client/` directory:

```bash
dotnet run -- init
dotnet run -- skills
dotnet run -- capacity
dotnet run -- enablePlanning
dotnet run -- repos list
dotnet run -- repos add
dotnet run -- repos update <repository-url> --source <branch> --target <branch>
dotnet run -- repos delete <repository-url>
dotnet run -- integrations list
dotnet run -- integrations details <integration-id>
dotnet run -- integrations add jira
dotnet run -- integrations configure <integration-id>
dotnet run -- integrations update <integration-id>
dotnet run -- integrations delete <integration-id>
dotnet run -- run
dotnet run -- help
dotnet run -- --help
dotnet run -- -h
```

Command details:

- `init`: create or update the local worker configuration interactively.
- `skills`: update advertised worker skills.
- `capacity`: update the maximum number of concurrent `gitflow` tasks.
- `enablePlanning`: configure whether `gitflow` AI execution uses a planning pass.
- `repos list|add|update|delete`: manage Git repositories and their enforced source/PR target branches for this worker. `add` prompts for repository details and only creates new entries; `update` only changes existing entries; `delete` removes an existing entry.
- `integrations list|details|add|configure|update|delete`: manage Jira integrations for this worker. `detail` and `show` are aliases for `details`; `update` is an alias for `configure`. `add jira` prompts for the Jira connection, saves a generated 5-character integration ID, then immediately selects the board, workflow statuses, and assignee filter interactively. API tokens are encrypted in local config and are never printed by `list` or `details`.
- `run`: start the worker, register it with the API, start heartbeats, and poll configured Jira integrations.
- `help`: print command help.
- `--help` or `-h`: print command help.

Running with no command defaults to `run`.

## Gitflow Workspaces

Gitflow tasks use `GitWorkspaceDirectory` as the workspace root when configured, otherwise they fall back to the worker's application workspace. The worker clones missing repositories into that workspace and reuses existing repository workspaces for later tasks.

Each worker advertises its own Git repositories from local configuration. Manage them with:

```bash
dotnet run -- repos list
dotnet run -- repos add
dotnet run -- repos update https://github.com/example/repo.git --source develop --target main
dotnet run -- repos delete https://github.com/example/repo.git
```

The configured source and PR target branches are enforced by the API for Jira-claimed `gitflow` tasks and by the worker when building prompts and workspaces.
The `repos add` command prompts for the repository URL, source branch, and PR target branch. Source and target branch prompts default to `main`.
For `repos update`, branch options can be passed as either `--source main` / `--target main` or `--source=main` / `--target=main`.

## Jira Integrations

Each worker advertises its own Jira integrations from local configuration. Manage them with:

```bash
dotnet run -- integrations list
dotnet run -- integrations details <integration-id>
dotnet run -- integrations add jira
dotnet run -- integrations configure <integration-id>
dotnet run -- integrations delete <integration-id>
```

The `add jira` command prompts for the Jira site URL, email, and API token, then immediately configures the board, workflow statuses, and assignee filter. Choose any assignee to pick up all matching tickets, or select one or more Jira users to only pick up tickets assigned to those users. If that configuration step fails, the saved connection can be retried with `configure <integration-id>`. Connection-only Jira integrations remain local-only and are not advertised to the API until fully configured.

Use `details <integration-id>` to inspect board/status configuration and whether an API token is stored. `detail` and `show` are accepted aliases for `details`; `update` is an alias for `configure`.

When the worker is running, it polls enabled Jira integrations every 60 seconds. Ready issues are filtered to repositories configured on that worker, then claimed through the API before execution so only one worker processes a ticket. The worker then runs the matching `gitflow` task locally and reports output through the existing command history.

Jira image attachments are downloaded directly from Jira with the worker's locally configured Jira integration credentials before the AI prompt is built.

## Capacity

`MaxConcurrentTasks` controls concurrent `gitflow` execution. Set it to `1` through `8`, or omit/set it to `null` for unlimited concurrency. The worker advertises this value during registration, and Jira claims are rejected when the worker has no available bounded capacity.

## Configuration

The worker stores local configuration through `ApplicationData`. Important fields include:

- `WorkerId`: stable worker identifier generated during configuration.
- `Name` and `Tags`: optional labels shown to API and console users.
- `AuthUserId`, `AuthEmail`, and `AuthName`: metadata for the user account that owns the worker.
- `EncryptedWorkerRefreshToken` and `ConfigEncryptionKey`: encrypted worker refresh-token storage and local credential encryption.
- `ExternalAPI`: base URL for the FirstDraft API.
- `ApplicationFolder`: local folder used by the worker application.
- `LogsFolder`: local log output folder.
- `ApplicationPaths`: paths advertised to the API for worker selection and visibility.
- `Skills`: configured skills such as `git` and `npm`.
- `EnabledTaskTypes`: legacy setting ignored by current clients; workers always advertise `gitflow`.
- `AIProvider`: `Codex` or `Claude`.
- `PlanningEnabled`: whether AI execution performs a planning pass before implementation.
- `AIWorkingDirectory`: base working directory for AI commands.
- `GitWorkspaceDirectory`: workspace root for `gitflow` repository work.
- `MaxConcurrentTasks`: maximum concurrent `gitflow` tasks, from `1` to `8`; missing or `null` means unlimited.
- `GitRepositories`: worker-local Git repositories with enforced source and PR target branches.
- `JiraIntegrations`: worker-local Jira connections and workflow settings with encrypted API tokens.

The worker also reads an optional `.env` file from the current directory, next to `config.json`. Supported `.env` values are applied over `config.json` when the worker loads configuration. During `firstdraft init`, any supported value present in `.env` is displayed and not prompted for.

```bash
cp .env.example .env
```

Supported `.env` keys:

```env
FIRSTDRAFT_WORKER_ID=my-worker
FIRSTDRAFT_EXTERNAL_API=https://api.firstdraft.run
FIRSTDRAFT_AI_PROVIDER=Codex
FIRSTDRAFT_PLANNING_ENABLED=true
FIRSTDRAFT_AI_WORKING_DIRECTORY=.
FIRSTDRAFT_APPLICATION_FOLDER=App
FIRSTDRAFT_LOGS_FOLDER=Logs
FIRSTDRAFT_APPLICATION_PATHS=*
FIRSTDRAFT_SKILLS=git
FIRSTDRAFT_MAX_CONCURRENT_TASKS=1
FIRSTDRAFT_GIT_WORKSPACE_DIRECTORY=
FIRSTDRAFT_NAME=
FIRSTDRAFT_TAGS=
```

Use `FIRSTDRAFT_MAX_CONCURRENT_TASKS=unlimited`, `null`, or an empty value for unlimited capacity. Use `FIRSTDRAFT_APPLICATION_PATHS=*` or `none`, `FIRSTDRAFT_SKILLS=none`, and `FIRSTDRAFT_TAGS=none` for empty lists.

Credentials can be encrypted in the config. Keep the worker configuration private and run workers only on machines trusted to access the configured repositories, credentials, tools, and networks.

Authentication is not loaded from `.env`. Run `firstdraft init` to log in or re-authenticate the worker, and keep refresh tokens in the existing local config storage.

## Local Setup

Create or update configuration:

```bash
dotnet run -- init
```

During setup, set the external API URL, log in or sign up with your FirstDraft user, choose the AI provider, and select the paths and skills this worker should advertise.

Configure at least one repository before expecting Jira tickets to be claimable:

```bash
dotnet run -- repos add
```

Configure Jira if this worker should claim Jira work:

```bash
dotnet run -- integrations add jira
```

Start the worker:

```bash
dotnet run -- run
```

For real deployments, run one or more workers on the machines that already have the target repositories, build tools, private network access, and CLI credentials required for the work they should perform.
