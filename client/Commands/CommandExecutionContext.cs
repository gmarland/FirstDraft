using FirstDraft.Configuration;
using FirstDraft.Infrastructure.Logging;

namespace FirstDraft.Commands
{
  public sealed class CommandExecutionContext
  {
    public CommandExecutionContext(
        Log logger,
        ApplicationData applicationData,
        int timeoutMinutes,
        Func<Task<string>> getWorkerAccessToken,
        Action<CommandLineOutputChunk> outputChunkHandler)
    {
      Logger = logger;
      ApplicationData = applicationData;
      TimeoutMinutes = timeoutMinutes;
      GetWorkerAccessToken = getWorkerAccessToken;
      OutputChunkHandler = outputChunkHandler;
    }

    public Log Logger { get; }

    public ApplicationData ApplicationData { get; }

    public int TimeoutMinutes { get; }

    public Func<Task<string>> GetWorkerAccessToken { get; }

    public Action<CommandLineOutputChunk> OutputChunkHandler { get; }
  }
}
