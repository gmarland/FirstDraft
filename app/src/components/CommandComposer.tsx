import { FormEvent, useEffect, useMemo, useState } from "react";
import { Alert, Autocomplete, Box, Button, Chip, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import SendIcon from "@mui/icons-material/Send";
import TerminalIcon from "@mui/icons-material/Terminal";
import type { CommandMode, GitRepositorySuggestion } from "../types/api";

type GitflowForm = {
  repositoryUrl: string;
  sourceBranch: string;
  targetBranch: string;
  ticketNumber: string;
  description: string;
};

type Props = {
  disabled?: boolean;
  fixedCommandMode?: CommandMode;
  gitflowContinuation?: boolean;
  placeholder?: string;
  supportedSkills?: string[];
  gitRepositorySuggestions?: GitRepositorySuggestion[];
  onSubmit(command: string, commandMode: CommandMode): Promise<void>;
};

export function CommandComposer({
  disabled,
  fixedCommandMode,
  gitflowContinuation = false,
  placeholder,
  supportedSkills = [],
  gitRepositorySuggestions = [],
  onSubmit
}: Props) {
  const [command, setCommand] = useState("");
  const [selectedCommandMode, setSelectedCommandMode] = useState<CommandMode>(fixedCommandMode ?? "ai");
  const [gitflow, setGitflow] = useState<GitflowForm>({
    repositoryUrl: "",
    sourceBranch: "main",
    targetBranch: "main",
    ticketNumber: "",
    description: ""
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedSkills = useMemo(() => supportedSkills.map((skill) => skill.toLowerCase()), [supportedSkills]);
  const commandMode = fixedCommandMode ?? selectedCommandMode;
  const selectedRepository = useMemo(
    () => gitRepositorySuggestions.find((repository) => repository.repositoryUrl === gitflow.repositoryUrl),
    [gitRepositorySuggestions, gitflow.repositoryUrl]
  );
  const branchOptions = useMemo(
    () => uniqueStrings([
      selectedRepository?.defaultSourceBranch,
      selectedRepository?.defaultTargetBranch,
      selectedRepository?.lastSourceBranch,
      gitflow.sourceBranch,
      gitflow.targetBranch
    ]),
    [selectedRepository, gitflow.sourceBranch, gitflow.targetBranch]
  );

  useEffect(() => {
    if (fixedCommandMode) {
      setSelectedCommandMode(fixedCommandMode);
      return;
    }

    if (!isCommandModeSupported(selectedCommandMode, normalizedSkills)) {
      setSelectedCommandMode("ai");
    }
  }, [fixedCommandMode, selectedCommandMode, normalizedSkills]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const payload = buildPayload(commandMode, command, gitflow, gitflowContinuation);
    if (!payload) return;

    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(payload, commandMode);
      if (commandMode === "gitflow" && !gitflowContinuation) {
        setGitflow((current) => ({ ...current, ticketNumber: "", description: "" }));
      } else {
        setCommand("");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Command failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack component="form" spacing={1.5} onSubmit={submit}>
      {!fixedCommandMode && (
        <ToggleButtonGroup
          exclusive
          size="small"
          value={commandMode}
          onChange={(_, value: CommandMode | null) => {
            if (value && isCommandModeSupported(value, normalizedSkills)) setSelectedCommandMode(value);
          }}
          disabled={disabled || submitting}
          aria-label="Command mode"
        >
          <ToggleButton value="ai" aria-label="AI command">
            <AutoAwesomeIcon fontSize="small" sx={{ mr: 0.75 }} />
            AI
          </ToggleButton>
          <ToggleButton value="shell" aria-label="Shell command">
            <TerminalIcon fontSize="small" sx={{ mr: 0.75 }} />
            Shell
          </ToggleButton>
          <ToggleButton value="gitflow" aria-label="Gitflow command" disabled={!normalizedSkills.includes("git")}>
            <AccountTreeIcon fontSize="small" sx={{ mr: 0.75 }} />
            Gitflow
          </ToggleButton>
        </ToggleButtonGroup>
      )}
      {commandMode === "gitflow" && !gitflowContinuation ? (
        <Stack spacing={1.5}>
          <Autocomplete
            freeSolo
            options={gitRepositorySuggestions}
            inputValue={gitflow.repositoryUrl}
            getOptionLabel={(option) => typeof option === "string" ? option : option.repositoryUrl}
            isOptionEqualToValue={(option, value) =>
              typeof value !== "string" && option.normalizedRepositoryUrl === value.normalizedRepositoryUrl
            }
            onInputChange={(_, value) => setGitflow((current) => ({ ...current, repositoryUrl: value }))}
            onChange={(_, value) => {
              if (!value || typeof value === "string") return;
              setGitflow((current) => ({
                ...current,
                repositoryUrl: value.repositoryUrl,
                sourceBranch: value.lastSourceBranch || value.defaultSourceBranch || current.sourceBranch,
                targetBranch: value.defaultTargetBranch || value.defaultSourceBranch || value.lastSourceBranch || current.targetBranch
              }));
            }}
            disabled={disabled || submitting}
            renderInput={(params) => <TextField {...params} label="Repository URL" fullWidth />}
            renderOption={(props, option) => (
              <Box component="li" {...props} sx={{ alignItems: "flex-start !important", gap: 1 }}>
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                  <Typography className="wrap-code" sx={{ fontWeight: 800 }}>
                    {option.repositoryUrl}
                  </Typography>
                  {(option.lastSourceBranch || option.defaultSourceBranch) && (
                    <Typography variant="caption" color="text.secondary">
                      {option.lastSourceBranch || option.defaultSourceBranch}
                    </Typography>
                  )}
                </Box>
                {option.previouslyUsedByWorker && <Chip label="Worker used" size="small" />}
              </Box>
            )}
          />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <Autocomplete
              freeSolo
              options={branchOptions}
              inputValue={gitflow.sourceBranch}
              onInputChange={(_, value) => setGitflow((current) => ({ ...current, sourceBranch: value }))}
              disabled={disabled || submitting}
              fullWidth
              renderInput={(params) => <TextField {...params} label="Source branch" fullWidth />}
            />
            <Autocomplete
              freeSolo
              options={branchOptions}
              inputValue={gitflow.targetBranch}
              onInputChange={(_, value) => setGitflow((current) => ({ ...current, targetBranch: value }))}
              disabled={disabled || submitting}
              fullWidth
              renderInput={(params) => <TextField {...params} label="Target branch for PRs" fullWidth />}
            />
          </Stack>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Ticket number"
              value={gitflow.ticketNumber}
              onChange={(event) => setGitflow((current) => ({ ...current, ticketNumber: event.target.value }))}
              disabled={disabled || submitting}
              fullWidth
            />
          </Stack>
          <TextField
            label="Feature or bug description"
            value={gitflow.description}
            onChange={(event) => setGitflow((current) => ({ ...current, description: event.target.value }))}
            disabled={disabled || submitting}
            multiline
            minRows={4}
            fullWidth
          />
        </Stack>
      ) : (
        <TextField
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          placeholder={placeholder ?? getCommandPlaceholder(commandMode, gitflowContinuation)}
          disabled={disabled || submitting}
          multiline
          minRows={3}
          fullWidth
        />
      )}
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", justifyContent: "space-between" }}>
        {error && <Alert severity="error" sx={{ flexGrow: 1 }}>{error}</Alert>}
        <Button variant="contained" type="submit" startIcon={<SendIcon />} disabled={disabled || submitting || !canSubmit(commandMode, command, gitflow, gitflowContinuation)}>
          {submitting ? "Queueing" : "Queue command"}
        </Button>
      </Stack>
    </Stack>
  );
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values.map((candidate) => candidate?.trim()).filter((candidate): candidate is string => Boolean(candidate))) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }

  return result;
}

function isCommandModeSupported(commandMode: CommandMode, supportedSkills: string[]): boolean {
  if (commandMode === "gitflow") return supportedSkills.includes("git");
  return true;
}

function canSubmit(commandMode: CommandMode, command: string, gitflow: GitflowForm, gitflowContinuation: boolean): boolean {
  if (commandMode !== "gitflow" || gitflowContinuation) return Boolean(command.trim());

  return Boolean(
    gitflow.repositoryUrl.trim() &&
    gitflow.sourceBranch.trim() &&
    gitflow.targetBranch.trim() &&
    gitflow.ticketNumber.trim() &&
    gitflow.description.trim()
  );
}

function buildPayload(commandMode: CommandMode, command: string, gitflow: GitflowForm, gitflowContinuation: boolean): string | undefined {
  if (commandMode !== "gitflow" || gitflowContinuation) return command.trim() || undefined;

  if (!canSubmit(commandMode, command, gitflow, gitflowContinuation)) return undefined;

  return JSON.stringify({
    repositoryUrl: gitflow.repositoryUrl.trim(),
    sourceBranch: gitflow.sourceBranch.trim(),
    targetBranch: gitflow.targetBranch.trim(),
    ticketNumber: gitflow.ticketNumber.trim(),
    description: gitflow.description.trim()
  });
}

function getCommandPlaceholder(commandMode: CommandMode, gitflowContinuation: boolean): string {
  if (gitflowContinuation) return "Describe the PR follow-up or correction";
  if (commandMode === "ai") return "Ask the AI agent what to do";
  return "Enter a shell command";
}
