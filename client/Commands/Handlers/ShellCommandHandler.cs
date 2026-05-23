using FirstDraft.Commands;
using FirstDraft.Shell;

namespace FirstDraft.Commands.Handlers
{
  public sealed class ShellCommandHandler : ICommandHandler
  {
    public string Mode => "shell";

    public Task<string> ExecuteAsync(string command, CommandExecutionContext context)
    {
      string result = ShellCommandService.Execute(
          context.Logger,
          context.ApplicationData,
          command,
          context.TimeoutMinutes,
          context.OutputChunkHandler);

      return Task.FromResult(result);
    }
  }
}
