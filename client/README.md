# FirstDraft Worker

.NET worker that connects to the FirstDraft API, registers its identity and capabilities, and executes remote commands on the machine where it is running. Workers should be installed next to the repositories, credentials, toolchains, and network access needed for the jobs they accept.

## Prerequisites

- .NET SDK 10.
- FirstDraft API credentials from the web console API keys page.
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
dotnet run -- enablePlanning
dotnet run -- run
dotnet run -- run --task-types ai,gitflow
dotnet run -- help
```

Command details:

- `init`: create or update the local worker configuration interactively.
- `skills`: update advertised worker skills.
- `capacity`: update the maximum number of concurrent gitflow tasks.
- `taskTypes`: update which task types this worker accepts.
- `enablePlanning`: configure whether AI commands use a planning pass.
- `run`: start the worker and connect it to the API. Use `--task-types ai,gitflow` to override enabled task types for this run only.
- `help`: print command help.

Running with no command defaults to `run`.

## Supported Command Modes

- `ai`: executes a prompt through the configured Codex or Claude CLI provider.
- `shell`: executes a shell command on the worker machine.
- `gitflow`: executes repository-oriented implementation or follow-up work.

`gitflow` requires the worker to advertise the `git` skill. Configured skills are validated against executables on `PATH` before registration.
Workers accept all command modes by default. Configure `EnabledTaskTypes` to restrict a worker to specific modes.

## Configuration

The worker stores local configuration through `ApplicationData`. Important fields include:

- `WorkerId`: stable worker identifier generated during configuration.
- `Name` and `Tags`: optional labels shown to API and console users.
- `ApiKey` and `ApiSecret`: worker API credentials created in the console.
- `EncryptedApiKey`, `EncryptedApiSecret`, and `ConfigEncryptionKey`: encrypted credential storage.
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
- `MaxConcurrentTasks`: maximum concurrent gitflow tasks.

Credentials can be encrypted in the config. Keep the worker configuration private and run workers only on machines trusted to access the configured repositories, credentials, tools, and networks.

## Local Setup

Create or update configuration:

```bash
dotnet run -- init
```

During setup, provide the API key and secret, set the external API URL, choose the AI provider, and select the task types, paths, and skills this worker should advertise.

Start the worker:

```bash
dotnet run -- run
```

For real deployments, run one or more workers on the machines that already have the target repositories, build tools, private network access, and CLI credentials required for the work they should perform.
