using System.Text.Json;

namespace FirstDraft.Features.Gitflow
{
  public static partial class GitflowCommandService
  {
    private static GitflowCommandPayload ParsePayload(string command)
    {
      GitflowCommandPayload? payload;
      try
      {
        payload = JsonSerializer.Deserialize<GitflowCommandPayload>(command, JsonOptions);
      }
      catch (JsonException ex)
      {
        throw new InvalidOperationException("Gitflow command must be a JSON payload.", ex);
      }

      if (payload == null) throw new InvalidOperationException("Gitflow command payload is required.");
      if (string.IsNullOrWhiteSpace(payload.RepositoryUrl)) throw new InvalidOperationException("repositoryUrl is required.");
      if (string.IsNullOrWhiteSpace(payload.SourceBranch)) throw new InvalidOperationException("sourceBranch is required.");
      if (string.IsNullOrWhiteSpace(payload.TicketNumber)) throw new InvalidOperationException("ticketNumber is required.");
      if (string.IsNullOrWhiteSpace(payload.Title) && string.IsNullOrWhiteSpace(payload.Description)) throw new InvalidOperationException("title or description is required.");
      if (string.Equals(payload.Action, "continue", StringComparison.OrdinalIgnoreCase))
      {
        if (string.IsNullOrWhiteSpace(payload.WorkingBranch)) throw new InvalidOperationException("workingBranch is required for gitflow continuation.");
        if (string.IsNullOrWhiteSpace(payload.FollowUpInstructions)) throw new InvalidOperationException("followUpInstructions is required for gitflow continuation.");
      }

      return payload with
      {
        RepositoryUrl = payload.RepositoryUrl.Trim(),
        SourceBranch = payload.SourceBranch.Trim(),
        TicketNumber = payload.TicketNumber.Trim(),
        Description = NormalizeOptionalText(payload.Description),
        Title = NormalizeOptionalText(payload.Title),
        Action = payload.Action?.Trim(),
        WorkingBranch = payload.WorkingBranch?.Trim(),
        PrUrl = payload.PrUrl?.Trim(),
        LatestCommit = payload.LatestCommit?.Trim(),
        FollowUpInstructions = payload.FollowUpInstructions?.Trim(),
        PreviousContext = payload.PreviousContext?.Trim(),
        TicketUrl = string.IsNullOrWhiteSpace(payload.TicketUrl) ? null : payload.TicketUrl.Trim(),
        TargetBranch = string.IsNullOrWhiteSpace(payload.TargetBranch) ? null : payload.TargetBranch.Trim()
      };
    }

    private static string? NormalizeOptionalText(string? value)
    {
      return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    }
  }
}
