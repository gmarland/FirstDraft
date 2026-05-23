namespace FirstDraft.Commands
{
  public interface ICommandHandler
  {
    string Mode { get; }

    Task<string> ExecuteAsync(string command, CommandExecutionContext context);
  }
}
