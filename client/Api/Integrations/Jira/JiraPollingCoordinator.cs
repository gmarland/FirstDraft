using FirstDraft.Api.Auth;
using FirstDraft.Api.Execution;
using FirstDraft.Api.Hub;
using FirstDraft.Cli.Git;
using FirstDraft.Cli.Jira;
using FirstDraft.Configuration;
using FirstDraft.Infrastructure.Logging;

namespace FirstDraft.Api.Integrations.Jira
{
    internal sealed class JiraPollingCoordinator
    {
        private readonly Log _logger;
        private readonly ApplicationData _applicationData;
        private readonly WorkerTokenManager _tokens;
        private readonly CommandExecutionRunner _commands;

        private JiraTicketPollingService? _jiraTicketPolling;

        public JiraPollingCoordinator(
            Log logger,
            ApplicationData applicationData,
            WorkerTokenManager tokens,
            CommandExecutionRunner commands)
        {
            _logger = logger;
            _applicationData = applicationData;
            _tokens = tokens;
            _commands = commands;
        }

        public void Start()
        {
            if (_jiraTicketPolling != null) return;

            int repositoryCount = GitRepositoryConfigurationService.NormalizeRepositories(_applicationData.GitRepositories).Length;
            int integrationCount = JiraIntegrationConfigService.BuildRegistrationPayload(_applicationData).Length;
            string maxConcurrentTasks = WorkerApiSettings.FormatMaxConcurrentTasks(_applicationData);
            string availableCapacity = _commands.AvailableCapacity.HasValue ? _commands.AvailableCapacity.Value.ToString() : "unlimited";
            _logger.Info($"Starting Jira ticket polling; interval: {JiraTicketPollingService.PollIntervalSeconds}s, configured integrations: {integrationCount}, configured Git repositories: {repositoryCount}, available capacity: {availableCapacity}/{maxConcurrentTasks}");

            _jiraTicketPolling = new JiraTicketPollingService(
                _logger,
                _applicationData,
                () => _tokens.EnsureAccessTokenAsync(),
                () =>
                {
                    if (_commands.AvailableCapacity.HasValue && _commands.AvailableCapacity.Value <= 0) return "no command capacity is available";
                    return null;
                },
                _commands.RunCommand);
            _jiraTicketPolling.Start();
        }

        public async Task Stop()
        {
            if (_jiraTicketPolling != null)
            {
                await _jiraTicketPolling.Stop();
                _jiraTicketPolling.Dispose();
                _jiraTicketPolling = null;
            }
        }
    }
}
