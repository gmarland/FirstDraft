using FirstDraft.Commands;
using FirstDraft.Features.Gitflow;

namespace FirstDraft.Commands.Handlers
{
  public sealed class GitflowCommandHandler : ICommandHandler
  {
    public string Mode => "gitflow";

    public async Task<string> ExecuteAsync(string command, CommandExecutionContext context)
    {
      string result = GitflowCommandService.Execute(
          context.Logger,
          context.ApplicationData,
          command,
          context.TimeoutMinutes,
          context.ApplicationData.ExternalAPI ?? "",
          await context.GetWorkerAccessToken(),
          context.OutputChunkHandler);

      return result;
    }
  }
}
