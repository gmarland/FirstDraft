using System.Security.Cryptography;
using System.Text.RegularExpressions;
using FirstDraft.Configuration;

namespace FirstDraft.Features.Gitflow
{
  public static partial class GitflowCommandService
  {
    private static string ResolveRepositoryPath(ApplicationData applicationData, string repositoryUrl)
    {
      string root = !string.IsNullOrWhiteSpace(applicationData.GitWorkspaceDirectory)
          ? applicationData.GitWorkspaceDirectory
          : Path.Combine(
              !string.IsNullOrWhiteSpace(applicationData.AIWorkingDirectory)
                  ? applicationData.AIWorkingDirectory
                  : Directory.GetCurrentDirectory(),
              "repos");

      return Path.Combine(Path.GetFullPath(root), BuildRepositoryFolderName(repositoryUrl));
    }

    private static string ResolveWorktreePath(string repositoryPath, string branchName)
    {
      string worktreeRoot = $"{repositoryPath}.worktrees";
      return Path.Combine(worktreeRoot, SanitizePathComponent(branchName));
    }

    private static string BuildRepositoryFolderName(string repositoryUrl)
    {
      string normalized = repositoryUrl.Trim().Replace('\\', '/').TrimEnd('/');
      if (normalized.EndsWith(".git", StringComparison.OrdinalIgnoreCase))
        normalized = normalized.Substring(0, normalized.Length - 4);

      int colonIndex = normalized.LastIndexOf(':');
      if (colonIndex >= 0 && !normalized.Substring(0, colonIndex).Contains('/'))
        normalized = normalized.Substring(colonIndex + 1);

      string[] parts = normalized.Split('/', StringSplitOptions.RemoveEmptyEntries);
      string owner = parts.Length >= 2 ? parts[^2] : "repo";
      string repo = parts.Length >= 1 ? parts[^1] : "checkout";
      return SanitizePathComponent($"{owner}-{repo}");
    }

    private static string ValidateBranchName(string branchName, string fieldName)
    {
      if (!Regex.IsMatch(branchName, "^[A-Za-z0-9._/-]+$") ||
          branchName.Contains("..") ||
          branchName.StartsWith("/") ||
          branchName.EndsWith("/") ||
          branchName.EndsWith("."))
      {
        throw new InvalidOperationException($"{fieldName} contains unsafe branch characters.");
      }

      return branchName;
    }

    private static string SanitizeBranchComponent(string value)
    {
      string sanitized = Regex.Replace(value.Trim(), "[^A-Za-z0-9._-]+", "-").Trim('-', '.', '_');
      if (string.IsNullOrWhiteSpace(sanitized))
        throw new InvalidOperationException("ticketNumber does not contain any branch-safe characters.");

      return sanitized;
    }

    private static string SanitizePathComponent(string value)
    {
      string sanitized = Regex.Replace(value.Trim(), "[^A-Za-z0-9._-]+", "-").Trim('-', '.', '_');
      return string.IsNullOrWhiteSpace(sanitized) ? "repository" : sanitized;
    }

    private static string NormalizeRepositoryUrl(string value)
    {
      return value.Trim().TrimEnd('/').Replace('\\', '/');
    }

    private static string CreateShortId()
    {
      const string alphabet = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
      char[] chars = new char[8];
      byte[] bytes = RandomNumberGenerator.GetBytes(chars.Length);

      for (int i = 0; i < chars.Length; i++)
      {
        chars[i] = alphabet[bytes[i] % alphabet.Length];
      }

      return new string(chars);
    }

    private static string BuildSummary(string ticketNumber, string? title, string? description)
    {
      string? summaryText = !string.IsNullOrWhiteSpace(title) ? title : description;
      string firstLine = summaryText?.Split('\n', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault()?.Trim() ?? "Implement requested change";
      if (firstLine.Length > 72) firstLine = firstLine.Substring(0, 72).TrimEnd();
      return $"{ticketNumber}: {firstLine}";
    }
  }
}
