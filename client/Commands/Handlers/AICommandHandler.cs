using FirstDraft.Commands;
using FirstDraft.Configuration;
using FirstDraft.Features.AI;

namespace FirstDraft.Commands.Handlers
{
  public sealed class AICommandHandler : ICommandHandler
  {
    public string Mode => "ai";

    public Task<string> ExecuteAsync(string command, CommandExecutionContext context)
    {
      if (context.ApplicationData.AIProvider == AIProvider.None)
      {
        throw new InvalidOperationException("No AI provider configured. Set AIProvider in application data.");
      }

      string result = AIService.SendMessage(
          context.Logger,
          context.ApplicationData,
          command,
          context.TimeoutMinutes,
          context.OutputChunkHandler);

      return Task.FromResult(result);
    }
  }
}
