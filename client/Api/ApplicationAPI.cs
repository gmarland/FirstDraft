using FirstDraft.Api.Auth;
using FirstDraft.Api.Execution;
using FirstDraft.Api.Hub;
using FirstDraft.Api.Integrations.Jira;
using FirstDraft.Api.Outbox;
using FirstDraft.Commands;
using FirstDraft.Configuration;
using FirstDraft.Infrastructure.Logging;

namespace FirstDraft.Api
{
    public class ApplicationAPI
    {
        private readonly Log _logger;
        private readonly ApplicationData _applicationData;
        private readonly WorkerTokenManager _tokens;
        private readonly WorkerRegistrationService _registration;
        private readonly CommandEventFlusher _commandEventFlusher;
        private readonly CommandExecutionRunner _commands;
        private readonly JiraPollingCoordinator _jiraPolling;
        private CancellationTokenSource? _heartbeatCancellation;
        private Task? _heartbeatTask;

        public ApplicationAPI(Log log, ApplicationData applicationData, ApplicationDataService applicationDataService, CommandDispatcher commandDispatcher)
        {
            _logger = log;
            _applicationData = applicationData;
            _tokens = new WorkerTokenManager(applicationData, applicationDataService);

            CommandEventOutbox commandEvents = new CommandEventOutbox(log, applicationData);
            _commandEventFlusher = new CommandEventFlusher(log, applicationData, _tokens, commandEvents);
            _commands = new CommandExecutionRunner(log, applicationData, _tokens, commandEvents, _commandEventFlusher, commandDispatcher);
            _registration = new WorkerRegistrationService(log, applicationData, _tokens);
            _jiraPolling = new JiraPollingCoordinator(log, applicationData, _tokens, _commands);
        }

        public async Task Connect()
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

            if (!applicationDataValid) return;

            await Start();
        }

        public async Task Start()
        {
            bool connected = false;
            bool reauthenticationRequired = false;

            try
            {
                _logger.Info($"Attempting to register this client as {_applicationData.GetRegisteredAddress()}");

                await _tokens.EnsureAccessTokenAsync();
                await _registration.RegisterAsync();
                await _commandEventFlusher.FlushPendingCommandEvents(waitForLock: true);

                connected = true;
            }
            catch (WorkerAuthenticationException ex)
            {
                reauthenticationRequired = ex.ReauthenticationRequired;
                _logger.Error($"Worker authentication failed: {ex.Message}");
            }
            catch (Exception ex)
            {
                _logger.Info($"Error connecting {_applicationData.GetRegisteredAddress()}: {ex.Message}");
            }

            if (connected)
            {
                try
                {
                    StartHeartbeat();
                    _jiraPolling.Start();
                }
                catch (Exception ex)
                {
                    _logger.Error("Error registering worker", ex);
                }
            }
            else
            {
                await Task.Delay(reauthenticationRequired ? 30000 : 1000);
                await Start();
            }
        }

        public async Task Stop()
        {
            await _jiraPolling.Stop();
            await StopHeartbeat();
        }

        public Task ExecuteClaimedCommand(string transactionId, string command, string commandMode)
        {
            return _commands.RunCommand(transactionId, command, commandMode);
        }

        private void StartHeartbeat()
        {
            if (_heartbeatTask != null) return;

            _heartbeatCancellation = new CancellationTokenSource();
            _heartbeatTask = Task.Run(() => RunHeartbeat(_heartbeatCancellation.Token));
        }

        private async Task StopHeartbeat()
        {
            if (_heartbeatCancellation == null || _heartbeatTask == null) return;

            _heartbeatCancellation.Cancel();
            try
            {
                await _heartbeatTask;
            }
            catch (OperationCanceledException)
            {
            }
            finally
            {
                _heartbeatCancellation.Dispose();
                _heartbeatCancellation = null;
                _heartbeatTask = null;
            }
        }

        private async Task RunHeartbeat(CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    await _registration.HeartbeatAsync();
                    await _commandEventFlusher.FlushPendingCommandEvents();
                }
                catch (Exception ex)
                {
                    _logger.Debug($"Worker heartbeat failed: {ex.Message}");
                }

                await Task.Delay(TimeSpan.FromSeconds(30), cancellationToken);
            }
        }
    }
}
