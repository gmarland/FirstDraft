using FirstDraft.Api.Contracts;
using FirstDraft.Api.Auth;
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
        private readonly ApiCommandTokenValidator _apiCommandTokens;
        private readonly WorkerHubConnection _hub;
        private readonly WorkerRegistrationService _registration;
        private readonly CommandEventFlusher _commandEventFlusher;
        private readonly CommandExecutionRunner _commands;
        private readonly JiraPollingCoordinator _jiraPolling;

        public ApplicationAPI(Log log, ApplicationData applicationData, ApplicationDataService applicationDataService, CommandDispatcher commandDispatcher)
        {
            _logger = log;
            _applicationData = applicationData;
            _tokens = new WorkerTokenManager(applicationData, applicationDataService);
            _apiCommandTokens = new ApiCommandTokenValidator(applicationData);

            CommandEventOutbox commandEvents = new CommandEventOutbox(log, applicationData);
            _hub = new WorkerHubConnection(log, applicationData);
            _commandEventFlusher = new CommandEventFlusher(log, _tokens, commandEvents, _hub);
            _commands = new CommandExecutionRunner(log, applicationData, _tokens, commandEvents, _commandEventFlusher, commandDispatcher);
            _registration = new WorkerRegistrationService(log, applicationData, _tokens, _hub);
            _jiraPolling = new JiraPollingCoordinator(log, applicationData, _tokens, _hub, _commands);
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

            if (!applicationDataValid) return;

            await _hub.RebuildAsync(ConnectSignalR, ExecuteCommand);
            await Start();
        }

        public async Task Start()
        {
            _hub.Reconnect = true;

            bool connected = false;
            bool reauthenticationRequired = false;

            try
            {
                _logger.Info($"Attempting to register this client as {_applicationData.GetRegisteredAddress()}");

                await _tokens.EnsureAccessTokenAsync();
                await _apiCommandTokens.EnsurePublicKeyAsync();

                await _hub.StartAsync();

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
                    await _registration.RegisterAsync();
                    await _commandEventFlusher.FlushPendingCommandEvents(waitForLock: true);
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
            _hub.Reconnect = false;

            await _jiraPolling.Stop();
            await _hub.StopAsync();
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
                await _commands.RejectCommand(transactionId, reason);
                return;
            }

            await _commands.RunCommand(transactionId, command, commandMode);
        }

        public Task ExecuteClaimedCommand(string transactionId, string command, string commandMode)
        {
            return _commands.RunCommand(transactionId, command, commandMode);
        }

        private async Task<CommandTokenValidationResult> RefreshAndValidateCommandToken(string transactionId)
        {
            try
            {
                _logger.Info($"API command token expired for {transactionId}, requesting replacement");
                object?[] refreshArguments = new object?[WorkerHubContract.RefreshCommandTokenArguments.TransactionId + 1];
                refreshArguments[WorkerHubContract.RefreshCommandTokenArguments.AccessToken] = await _tokens.EnsureAccessTokenAsync();
                refreshArguments[WorkerHubContract.RefreshCommandTokenArguments.TransactionId] = transactionId;

                string refreshedToken = await _hub.InvokeAsync<string>(
                    WorkerHubContract.ServerMethods.RefreshCommandToken,
                    refreshArguments);

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
    }
}
