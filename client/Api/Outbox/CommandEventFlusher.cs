using FirstDraft.Api.Auth;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using FirstDraft.Configuration;
using FirstDraft.Infrastructure.Logging;

namespace FirstDraft.Api.Outbox
{
    internal sealed class CommandEventFlusher
    {
        private readonly Log _logger;
        private readonly ApplicationData _applicationData;
        private readonly WorkerTokenManager _tokens;
        private readonly CommandEventOutbox _commandEvents;
        private readonly HttpClient _http = new HttpClient();
        private readonly SemaphoreSlim _flushLock = new SemaphoreSlim(1, 1);

        public CommandEventFlusher(
            Log logger,
            ApplicationData applicationData,
            WorkerTokenManager tokens,
            CommandEventOutbox commandEvents)
        {
            _logger = logger;
            _applicationData = applicationData;
            _tokens = tokens;
            _commandEvents = commandEvents;
        }

        public async Task FlushPendingCommandEvents(bool waitForLock = false)
        {
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
                while (true)
                {
                    IReadOnlyList<PendingCommandEvent> events = await _commandEvents.ReadAll();
                    if (events.Count == 0) return;

                    List<string> deliveredEventIds = new List<string>();
                    foreach (PendingCommandEvent pendingEvent in OrderEventsForFlush(events))
                    {
                        try
                        {
                            await SendPendingCommandEvent(pendingEvent);
                            deliveredEventIds.Add(pendingEvent.Id);
                        }
                        catch (Exception ex)
                        {
                            if (CanDiscardFailedEvent(pendingEvent, ex))
                            {
                                _logger.Debug($"Discarding stale command event {pendingEvent.Type} for {pendingEvent.TransactionId}: {ex.Message}");
                                deliveredEventIds.Add(pendingEvent.Id);
                                continue;
                            }

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

        private static IEnumerable<PendingCommandEvent> OrderEventsForFlush(IReadOnlyList<PendingCommandEvent> events)
        {
            HashSet<string> terminalTransactionIds = events
                .Where(IsTerminalEvent)
                .Select(pendingEvent => pendingEvent.TransactionId)
                .ToHashSet(StringComparer.Ordinal);

            return events
                .Select((pendingEvent, index) => new { PendingEvent = pendingEvent, Index = index })
                .OrderBy(item => EventPriority(item.PendingEvent, terminalTransactionIds))
                .ThenBy(item => item.Index)
                .Select(item => item.PendingEvent);
        }

        private static int EventPriority(PendingCommandEvent pendingEvent, ISet<string> terminalTransactionIds)
        {
            return terminalTransactionIds.Contains(pendingEvent.TransactionId) ? 0 : 1;
        }

        private static bool IsTerminalEvent(PendingCommandEvent pendingEvent)
        {
            return pendingEvent.Type == CommandEventType.CommandResult ||
                   pendingEvent.Type == CommandEventType.CommandRejected;
        }

        private static bool CanDiscardFailedEvent(PendingCommandEvent pendingEvent, Exception exception)
        {
            if (pendingEvent.Type != CommandEventType.OutputChunk) return false;

            return exception is HttpRequestException { StatusCode: HttpStatusCode.NotFound };
        }

        private async Task SendPendingCommandEvent(PendingCommandEvent pendingEvent)
        {
            string accessToken = await _tokens.EnsureAccessTokenAsync();

            switch (pendingEvent.Type)
            {
                case CommandEventType.OutputChunk:
                    await PostJson(
                        $"/api/worker-auth/tasks/{Uri.EscapeDataString(pendingEvent.TransactionId)}/output",
                        accessToken,
                        new
                        {
                            sequence = pendingEvent.Sequence,
                            stream = pendingEvent.Stream,
                            text = pendingEvent.Text,
                            emittedAt = pendingEvent.EmittedAt
                        });
                    return;

                case CommandEventType.CommandResult:
                    await PostJson(
                        $"/api/worker-auth/tasks/{Uri.EscapeDataString(pendingEvent.TransactionId)}/complete",
                        accessToken,
                        new
                        {
                            result = pendingEvent.Result,
                            errorMessage = pendingEvent.ErrorMessage
                        });
                    return;

                case CommandEventType.CommandRejected:
                    await PostJson(
                        $"/api/worker-auth/tasks/{Uri.EscapeDataString(pendingEvent.TransactionId)}/reject",
                        accessToken,
                        new
                        {
                            reason = pendingEvent.ErrorMessage ?? "worker rejected command"
                        });
                    return;

                default:
                    throw new InvalidOperationException($"Unsupported pending command event type: {pendingEvent.Type}");
            }
        }

        private async Task PostJson(string path, string accessToken, object body)
        {
            using HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, $"{_applicationData.ExternalAPI}{path}");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", accessToken);
            request.Content = JsonContent.Create(body);

            using HttpResponseMessage response = await _http.SendAsync(request);
            response.EnsureSuccessStatusCode();
        }
    }
}
