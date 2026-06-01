using FirstDraft.Api.Auth;
using FirstDraft.Cli.Git;
using FirstDraft.Cli.Jira;
using FirstDraft.Configuration;
using FirstDraft.Infrastructure.Logging;
using System.Net.Http.Headers;
using System.Net.Http.Json;

namespace FirstDraft.Api.Hub
{
    internal sealed class WorkerRegistrationService
    {
        private readonly Log _logger;
        private readonly ApplicationData _applicationData;
        private readonly WorkerTokenManager _tokens;
        private readonly HttpClient _http = new HttpClient();

        public WorkerRegistrationService(
            Log logger,
            ApplicationData applicationData,
            WorkerTokenManager tokens)
        {
            _logger = logger;
            _applicationData = applicationData;
            _tokens = tokens;
        }

        public async Task RegisterAsync()
        {
            string[] appPaths = _applicationData.ApplicationPaths ?? Array.Empty<string>();
            string[] skills = WorkerSkillRegistry.ResolveAvailableSkills(_applicationData.Skills);
            string[] enabledTaskTypes = WorkerTaskTypeRegistry.ResolveEnabledTaskTypes(_applicationData.EnabledTaskTypes);
            GitRepositoryConfig[] gitRepositories = GitRepositoryConfigurationService.NormalizeRepositories(_applicationData.GitRepositories);
            object[] jiraIntegrations = JiraIntegrationConfigService.BuildRegistrationPayload(_applicationData);

            await PostJson("/api/worker-auth/register", new
            {
                workerId = _applicationData.WorkerId,
                paths = appPaths,
                skills,
                maxConcurrentTasks = WorkerApiSettings.GetMaxConcurrentTasks(_applicationData),
                enabledTaskTypes,
                gitRepositories,
                jiraIntegrations
            });

            string enabledTaskTypesParam = string.Join("|", enabledTaskTypes);
            _logger.Info("Worker registered with API");
            _logger.Info($"Max concurrent tasks: {WorkerApiSettings.FormatMaxConcurrentTasks(_applicationData)}");
            _logger.Info($"Enabled task types: {enabledTaskTypesParam}");
            _logger.Info($"Configured Git repositories: {gitRepositories.Length}");
            _logger.Info($"Configured Jira integrations: {jiraIntegrations.Length}");
        }

        public Task HeartbeatAsync()
        {
            return PostJson("/api/worker-auth/heartbeat", new { });
        }

        private async Task PostJson(string path, object body)
        {
            using HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, $"{_applicationData.ExternalAPI}{path}");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await _tokens.EnsureAccessTokenAsync());
            request.Content = JsonContent.Create(body);

            using HttpResponseMessage response = await _http.SendAsync(request);
            response.EnsureSuccessStatusCode();
        }
    }
}
