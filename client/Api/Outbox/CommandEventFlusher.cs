using FirstDraft.Api.Contracts;
using FirstDraft.Api.Auth;
using FirstDraft.Infrastructure.Logging;

namespace FirstDraft.Api.Outbox
{
    internal sealed class CommandEventFlusher
    {
        private readonly Log _logger;
        private readonly WorkerTokenManager _tokens;
        private readonly CommandEventOutbox _commandEvents;
        private readonly WorkerHubConnection _hub;
        private readonly SemaphoreSlim _flushLock = new SemaphoreSlim(1, 1);

        public CommandEventFlusher(
            Log logger,
            WorkerTokenManager tokens,
            CommandEventOutbox commandEvents,
            WorkerHubConnection hub)
        {
            _logger = logger;
            _tokens = tokens;
            _commandEvents = commandEvents;
            _hub = hub;
        }

        public async Task FlushPendingCommandEvents(bool waitForLock = false)
        {
            if (!_hub.IsConnected) return;
            if (waitForLock)
            {
                await _flushLock.WaitAsync();
            }
            else if (!await _flushLock.WaitAsync(0))
            {
                return;
            }

            try
            {
                while (_hub.IsConnected)
                {
                    IReadOnlyList<PendingCommandEvent> events = await _commandEvents.ReadAll();
                    if (events.Count == 0) return;

                    List<string> deliveredEventIds = new List<string>();
                    foreach (PendingCommandEvent pendingEvent in events)
                    {
                        if (!_hub.IsConnected) break;

                        try
                        {
                            await SendPendingCommandEvent(pendingEvent);
                            deliveredEventIds.Add(pendingEvent.Id);
                        }
                        catch (Exception ex)
                        {
                            _logger.Debug($"Unable to flush command event {pendingEvent.Type} for {pendingEvent.TransactionId}: {ex.Message}");
                            break;
                        }
                    }

                    if (deliveredEventIds.Count > 0)
                    {
                        await _commandEvents.RemoveDelivered(deliveredEventIds);
                    }

                    if (deliveredEventIds.Count < events.Count) return;
                }
            }
            finally
            {
                _flushLock.Release();
            }
        }

        private async Task SendPendingCommandEvent(PendingCommandEvent pendingEvent)
        {
            string accessToken = await _tokens.EnsureAccessTokenAsync();

            switch (pendingEvent.Type)
            {
                case CommandEventType.OutputChunk:
                    object?[] outputChunkArguments = new object?[WorkerHubContract.CommandOutputChunkArguments.EmittedAt + 1];
                    outputChunkArguments[WorkerHubContract.CommandOutputChunkArguments.AccessToken] = accessToken;
                    outputChunkArguments[WorkerHubContract.CommandOutputChunkArguments.TransactionId] = pendingEvent.TransactionId;
                    outputChunkArguments[WorkerHubContract.CommandOutputChunkArguments.Sequence] = pendingEvent.Sequence;
                    outputChunkArguments[WorkerHubContract.CommandOutputChunkArguments.Stream] = pendingEvent.Stream;
                    outputChunkArguments[WorkerHubContract.CommandOutputChunkArguments.Text] = pendingEvent.Text;
                    outputChunkArguments[WorkerHubContract.CommandOutputChunkArguments.EmittedAt] = pendingEvent.EmittedAt;

                    await _hub.InvokeAsync(WorkerHubContract.ServerMethods.CommandOutputChunk, outputChunkArguments);
                    return;

                case CommandEventType.CommandResult:
                    object?[] commandResultArguments = new object?[WorkerHubContract.CommandResultArguments.ErrorMessage + 1];
                    commandResultArguments[WorkerHubContract.CommandResultArguments.AccessToken] = accessToken;
                    commandResultArguments[WorkerHubContract.CommandResultArguments.TransactionId] = pendingEvent.TransactionId;
                    commandResultArguments[WorkerHubContract.CommandResultArguments.Result] = pendingEvent.Result;
                    commandResultArguments[WorkerHubContract.CommandResultArguments.ErrorMessage] = pendingEvent.ErrorMessage;

                    await _hub.InvokeAsync(WorkerHubContract.ServerMethods.ExecuteCommandResult, commandResultArguments);
                    return;

                case CommandEventType.CommandRejected:
                    object?[] rejectCommandArguments = new object?[WorkerHubContract.RejectCommandArguments.Reason + 1];
                    rejectCommandArguments[WorkerHubContract.RejectCommandArguments.AccessToken] = accessToken;
                    rejectCommandArguments[WorkerHubContract.RejectCommandArguments.TransactionId] = pendingEvent.TransactionId;
                    rejectCommandArguments[WorkerHubContract.RejectCommandArguments.Reason] = pendingEvent.ErrorMessage ?? "worker rejected command";

                    await _hub.InvokeAsync(WorkerHubContract.ServerMethods.RejectCommand, rejectCommandArguments);
                    return;

                default:
                    throw new InvalidOperationException($"Unsupported pending command event type: {pendingEvent.Type}");
            }
        }
    }
}
