using System.Text.Json;
using FirstDraft.Commands;
using FirstDraft.Configuration;
using FirstDraft.Infrastructure.Logging;

namespace FirstDraft.Features.Gitflow
{
  public static partial class GitflowCommandService
  {
    private const int MaxPullRequestBodyCharacters = 60000;

    private static readonly JsonSerializerOptions JsonOptions = new JsonSerializerOptions
    {
      PropertyNameCaseInsensitive = true
    };

    public static string Execute(
        Log log,
        ApplicationData applicationData,
        string command,
        int timeoutMinutes,
        string apiBaseUrl = "",
        string workerAccessToken = "",
        Action<CommandLineOutputChunk>? outputChunkHandler = null)
    {
      return new GitflowWorkflow(
          log,
          applicationData,
          timeoutMinutes,
          outputChunkHandler).Execute(command);
    }
  }
}
