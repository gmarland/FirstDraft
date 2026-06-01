using FirstDraft.Commands;
using FirstDraft.Configuration;
using FirstDraft.Features.AI;
using FirstDraft.Infrastructure.Logging;

namespace FirstDraft.Features.Gitflow
{
  public static partial class GitflowCommandService
  {
    private sealed class GitflowWorkflow
    {
      private readonly Log _log;
      private readonly ApplicationData _applicationData;
      private readonly int _timeoutMinutes;
      private readonly Action<CommandLineOutputChunk>? _outputChunkHandler;
      private long _sequence;

      public GitflowWorkflow(
          Log log,
          ApplicationData applicationData,
          int timeoutMinutes,
          Action<CommandLineOutputChunk>? outputChunkHandler)
      {
        _log = log;
        _applicationData = applicationData;
        _timeoutMinutes = timeoutMinutes;
        _outputChunkHandler = outputChunkHandler;
      }

      public string Execute(string command)
      {
        GitflowCommandPayload payload = ParsePayload(command);
        if (string.Equals(payload.Action, "continue", StringComparison.OrdinalIgnoreCase))
        {
          return ExecuteContinuation(payload);
        }

        string sourceBranch = ValidateBranchName(payload.SourceBranch, "sourceBranch");
        string targetBranch = ValidateBranchName(payload.TargetBranch ?? payload.SourceBranch, "targetBranch");
        string ticketNumber = SanitizeBranchComponent(payload.TicketNumber);
        string branchName = $"{ticketNumber}-{CreateShortId()}";
        string repositoryPath = ResolveRepositoryPath(_applicationData, payload.RepositoryUrl);
        string worktreePath = ResolveWorktreePath(repositoryPath, branchName);
        string summary = BuildSummary(payload.TicketNumber, payload.Title, payload.Description);

        Emit("stdout", $"Starting gitflow command for {payload.TicketNumber}");
        Emit("stdout", $"Repository: {payload.RepositoryUrl}");
        Emit("stdout", $"Source branch: {sourceBranch}");
        Emit("stdout", $"Target branch: {targetBranch}");
        Emit("stdout", $"Working branch: {branchName}");
        Emit("stdout", $"Worktree: {worktreePath}");
        if (!string.IsNullOrWhiteSpace(payload.TicketUrl)) Emit("stdout", $"Ticket URL: {payload.TicketUrl}");

        PrepareRepository(_log, payload.RepositoryUrl, repositoryPath, worktreePath, sourceBranch, targetBranch, branchName, _timeoutMinutes, Emit);
        IReadOnlyList<LocalGitflowAttachment> attachments = DownloadAttachments(
            _log,
            _applicationData,
            payload,
            worktreePath,
            _timeoutMinutes,
            Emit);

        if (_applicationData.AIProvider == AIProvider.None)
          throw new InvalidOperationException("No AI provider configured. Set AIProvider in application data.");

        string aiPrompt = BuildImplementationPrompt(payload, attachments);
        Emit("stdout", "Repository prepared. Starting AI implementation.");

        string aiResult = AIService.SendMessage(
            _log,
            _applicationData,
            aiPrompt,
            _timeoutMinutes,
            chunk => Emit(chunk.Stream, chunk.Text),
            worktreePath);
        string cleanAiSummary = BuildCleanAiSummary(aiResult);

        Emit("stdout", "AI implementation completed. Inspecting repository changes.");
        RemoveAttachmentDirectory(_log, worktreePath, _timeoutMinutes, Emit);
        string status = RunGit(_log, worktreePath, new[] { "status", "--porcelain" }, _timeoutMinutes, Emit).Trim();
        if (string.IsNullOrWhiteSpace(status))
        {
          throw new InvalidOperationException("AI implementation completed without producing any git changes.");
        }

        Emit("stdout", "Changed files:");
        foreach (string line in status.Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
          Emit("stdout", line);
        }
        RunGit(_log, worktreePath, new[] { "add", "-A" }, _timeoutMinutes, Emit);
        RunGit(_log, worktreePath, new[] { "commit", "-m", summary }, _timeoutMinutes, Emit);
        string commitHash = RunGit(_log, worktreePath, new[] { "rev-parse", "--short", "HEAD" }, _timeoutMinutes, Emit).Trim();
        RunGit(_log, worktreePath, new[] { "push", "-u", "origin", branchName }, _timeoutMinutes, Emit);

        string prUrl;
        try
        {
          prUrl = CreateDraftPullRequest(_log, worktreePath, targetBranch, branchName, summary, payload, cleanAiSummary, _timeoutMinutes, Emit).Trim();
        }
        finally
        {
          RemoveAttachmentDirectory(_log, worktreePath, _timeoutMinutes, Emit);
          RemoveWorktree(_log, repositoryPath, worktreePath, _timeoutMinutes, Emit);
        }

        return BuildInitialResult(branchName, commitHash, prUrl, cleanAiSummary);
      }

      private string ExecuteContinuation(GitflowCommandPayload payload)
      {
        string sourceBranch = ValidateBranchName(payload.SourceBranch, "sourceBranch");
        string targetBranch = ValidateBranchName(payload.TargetBranch ?? payload.SourceBranch, "targetBranch");
        string branchName = ValidateBranchName(payload.WorkingBranch ?? "", "workingBranch");
        string repositoryPath = ResolveRepositoryPath(_applicationData, payload.RepositoryUrl);
        string worktreePath = ResolveWorktreePath(repositoryPath, branchName);
        string summary = BuildSummary(payload.TicketNumber, payload.FollowUpInstructions, payload.Title ?? payload.Description);

        Emit("stdout", $"Continuing gitflow command for {payload.TicketNumber}");
        Emit("stdout", $"Repository: {payload.RepositoryUrl}");
        Emit("stdout", $"Source branch: {sourceBranch}");
        Emit("stdout", $"Target branch: {targetBranch}");
        Emit("stdout", $"Working branch: {branchName}");
        Emit("stdout", $"Worktree: {worktreePath}");
        if (!string.IsNullOrWhiteSpace(payload.PrUrl)) Emit("stdout", $"Pull request: {payload.PrUrl}");

        PrepareExistingBranch(_log, payload.RepositoryUrl, repositoryPath, worktreePath, sourceBranch, branchName, _timeoutMinutes, Emit);

        if (_applicationData.AIProvider == AIProvider.None)
          throw new InvalidOperationException("No AI provider configured. Set AIProvider in application data.");

        string aiPrompt = BuildContinuationPrompt(payload);
        Emit("stdout", "Repository prepared. Starting AI follow-up implementation.");

        string aiResult = AIService.SendMessage(
            _log,
            _applicationData,
            aiPrompt,
            _timeoutMinutes,
            chunk => Emit(chunk.Stream, chunk.Text),
            worktreePath);
        string cleanAiSummary = BuildCleanAiSummary(aiResult);

        Emit("stdout", "AI follow-up completed. Inspecting repository changes.");
        string status = RunGit(_log, worktreePath, new[] { "status", "--porcelain" }, _timeoutMinutes, Emit).Trim();
        if (string.IsNullOrWhiteSpace(status))
        {
          throw new InvalidOperationException("AI follow-up completed without producing any git changes.");
        }

        Emit("stdout", "Changed files:");
        foreach (string line in status.Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
          Emit("stdout", line);
        }

        RunGit(_log, worktreePath, new[] { "add", "-A" }, _timeoutMinutes, Emit);
        RunGit(_log, worktreePath, new[] { "commit", "-m", summary }, _timeoutMinutes, Emit);
        string commitHash = RunGit(_log, worktreePath, new[] { "rev-parse", "--short", "HEAD" }, _timeoutMinutes, Emit).Trim();
        RunGit(_log, worktreePath, new[] { "push", "origin", branchName }, _timeoutMinutes, Emit);
        RemoveWorktree(_log, repositoryPath, worktreePath, _timeoutMinutes, Emit);

        return BuildContinuationResult(branchName, commitHash, payload.PrUrl, cleanAiSummary);
      }

      private void Emit(string stream, string text)
      {
        _outputChunkHandler?.Invoke(new CommandLineOutputChunk(
            Interlocked.Increment(ref _sequence),
            stream,
            text,
            DateTime.UtcNow));
      }
    }
  }
}
