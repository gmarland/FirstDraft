using System.Text.Json;
using FirstDraft.Commands;
using FirstDraft.Configuration;
using FirstDraft.Infrastructure.Logging;

namespace FirstDraft.Api.Outbox
{
    internal sealed class CommandEventOutbox
    {
        private readonly Log _logger;
        private readonly string _filePath;
        private readonly SemaphoreSlim _fileLock = new SemaphoreSlim(1, 1);

        public CommandEventOutbox(Log logger, ApplicationData applicationData)
        {
            _logger = logger;
            _filePath = Path.Combine(applicationData.GetLogsFolder(), "command-event-outbox.json");
        }

        public Task EnqueueOutputChunk(string transactionId, CommandLineOutputChunk chunk)
        {
            return Append(new PendingCommandEvent
            {
                Type = CommandEventType.OutputChunk,
                WorkerId = string.Empty,
                TransactionId = transactionId,
                Sequence = chunk.Sequence,
                Stream = chunk.Stream,
                Text = chunk.Text,
                EmittedAt = chunk.EmittedAt.ToString("O")
            });
        }

        public Task EnqueueCommandResult(string transactionId, string? result, string? errorMessage)
        {
            return Append(new PendingCommandEvent
            {
                Type = CommandEventType.CommandResult,
                WorkerId = string.Empty,
                TransactionId = transactionId,
                Result = result,
                ErrorMessage = errorMessage,
                EmittedAt = DateTime.UtcNow.ToString("O")
            });
        }

        public Task EnqueueCommandRejected(string transactionId, string reason)
        {
            return Append(new PendingCommandEvent
            {
                Type = CommandEventType.CommandRejected,
                WorkerId = string.Empty,
                TransactionId = transactionId,
                ErrorMessage = reason,
                EmittedAt = DateTime.UtcNow.ToString("O")
            });
        }

        public async Task<IReadOnlyList<PendingCommandEvent>> ReadAll()
        {
            await _fileLock.WaitAsync();
            try
            {
                return await ReadAllUnlocked();
            }
            finally
            {
                _fileLock.Release();
            }
        }

        public async Task RemoveDelivered(IReadOnlyCollection<string> deliveredEventIds)
        {
            if (deliveredEventIds.Count == 0) return;

            await _fileLock.WaitAsync();
            try
            {
                HashSet<string> delivered = new HashSet<string>(deliveredEventIds);
                List<PendingCommandEvent> remaining = (await ReadAllUnlocked())
                    .Where(pendingEvent => !delivered.Contains(pendingEvent.Id))
                    .ToList();

                await WriteAllUnlocked(remaining);
            }
            finally
            {
                _fileLock.Release();
            }
        }

        private async Task Append(PendingCommandEvent pendingEvent)
        {
            await _fileLock.WaitAsync();
            try
            {
                List<PendingCommandEvent> events = await ReadAllUnlocked();
                events.Add(pendingEvent);
                await WriteAllUnlocked(events);
            }
            finally
            {
                _fileLock.Release();
            }
        }

        private async Task<List<PendingCommandEvent>> ReadAllUnlocked()
        {
            if (!File.Exists(_filePath)) return new List<PendingCommandEvent>();

            try
            {
                string json = await File.ReadAllTextAsync(_filePath);
                if (string.IsNullOrWhiteSpace(json)) return new List<PendingCommandEvent>();

                return JsonSerializer.Deserialize<List<PendingCommandEvent>>(json) ?? new List<PendingCommandEvent>();
            }
            catch (Exception ex)
            {
                _logger.Error($"Unable to read command event outbox at {_filePath}", ex);
                return new List<PendingCommandEvent>();
            }
        }

        private async Task WriteAllUnlocked(IReadOnlyList<PendingCommandEvent> events)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(_filePath)!);

            if (events.Count == 0)
            {
                if (File.Exists(_filePath)) File.Delete(_filePath);
                return;
            }

            string tempPath = $"{_filePath}.tmp";
            string json = JsonSerializer.Serialize(events);
            await File.WriteAllTextAsync(tempPath, json);
            File.Move(tempPath, _filePath, overwrite: true);
        }
    }

    internal sealed class PendingCommandEvent
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public CommandEventType Type { get; set; }
        public string WorkerId { get; set; } = string.Empty;
        public string TransactionId { get; set; } = string.Empty;
        public long Sequence { get; set; }
        public string Stream { get; set; } = string.Empty;
        public string Text { get; set; } = string.Empty;
        public string EmittedAt { get; set; } = string.Empty;
        public string? Result { get; set; }
        public string? ErrorMessage { get; set; }
    }

    internal enum CommandEventType
    {
        OutputChunk,
        CommandResult,
        CommandRejected
    }
}
