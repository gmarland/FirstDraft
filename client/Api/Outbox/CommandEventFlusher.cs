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
                    await _hub.InvokeAsync(
                        "CommandOutputChunk",
                        accessToken,
                        pendingEvent.TransactionId,
                        pendingEvent.Sequence,
                        pendingEvent.Stream,
                        pendingEvent.Text,
                        pendingEvent.EmittedAt);
                    return;

                case CommandEventType.CommandResult:
                    await _hub.InvokeAsync(
                        "ExecuteCommandResult",
                        accessToken,
                        pendingEvent.TransactionId,
                        pendingEvent.Result,
                        pendingEvent.ErrorMessage);
                    return;

                case CommandEventType.CommandRejected:
                    await _hub.InvokeAsync(
                        "RejectCommand",
                        accessToken,
                        pendingEvent.TransactionId,
                        pendingEvent.ErrorMessage ?? "worker rejected command");
                    return;

                default:
                    throw new InvalidOperationException($"Unsupported pending command event type: {pendingEvent.Type}");
            }
        }
    }
}
