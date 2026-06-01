using FirstDraft.Api.Contracts;
using Microsoft.AspNetCore.SignalR.Client;
using FirstDraft.Configuration;
using FirstDraft.Infrastructure.Logging;

namespace FirstDraft.Api
{
    internal sealed class WorkerHubConnection
    {
        private readonly Log _logger;
        private readonly ApplicationData _applicationData;

        private HubConnection? _connection;

        public WorkerHubConnection(Log logger, ApplicationData applicationData)
        {
            _logger = logger;
            _applicationData = applicationData;
        }

        public string? ConnectionId => _connection?.ConnectionId;

        public bool HandshakeComplete { get; set; }

        public bool Reconnect { get; set; }

        public bool IsConnected => _connection?.State == HubConnectionState.Connected;

        public async Task RebuildAsync(
            Func<Task> reconnectAsync,
            Func<string, string, string, string, Task> executeCommandAsync)
        {
            if (_connection != null)
            {
                try
                {
                    await _connection.StopAsync();
                }
                catch (Exception ex)
                {
                    _logger.Error($"Error stopping connction to {_applicationData.GetRegisteredAddress()}", ex);
                }

                _connection = null;
            }

            _connection = new HubConnectionBuilder().WithUrl(_applicationData.ExternalAPI + WorkerHubContract.HubPath).Build();
            _connection.ServerTimeout = TimeSpan.FromMinutes(2);
            _connection.KeepAliveInterval = TimeSpan.FromSeconds(15);

            _connection.Closed += async (error) =>
            {
                if (HandshakeComplete)
                {
                    _logger.Error("SignalR connection aborted", error);
                    await Task.Delay(1000);
                }
                else
                {
                    _logger.Info($"Unable to register this client to {_applicationData.GetRegisteredAddress()}, waiting for it to become available");
                    await Task.Delay(5000);
                }

                if (Reconnect) await reconnectAsync();
            };

            _connection.On(WorkerHubContract.ClientMethods.ExecuteCommand, (string apiCommandToken, string transactionId, string command, string commandMode) =>
            {
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await executeCommandAsync(apiCommandToken, transactionId, command, commandMode);
                    }
                    catch (Exception ex)
                    {
                        _logger.Error($"Unhandled error executing command {transactionId}", ex);
                    }
                });

                return Task.CompletedTask;
            });
        }

        public Task StartAsync()
        {
            return _connection!.StartAsync();
        }

        public async Task StopAsync()
        {
            if (_connection != null)
            {
                await _connection.StopAsync();
            }
        }

        public Task InvokeAsync(string methodName, params object?[] args)
        {
            return _connection!.InvokeCoreAsync(methodName, args);
        }

        public Task<T> InvokeAsync<T>(string methodName, params object?[] args)
        {
            return _connection!.InvokeCoreAsync<T>(methodName, args);
        }
    }
}
