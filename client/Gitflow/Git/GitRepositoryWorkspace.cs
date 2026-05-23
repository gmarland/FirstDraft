using System.Collections.Concurrent;
using FirstDraft.Infrastructure.Logging;

namespace FirstDraft.Gitflow
{
  public static partial class GitflowCommandService
  {
    private static readonly ConcurrentDictionary<string, object> RepositoryLocks = new ConcurrentDictionary<string, object>();

    private static void PrepareRepository(
        Log log,
        string repositoryUrl,
        string repositoryPath,
        string worktreePath,
        string sourceBranch,
        string targetBranch,
        string branchName,
        int timeoutMinutes,
        Action<string, string> emit)
    {
      lock (GetRepositoryLock(repositoryPath))
      {
        PrepareRepositoryCache(log, repositoryUrl, repositoryPath, timeoutMinutes, emit);

        RunGit(log, repositoryPath, new[] { "fetch", "--prune", "origin" }, timeoutMinutes, emit);
        EnsureRemoteBranchExists(log, repositoryPath, sourceBranch, "sourceBranch", timeoutMinutes);
        EnsureRemoteBranchExists(log, repositoryPath, targetBranch, "targetBranch", timeoutMinutes);
        RunGit(log, repositoryPath, new[] { "checkout", "--force", "--detach", $"origin/{sourceBranch}" }, timeoutMinutes, emit);
        RunGit(log, repositoryPath, new[] { "worktree", "prune" }, timeoutMinutes, emit);
        CreateWorktree(log, repositoryPath, worktreePath, branchName, $"origin/{sourceBranch}", timeoutMinutes, emit);
      }
    }

    private static void PrepareExistingBranch(
        Log log,
        string repositoryUrl,
        string repositoryPath,
        string worktreePath,
        string sourceBranch,
        string branchName,
        int timeoutMinutes,
        Action<string, string> emit)
    {
      lock (GetRepositoryLock(repositoryPath))
      {
        PrepareRepositoryCache(log, repositoryUrl, repositoryPath, timeoutMinutes, emit);

        RunGit(log, repositoryPath, new[] { "fetch", "--prune", "origin" }, timeoutMinutes, emit);
        RunGit(log, repositoryPath, new[] { "checkout", "--force", "--detach", $"origin/{sourceBranch}" }, timeoutMinutes, emit);
        RunGit(log, repositoryPath, new[] { "worktree", "prune" }, timeoutMinutes, emit);
        CreateWorktree(log, repositoryPath, worktreePath, branchName, $"origin/{branchName}", timeoutMinutes, emit);
      }
    }

    private static void PrepareRepositoryCache(
        Log log,
        string repositoryUrl,
        string repositoryPath,
        int timeoutMinutes,
        Action<string, string> emit)
    {
      Directory.CreateDirectory(Path.GetDirectoryName(repositoryPath)!);

      if (!Directory.Exists(repositoryPath))
      {
        emit("stdout", $"Cloning repository cache to {repositoryPath}");
        RunProcess(log, Directory.GetCurrentDirectory(), "git", new[] { "clone", repositoryUrl, repositoryPath }, timeoutMinutes, emit);
        return;
      }

      string gitDirectory = Path.Combine(repositoryPath, ".git");
      if (!Directory.Exists(gitDirectory))
        throw new InvalidOperationException($"Repository path already exists but is not a git repository: {repositoryPath}");

      string originUrl = RunGit(log, repositoryPath, new[] { "remote", "get-url", "origin" }, timeoutMinutes, emit).Trim();
      if (!string.Equals(NormalizeRepositoryUrl(originUrl), NormalizeRepositoryUrl(repositoryUrl), StringComparison.OrdinalIgnoreCase))
        throw new InvalidOperationException($"Existing repository origin does not match requested repository. Existing={originUrl}");

      string existingStatus = RunGit(log, repositoryPath, new[] { "status", "--porcelain" }, timeoutMinutes, emit).Trim();
      if (!string.IsNullOrWhiteSpace(existingStatus))
        throw new InvalidOperationException($"Repository cache has uncommitted changes: {repositoryPath}");
    }

    private static void EnsureRemoteBranchExists(
        Log log,
        string repositoryPath,
        string branchName,
        string fieldName,
        int timeoutMinutes)
    {
      string remoteRef = $"refs/remotes/origin/{branchName}";
      int exitCode = RunProcessForExitCode(log, repositoryPath, "git", new[] { "rev-parse", "--verify", "--quiet", remoteRef }, timeoutMinutes);
      if (exitCode != 0)
        throw new InvalidOperationException($"{fieldName} does not exist on origin: {branchName}");
    }

    private static void CreateWorktree(
        Log log,
        string repositoryPath,
        string worktreePath,
        string branchName,
        string startPoint,
        int timeoutMinutes,
        Action<string, string> emit)
    {
      if (Directory.Exists(worktreePath))
        throw new InvalidOperationException($"Gitflow worktree already exists for branch {branchName}: {worktreePath}");

      Directory.CreateDirectory(Path.GetDirectoryName(worktreePath)!);
      emit("stdout", $"Creating worktree at {worktreePath}");
      RunGit(log, repositoryPath, new[] { "worktree", "add", "-B", branchName, worktreePath, startPoint }, timeoutMinutes, emit);
    }

    private static void RemoveWorktree(
        Log log,
        string repositoryPath,
        string worktreePath,
        int timeoutMinutes,
        Action<string, string> emit)
    {
      if (!Directory.Exists(worktreePath)) return;

      lock (GetRepositoryLock(repositoryPath))
      {
        emit("stdout", $"Removing worktree {worktreePath}");
        RunGit(log, repositoryPath, new[] { "worktree", "remove", "--force", worktreePath }, timeoutMinutes, emit);
        RunGit(log, repositoryPath, new[] { "worktree", "prune" }, timeoutMinutes, emit);
      }
    }

    private static object GetRepositoryLock(string repositoryPath)
    {
      return RepositoryLocks.GetOrAdd(Path.GetFullPath(repositoryPath), _ => new object());
    }
  }
}
