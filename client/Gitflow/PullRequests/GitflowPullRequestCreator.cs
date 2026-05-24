using FirstDraft.Infrastructure.Logging;

namespace FirstDraft.Gitflow
{
  public static partial class GitflowCommandService
  {
    private static string CreateDraftPullRequest(
        Log log,
        string repositoryPath,
        string targetBranch,
        string branchName,
        string title,
        GitflowCommandPayload payload,
        string aiResult,
        int timeoutMinutes,
        Action<string, string> emit)
    {
      string body = BuildPullRequestBody(aiResult, payload.TicketNumber, payload.TicketUrl);

      emit("stdout", "Creating draft pull request.");
      return RunProcess(
          log,
          repositoryPath,
          "gh",
          new[] { "pr", "create", "--draft", "--base", targetBranch, "--head", branchName, "--title", title, "--body", body },
          timeoutMinutes,
          emit);
    }
  }
}
