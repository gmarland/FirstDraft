using Microsoft.AspNetCore.SignalR.Client;
using FirstDraft.Api.Auth;
using FirstDraft.Api.Outbox;
using FirstDraft.Commands;
using FirstDraft.Configuration;
using FirstDraft.Infrastructure.Logging;
using System.Threading.Channels;

namespace FirstDraft.Api
{
    public class ApplicationAPI
    {
        private readonly Log _logger;

        private readonly ApplicationData _applicationData;

        private HubConnection? _apiHubConnection;

        private readonly WorkerTokenManager _tokens;

        private readonly ApiCommandTokenValidator _apiCommandTokens;

        private readonly CommandEventOutbox _commandEvents;

        private readonly CommandDispatcher _commandDispatcher;

        private readonly SemaphoreSlim _outboxFlushLock = new SemaphoreSlim(1, 1);

        private readonly SemaphoreSlim _commandCapacity;

        private bool _handshakeComplete = false;
        private bool _reconnect = false;

        public ApplicationAPI(Log log, ApplicationData applicationData, ApplicationDataService applicationDataService, CommandDispatcher commandDispatcher)
        {
            _logger = log;

            _applicationData = applicationData;

            _tokens = new WorkerTokenManager(applicationData, applicationDataService);

            _apiCommandTokens = new ApiCommandTokenValidator(applicationData);

            _commandEvents = new CommandEventOutbox(log, applicationData);

            _commandDispatcher = commandDispatcher;

            _commandCapacity = new SemaphoreSlim(GetMaxConcurrentTasks(applicationData), GetMaxConcurrentTasks(applicationData));
        }

        public async Task ConnectSignalR()
        {
            bool applicationDataValid = true;

            try
            {
                _applicationData.ValidateApplicationData();
            }
            catch (Exception ex)
            {
                _logger.Error(ex.Message);

                applicationDataValid = false;
            }

            if (applicationDataValid)
            {
                if (_apiHubConnection != null)
                {
                    try
                    {
                        await _apiHubConnection.StopAsync();
                    }
                    catch (Exception ex)
                    {
                        _logger.Error($"Error stopping connction to {_applicationData.GetRegisteredAddress()}", ex);
                    }

                    _apiHubConnection = null;
                }

                _apiHubConnection = new HubConnectionBuilder().WithUrl(_applicationData.ExternalAPI + $"/WorkerHub").Build();
                _apiHubConnection.ServerTimeout = TimeSpan.FromMinutes(2);
                _apiHubConnection.KeepAliveInterval = TimeSpan.FromSeconds(15);

                _apiHubConnection.Closed += async (error) =>
                {
                    if (_handshakeComplete)
                    {
                        _logger.Error("SignalR connection aborted", error);

                        await Task.Delay(1000);
                    }
                    else
                    {
                        _logger.Info($"Unable to register this client to {_applicationData.GetRegisteredAddress()}, waiting for it to become available");

                        await Task.Delay(5000);
                    }

                    if (_reconnect) await ConnectSignalR();
                };

                _apiHubConnection.On("ExecuteCommand", (string apiCommandToken, string transactionId, string command, string commandMode) =>
                {
                    _ = Task.Run(async () =>
                    {
                        try
                        {
                            await ExecuteCommand(apiCommandToken, transactionId, command, commandMode);
                        }
                        catch (Exception ex)
                        {
                            _logger.Error($"Unhandled error executing command {transactionId}", ex);
                        }
                    });

                    return Task.CompletedTask;
                });

                await Start();
            }
        }

        public async Task Start()
        {
            _reconnect = true;

            bool connected = false;

            try
            {
                _logger.Info($"Attempting to register this client as {_applicationData.GetRegisteredAddress()}");

                await _tokens.EnsureAccessTokenAsync();
                await _apiCommandTokens.EnsurePublicKeyAsync();

                await _apiHubConnection!.StartAsync();

                connected = true;
            }
            catch (Exception ex)
            {
                _logger.Info($"Error connecting {_applicationData.GetRegisteredAddress()}: {ex.Message}");
            }

            if (connected)
            {
                try
                {
                    _logger.Debug($"Connection ID: {_apiHubConnection!.ConnectionId}");

                    await _apiHubConnection.InvokeAsync<string>("Handshake", "1234");

                    string appPathsParam = ((_applicationData.ApplicationPaths != null) && (_applicationData.ApplicationPaths.Length > 0)) ? string.Join("|", _applicationData.ApplicationPaths) : string.Empty;
                    string skillsParam = string.Join("|", WorkerSkillRegistry.ResolveAvailableSkills(_applicationData.Skills));

                    await _apiHubConnection.InvokeAsync("Register", await _tokens.EnsureAccessTokenAsync(), _apiHubConnection.ConnectionId, _applicationData.WorkerId, appPathsParam, skillsParam, GetMaxConcurrentTasks(_applicationData));

                    _handshakeComplete = true;

                    _logger.Info("Connection made, worker registered");
                    _logger.Info($"Max concurrent tasks: {GetMaxConcurrentTasks(_applicationData)}");

                    await FlushPendingCommandEvents(waitForLock: true);
                }
                catch (Exception ex)
                {
                    _logger.Error("Error registering worker", ex);
                }
            }
            else
            {
                await Task.Delay(1000);

                await Start();
            }
        }

        public async Task Stop()
        {
            _reconnect = false;

            if (_apiHubConnection != null)
            {
                await _apiHubConnection.StopAsync();
            }
        }

        private static int GetMaxConcurrentTasks(ApplicationData applicationData)
        {
            return Math.Clamp(applicationData.MaxConcurrentTasks, 1, 8);
        }

        public async Task ExecuteCommand(string apiCommandToken, string transactionId, string command, string commandMode)
        {
            CommandTokenValidationResult tokenValidation = _apiCommandTokens.Validate(apiCommandToken, transactionId);
            if (tokenValidation == CommandTokenValidationResult.InvalidSignature)
            {
                await _apiCommandTokens.EnsurePublicKeyAsync(forceRefresh: true);
                tokenValidation = _apiCommandTokens.Validate(apiCommandToken, transactionId);
            }

            if (tokenValidation == CommandTokenValidationResult.Expired)
            {
                tokenValidation = await RefreshAndValidateCommandToken(transactionId);
            }

            if (tokenValidation != CommandTokenValidationResult.Valid)
            {
                string reason = $"invalid API command token ({tokenValidation})";
                _logger.Error($"Rejected command {transactionId}: {reason}");
                await RejectCommand(transactionId, reason);
                return;
            }

            await _commandCapacity.WaitAsync();

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
                await FlushPendingCommandEvents(waitForLock: true);
            }
            finally
            {
                _commandCapacity.Release();
            }
        }

        private async Task<CommandTokenValidationResult> RefreshAndValidateCommandToken(string transactionId)
        {
            try
            {
                _logger.Info($"API command token expired for {transactionId}, requesting replacement");
                string refreshedToken = await _apiHubConnection!.InvokeAsync<string>(
                    "RefreshCommandToken",
                    await _tokens.EnsureAccessTokenAsync(),
                    transactionId);

                CommandTokenValidationResult refreshedValidation = _apiCommandTokens.Validate(refreshedToken, transactionId);
                if (refreshedValidation == CommandTokenValidationResult.InvalidSignature)
                {
                    await _apiCommandTokens.EnsurePublicKeyAsync(forceRefresh: true);
                    refreshedValidation = _apiCommandTokens.Validate(refreshedToken, transactionId);
                }

                return refreshedValidation;
            }
            catch (Exception ex)
            {
                _logger.Error($"Unable to refresh API command token for {transactionId}", ex);
                return CommandTokenValidationResult.RefreshFailed;
            }
        }

        private async Task RejectCommand(string transactionId, string reason)
        {
            try
            {
                await _commandEvents.EnqueueCommandRejected(transactionId, reason);
                await FlushPendingCommandEvents(waitForLock: true);
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
                    _ = FlushPendingCommandEvents();
                }
                catch (Exception ex)
                {
                    _logger.Debug($"Error queueing command output for {transactionId}: {ex.Message}");
                }
            }
        }

        private async Task FlushPendingCommandEvents(bool waitForLock = false)
        {
            if (_apiHubConnection == null || _apiHubConnection.State != HubConnectionState.Connected) return;
            if (waitForLock)
            {
                await _outboxFlushLock.WaitAsync();
            }
            else if (!await _outboxFlushLock.WaitAsync(0))
            {
                return;
            }

            try
            {
                while (_apiHubConnection != null && _apiHubConnection.State == HubConnectionState.Connected)
                {
                    IReadOnlyList<PendingCommandEvent> events = await _commandEvents.ReadAll();
                    if (events.Count == 0) return;

                    List<string> deliveredEventIds = new List<string>();
                    foreach (PendingCommandEvent pendingEvent in events)
                    {
                        if (_apiHubConnection == null || _apiHubConnection.State != HubConnectionState.Connected) break;

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
                _outboxFlushLock.Release();
            }
        }

        private async Task SendPendingCommandEvent(PendingCommandEvent pendingEvent)
        {
            string accessToken = await _tokens.EnsureAccessTokenAsync();

            if (pendingEvent.Type == CommandEventType.OutputChunk)
            {
                await _apiHubConnection!.InvokeAsync(
                    "CommandOutputChunk",
                    accessToken,
                    pendingEvent.TransactionId,
                    pendingEvent.Sequence,
                    pendingEvent.Stream,
                    pendingEvent.Text,
                    pendingEvent.EmittedAt);
                return;
            }

            if (pendingEvent.Type == CommandEventType.CommandResult)
            {
                await _apiHubConnection!.InvokeAsync(
                    "ExecuteCommandResult",
                    accessToken,
                    pendingEvent.TransactionId,
                    pendingEvent.Result,
                    pendingEvent.ErrorMessage);
                return;
            }

            if (pendingEvent.Type == CommandEventType.CommandRejected)
            {
                await _apiHubConnection!.InvokeAsync(
                    "RejectCommand",
                    accessToken,
                    pendingEvent.TransactionId,
                    pendingEvent.ErrorMessage ?? "worker rejected command");
                return;
            }

            throw new InvalidOperationException($"Unsupported pending command event type: {pendingEvent.Type}");
        }
    }
}
