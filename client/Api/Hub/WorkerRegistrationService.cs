using FirstDraft.Api.Contracts;
using FirstDraft.Api.Auth;
using FirstDraft.Cli.Git;
using FirstDraft.Cli.Jira;
using FirstDraft.Configuration;
using FirstDraft.Infrastructure.Logging;
using Newtonsoft.Json;

namespace FirstDraft.Api.Hub
{
    internal sealed class WorkerRegistrationService
    {
        private readonly Log _logger;
        private readonly ApplicationData _applicationData;
        private readonly WorkerTokenManager _tokens;
        private readonly WorkerHubConnection _hub;

        public WorkerRegistrationService(
            Log logger,
            ApplicationData applicationData,
            WorkerTokenManager tokens,
            WorkerHubConnection hub)
        {
            _logger = logger;
            _applicationData = applicationData;
            _tokens = tokens;
            _hub = hub;
        }

        public async Task RegisterAsync()
        {
            _logger.Debug($"Connection ID: {_hub.ConnectionId}");

            await _hub.InvokeAsync<string>(WorkerHubContract.ServerMethods.Handshake, "1234");

            string appPathsParam = ((_applicationData.ApplicationPaths != null) && (_applicationData.ApplicationPaths.Length > 0)) ? string.Join("|", _applicationData.ApplicationPaths) : string.Empty;
            string skillsParam = string.Join("|", WorkerSkillRegistry.ResolveAvailableSkills(_applicationData.Skills));
            string enabledTaskTypesParam = string.Join("|", WorkerTaskTypeRegistry.ResolveEnabledTaskTypes(_applicationData.EnabledTaskTypes));
            string gitRepositoriesParam = JsonConvert.SerializeObject(GitRepositoryConfigurationService.NormalizeRepositories(_applicationData.GitRepositories));
            string jiraIntegrationsParam = JsonConvert.SerializeObject(JiraIntegrationConfigService.BuildRegistrationPayload(_applicationData));

            object?[] registerArguments = new object?[WorkerHubContract.RegisterArguments.JiraIntegrations + 1];
            registerArguments[WorkerHubContract.RegisterArguments.AccessToken] = await _tokens.EnsureAccessTokenAsync();
            registerArguments[WorkerHubContract.RegisterArguments.ConnectionId] = _hub.ConnectionId;
            registerArguments[WorkerHubContract.RegisterArguments.WorkerId] = _applicationData.WorkerId;
            registerArguments[WorkerHubContract.RegisterArguments.Paths] = appPathsParam;
            registerArguments[WorkerHubContract.RegisterArguments.Skills] = skillsParam;
            registerArguments[WorkerHubContract.RegisterArguments.MaxConcurrentTasks] = WorkerApiSettings.GetMaxConcurrentTasks(_applicationData);
            registerArguments[WorkerHubContract.RegisterArguments.EnabledTaskTypes] = enabledTaskTypesParam;
            registerArguments[WorkerHubContract.RegisterArguments.GitRepositories] = gitRepositoriesParam;
            registerArguments[WorkerHubContract.RegisterArguments.JiraIntegrations] = jiraIntegrationsParam;

            await _hub.InvokeAsync(WorkerHubContract.ServerMethods.Register, registerArguments);

            _hub.HandshakeComplete = true;

            _logger.Info("Connection made, worker registered");
            _logger.Info($"Max concurrent tasks: {WorkerApiSettings.GetMaxConcurrentTasks(_applicationData)}");
            _logger.Info($"Enabled task types: {enabledTaskTypesParam}");
            _logger.Info($"Configured Git repositories: {GitRepositoryConfigurationService.NormalizeRepositories(_applicationData.GitRepositories).Length}");
            _logger.Info($"Configured Jira integrations: {JiraIntegrationConfigService.BuildRegistrationPayload(_applicationData).Length}");
        }
    }
}
