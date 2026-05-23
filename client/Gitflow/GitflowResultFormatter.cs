using System.Text;

namespace FirstDraft.Gitflow
{
  public static partial class GitflowCommandService
  {
    private static string BuildInitialResult(string branchName, string commitHash, string prUrl, string cleanAiSummary)
    {
      StringBuilder result = new StringBuilder();
      result.AppendLine($"Branch: {branchName}");
      result.AppendLine($"Commit: {commitHash}");
      result.AppendLine($"Pull request: {prUrl}");
      result.AppendLine();
      result.AppendLine("AI summary:");
      result.AppendLine(cleanAiSummary);
      return result.ToString();
    }

    private static string BuildContinuationResult(string branchName, string commitHash, string? prUrl, string cleanAiSummary)
    {
      StringBuilder result = new StringBuilder();
      result.AppendLine($"Branch: {branchName}");
      result.AppendLine($"Commit: {commitHash}");
      if (!string.IsNullOrWhiteSpace(prUrl)) result.AppendLine($"Pull request: {prUrl}");
      result.AppendLine();
      result.AppendLine("AI summary:");
      result.AppendLine(cleanAiSummary);
      return result.ToString();
    }
  }
}
