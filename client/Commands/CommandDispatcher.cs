using FirstDraft.Configuration;

namespace FirstDraft.Commands
{
  public sealed class CommandDispatcher
  {
    private readonly IReadOnlyDictionary<string, ICommandHandler> _handlers;

    public CommandDispatcher(IEnumerable<ICommandHandler> handlers)
    {
      _handlers = handlers.ToDictionary(handler => handler.Mode, StringComparer.OrdinalIgnoreCase);
    }

    public Task<string> ExecuteAsync(string commandMode, string command, CommandExecutionContext context)
    {
      WorkerTaskTypeRegistry.ValidateCommandTaskType(commandMode, context.ApplicationData.EnabledTaskTypes);
      WorkerSkillRegistry.ValidateCommandSkills(commandMode, context.ApplicationData.Skills);

      if (!_handlers.TryGetValue(commandMode, out ICommandHandler? handler))
      {
        throw new InvalidOperationException($"Unsupported command mode: {commandMode}");
      }

      return handler.ExecuteAsync(command, context);
    }
  }
}
