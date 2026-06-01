using System.Threading.Channels;
using FirstDraft.Api.Auth;
using FirstDraft.Api.Hub;
using FirstDraft.Api.Outbox;
using FirstDraft.Commands;
using FirstDraft.Configuration;
using FirstDraft.Infrastructure.Logging;

namespace FirstDraft.Api.Execution
{
    internal sealed class CommandExecutionRunner
    {
        private readonly Log _logger;
        private readonly ApplicationData _applicationData;
        private readonly WorkerTokenManager _tokens;
        private readonly CommandEventOutbox _commandEvents;
        private readonly CommandEventFlusher _commandEventFlusher;
        private readonly CommandDispatcher _commandDispatcher;
        private readonly SemaphoreSlim? _commandCapacity;

        public CommandExecutionRunner(
            Log logger,
            ApplicationData applicationData,
            WorkerTokenManager tokens,
            CommandEventOutbox commandEvents,
            CommandEventFlusher commandEventFlusher,
            CommandDispatcher commandDispatcher)
        {
            _logger = logger;
            _applicationData = applicationData;
            _tokens = tokens;
            _commandEvents = commandEvents;
            _commandEventFlusher = commandEventFlusher;
            _commandDispatcher = commandDispatcher;
            int? maxConcurrentTasks = WorkerApiSettings.GetMaxConcurrentTasks(applicationData);
            _commandCapacity = maxConcurrentTasks.HasValue
                ? new SemaphoreSlim(maxConcurrentTasks.Value, maxConcurrentTasks.Value)
                : null;
        }

        public int? AvailableCapacity => _commandCapacity?.CurrentCount;

        public async Task RunCommand(string transactionId, string command, string commandMode)
        {
            if (_commandCapacity != null) await _commandCapacity.WaitAsync();

            try
            {
                _logger.Info($"Request received to execute {commandMode} command: {command}");

                string? result = null;
                string? errorMessage = null;
                Channel<CommandLineOutputChunk> outputChunks = Channel.CreateUnbounded<CommandLineOutputChunk>();
                Task outputPump = StartOutputChunkPump(transactionId, outputChunks.Reader);

                try
                {
                    const int timeoutMinutes = 30;
                    CommandExecutionContext context = new CommandExecutionContext(
                        _logger,
                        _applicationData,
                        timeoutMinutes,
                        () => _tokens.EnsureAccessTokenAsync(),
                        chunk => outputChunks.Writer.TryWrite(chunk));

                    result = await _commandDispatcher.ExecuteAsync(commandMode, command, context);

                    _logger.Debug($"Command executed successfully, result length: {result?.Length ?? 0}");
                }
                catch (Exception ex)
                {
                    _logger.Error($"Error executing command: {command}", ex);
                    errorMessage = ex.Message;
                }
                finally
                {
                    outputChunks.Writer.TryComplete();
                    await outputPump;
                }

                await _commandEvents.EnqueueCommandResult(transactionId, result, errorMessage);
                await _commandEventFlusher.FlushPendingCommandEvents(waitForLock: true);
            }
            finally
            {
                _commandCapacity?.Release();
            }
        }

        public async Task RejectCommand(string transactionId, string reason)
        {
            try
            {
                await _commandEvents.EnqueueCommandRejected(transactionId, reason);
                await _commandEventFlusher.FlushPendingCommandEvents(waitForLock: true);
            }
            catch (Exception ex)
            {
                _logger.Error($"Unable to report rejected command {transactionId}", ex);
            }
        }

        private async Task StartOutputChunkPump(string transactionId, ChannelReader<CommandLineOutputChunk> outputChunks)
        {
            await foreach (CommandLineOutputChunk chunk in outputChunks.ReadAllAsync())
            {
                try
                {
                    await _commandEvents.EnqueueOutputChunk(transactionId, chunk);
                    _ = _commandEventFlusher.FlushPendingCommandEvents();
                }
                catch (Exception ex)
                {
                    _logger.Debug($"Error queueing command output for {transactionId}: {ex.Message}");
                }
            }
        }
    }
}
