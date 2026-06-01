using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using FirstDraft.Cli.Git;
using FirstDraft.Configuration;
using FirstDraft.Infrastructure.Logging;
using Newtonsoft.Json;
using Newtonsoft.Json.Linq;

namespace FirstDraft.Cli.Jira
{
    internal sealed class JiraTicketPollingService : IDisposable
    {
        public const int PollIntervalSeconds = 60;
        private const int MaxIssuesPerIntegration = 25;
        private const int MaxImageAttachments = 5;
        private const long MaxImageAttachmentBytes = 10 * 1024 * 1024;
        private const long MaxImageAttachmentTotalBytes = 25 * 1024 * 1024;

        private static readonly HashSet<string> SupportedImageMimeTypes = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "image/png",
            "image/jpeg",
            "image/jpg",
            "image/gif",
            "image/webp"
        };

        private readonly Log _logger;
        private readonly ApplicationData _applicationData;
        private readonly Func<Task<string>> _getWorkerAccessToken;
        private readonly Func<string?> _getClaimBlockReason;
        private readonly Func<string, string, string, Task> _executeClaimedCommand;
        private readonly HttpClient _http = new HttpClient();
        private CancellationTokenSource? _cancellation;
        private Task? _runTask;

        public JiraTicketPollingService(
            Log logger,
            ApplicationData applicationData,
            Func<Task<string>> getWorkerAccessToken,
            Func<string?> getClaimBlockReason,
            Func<string, string, string, Task> executeClaimedCommand)
        {
            _logger = logger;
            _applicationData = applicationData;
            _getWorkerAccessToken = getWorkerAccessToken;
            _getClaimBlockReason = getClaimBlockReason;
            _executeClaimedCommand = executeClaimedCommand;
        }

        public void Start()
        {
            if (_runTask != null) return;

            _cancellation = new CancellationTokenSource();
            _runTask = Task.Run(() => Run(_cancellation.Token));
        }

        public async Task Stop()
        {
            if (_cancellation == null || _runTask == null) return;

            _cancellation.Cancel();
            try
            {
                await _runTask;
            }
            catch (OperationCanceledException)
            {
            }
            finally
            {
                _cancellation.Dispose();
                _cancellation = null;
                _runTask = null;
            }
        }

        private async Task Run(CancellationToken cancellationToken)
        {
            _logger.Info($"Jira ticket polling loop started; interval: {PollIntervalSeconds}s");

            try
            {
                while (!cancellationToken.IsCancellationRequested)
                {
                    try
                    {
                        await PollOnce(cancellationToken);
                    }
                    catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
                    {
                        throw;
                    }
                    catch (Exception ex)
                    {
                        _logger.Error("Error polling Jira tickets", ex);
                    }

                    await Task.Delay(TimeSpan.FromSeconds(PollIntervalSeconds), cancellationToken);
                }
            }
            finally
            {
                _logger.Info("Jira ticket polling loop stopped");
            }
        }

        private async Task PollOnce(CancellationToken cancellationToken)
        {
            _logger.Debug("Jira ticket polling tick");

            string? claimBlockReason = _getClaimBlockReason();
            if (claimBlockReason != null)
            {
                _logger.Debug($"Skipping Jira ticket polling: {claimBlockReason}");
                return;
            }

            string[] enabledTaskTypes = WorkerTaskTypeRegistry.ResolveEnabledTaskTypes(_applicationData.EnabledTaskTypes);
            if (!enabledTaskTypes.Contains("gitflow", StringComparer.OrdinalIgnoreCase))
            {
                _logger.Debug("Skipping Jira ticket polling: gitflow task type is disabled");
                return;
            }

            string[] availableSkills = WorkerSkillRegistry.ResolveAvailableSkills(_applicationData.Skills);
            if (!availableSkills.Contains("git", StringComparer.OrdinalIgnoreCase))
            {
                _logger.Debug("Skipping Jira ticket polling: git skill is not available");
                return;
            }

            JiraIntegrationConfig[] integrations = ResolvePollableIntegrations();
            if (integrations.Length == 0)
            {
                _logger.Debug("Skipping Jira ticket polling: no enabled and valid Jira integrations are configured");
                return;
            }

            GitRepositoryConfig[] repositories = GitRepositoryConfigurationService.NormalizeRepositories(_applicationData.GitRepositories);
            if (repositories.Length == 0)
            {
                _logger.Debug("Skipping Jira ticket polling: no Git repositories are configured");
                return;
            }

            foreach (JiraIntegrationConfig integration in integrations)
            {
                claimBlockReason = _getClaimBlockReason();
                if (claimBlockReason != null)
                {
                    _logger.Debug($"Stopping Jira ticket polling tick: {claimBlockReason}");
                    return;
                }
                if (cancellationToken.IsCancellationRequested) return;
                await PollIntegration(integration, repositories, cancellationToken);
            }
        }

        private async Task PollIntegration(JiraIntegrationConfig integration, GitRepositoryConfig[] repositories, CancellationToken cancellationToken)
        {
            using JiraCliClient jira = new JiraCliClient(integration.SiteUrl, integration.Email, integration.GetApiToken(_applicationData));
            string[] repositoryFieldKeys = await ResolveRepositoryFieldKeys(jira, cancellationToken);
            string[] fields = new[] { "summary", "status", "description", "attachment", "repository" }
                .Concat(repositoryFieldKeys)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();
            string jql = BuildReadyJql(integration);

            _logger.Info($"Polling Jira integration {integration.IntegrationId} ({integration.SiteUrl}) with JQL: {jql}");
            JiraIssueSummary[] issues = await jira.SearchIssues(jql, MaxIssuesPerIntegration, fields, cancellationToken);
            _logger.Info($"Jira integration {integration.IntegrationId} returned {issues.Length} ready issue(s)");

            foreach (JiraIssueSummary issue in issues)
            {
                cancellationToken.ThrowIfCancellationRequested();
                string? claimBlockReason = _getClaimBlockReason();
                if (claimBlockReason != null)
                {
                    _logger.Debug($"Stopping Jira issue processing before {issue.Key}: {claimBlockReason}");
                    return;
                }

                string? repositoryUrl = ReadRepositoryField(issue, new[] { "repository" }.Concat(repositoryFieldKeys));
                if (string.IsNullOrWhiteSpace(repositoryUrl))
                {
                    _logger.Debug($"Skipping Jira issue {issue.Key}: no repository field value found");
                    continue;
                }

                string normalizedRepositoryUrl = GitRepositoryConfigurationService.NormalizeRepositoryUrl(repositoryUrl);
                GitRepositoryConfig? repository = repositories.FirstOrDefault(candidate =>
                    string.Equals(candidate.NormalizedRepositoryUrl, normalizedRepositoryUrl, StringComparison.OrdinalIgnoreCase));
                if (repository == null)
                {
                    _logger.Debug($"Skipping Jira issue {issue.Key}: repository {normalizedRepositoryUrl} is not configured for this worker");
                    continue;
                }

                string issueUrl = BuildIssueUrl(integration.SiteUrl, issue.Key);
                JiraAttachmentMetadata[] imageAttachments = ReadImageAttachments(issue).ToArray();
                string claimCommand = BuildGitflowCommand(repository, issue, issueUrl, Array.Empty<GitflowAttachmentClaim>());
                JiraClaimResponse? claim = await ClaimTicket(
                    integration,
                    issue,
                    issueUrl,
                    repository,
                    normalizedRepositoryUrl,
                    claimCommand,
                    imageAttachments,
                    cancellationToken);

                if (claim == null || !claim.Claimed || string.IsNullOrWhiteSpace(claim.TransactionId))
                {
                    if (claim == null)
                    {
                        _logger.Debug($"Skipping Jira issue {issue.Key}: claim failed");
                    }
                    else if (!claim.Claimed)
                    {
                        if (claim.Event == null)
                        {
                            string reason = string.IsNullOrWhiteSpace(claim.Reason) ? "claim rejected by API" : claim.Reason;
                            _logger.Info($"Skipping Jira issue {issue.Key}: {reason}");
                        }
                        else
                        {
                            string existingClaim = $"existing active claim {claim.Event.TransactionId ?? "without transaction"} for worker {claim.Event.WorkerId ?? "unknown"} with status {claim.Event.Status ?? "unknown"}";
                            _logger.Info($"Skipping Jira issue {issue.Key}: already claimed ({existingClaim})");
                        }
                    }
                    else
                    {
                        _logger.Debug($"Skipping Jira issue {issue.Key}: claim response did not include a transaction ID");
                    }

                    continue;
                }

                GitflowAttachmentClaim[] executionAttachments = imageAttachments
                    .Select(attachment => new GitflowAttachmentClaim(
                        attachment.Id,
                        attachment.Filename,
                        attachment.MimeType,
                        attachment.Size,
                        integration.IntegrationId,
                        attachment.ContentUrl))
                    .ToArray();
                string executionCommand = BuildGitflowCommand(repository, issue, issueUrl, executionAttachments);

                _logger.Info($"Claimed Jira issue {issue.Key}; dispatching gitflow command {claim.TransactionId}");
                _ = Task.Run(async () =>
                {
                    try
                    {
                        await _executeClaimedCommand(claim.TransactionId, executionCommand, "gitflow");
                    }
                    catch (Exception ex)
                    {
                        _logger.Error($"Unhandled error executing claimed Jira ticket {issue.Key}", ex);
                    }
                }, cancellationToken);
            }
        }

        private JiraIntegrationConfig[] ResolvePollableIntegrations()
        {
            List<JiraIntegrationConfig> integrations = new List<JiraIntegrationConfig>();
            foreach (JiraIntegrationConfig integration in JiraIntegrationConfigService.NormalizeIntegrations(_applicationData.JiraIntegrations))
            {
                if (!integration.Enabled)
                {
                    _logger.Debug($"Skipping Jira integration {integration.IntegrationId}: integration is disabled");
                    continue;
                }

                string? validationError = JiraIntegrationConfigService.ValidateIntegration(_applicationData, integration);
                if (validationError != null)
                {
                    _logger.Debug($"Skipping Jira integration {integration.IntegrationId}: {validationError}");
                    continue;
                }

                integrations.Add(integration);
            }

            return integrations.ToArray();
        }

        private async Task<JiraClaimResponse?> ClaimTicket(
            JiraIntegrationConfig integration,
            JiraIssueSummary issue,
            string issueUrl,
            GitRepositoryConfig repository,
            string normalizedRepositoryUrl,
            string command,
            JiraAttachmentMetadata[] imageAttachments,
            CancellationToken cancellationToken)
        {
            using HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, $"{_applicationData.ExternalAPI}/api/worker-auth/tasks/start");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await _getWorkerAccessToken());
            request.Content = JsonContent.Create(new
            {
                provider = "jira",
                integrationId = integration.IntegrationId,
                sourceItemId = issue.Id,
                sourceItemKey = issue.Key,
                sourceItemUrl = issueUrl,
                repositoryUrl = repository.RepositoryUrl,
                normalizedRepositoryUrl,
                command,
                commandMode = "gitflow",
                metadata = new
                {
                    issueId = issue.Id,
                    issueKey = issue.Key,
                    imageAttachments
                }
            });

            using HttpResponseMessage response = await _http.SendAsync(request, cancellationToken);
            string body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (response.StatusCode == HttpStatusCode.Conflict)
            {
                try
                {
                    return JsonConvert.DeserializeObject<JiraClaimResponse>(body) ?? new JiraClaimResponse { Claimed = false };
                }
                catch
                {
                    _logger.Debug($"Jira claim for {issue.Key} returned an unreadable conflict response: {body}");
                    return new JiraClaimResponse { Claimed = false };
                }
            }

            if (!response.IsSuccessStatusCode)
            {
                _logger.Debug($"Jira claim for {issue.Key} failed with {(int)response.StatusCode}: {body}");
                return null;
            }

            return JsonConvert.DeserializeObject<JiraClaimResponse>(body);
        }

        private static async Task<string[]> ResolveRepositoryFieldKeys(JiraCliClient jira, CancellationToken cancellationToken)
        {
            try
            {
                JiraFieldOption[] fields = await jira.FindFields("repository", cancellationToken);
                return fields
                    .SelectMany(field => new[] { field.Id, field.Key })
                    .Where(field => !string.IsNullOrWhiteSpace(field))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToArray();
            }
            catch
            {
                return Array.Empty<string>();
            }
        }

        private static string BuildReadyJql(JiraIntegrationConfig integration)
        {
            string status = EscapeJqlString(integration.ReadyStatusName);
            if (integration.BoardFilterId.HasValue)
            {
                return $"filter = {integration.BoardFilterId.Value} AND status = \"{status}\" ORDER BY updated ASC";
            }

            return $"status = \"{status}\" ORDER BY updated ASC";
        }

        private static string EscapeJqlString(string value)
        {
            return value.Replace("\\", "\\\\").Replace("\"", "\\\"");
        }

        private static string? ReadRepositoryField(JiraIssueSummary issue, IEnumerable<string> repositoryFieldKeys)
        {
            foreach (string fieldKey in repositoryFieldKeys)
            {
                JToken? value = issue.Fields[fieldKey];
                string? repositoryUrl = ReadRepositoryFieldValue(value);
                if (!string.IsNullOrWhiteSpace(repositoryUrl)) return repositoryUrl;
            }

            return null;
        }

        private static string? ReadRepositoryFieldValue(JToken? value)
        {
            if (value == null || value.Type == JTokenType.Null) return null;
            if (value.Type == JTokenType.String) return value.Value<string>()?.Trim();
            if (value is JArray array)
            {
                foreach (JToken item in array)
                {
                    string? repositoryUrl = ReadRepositoryFieldValue(item);
                    if (!string.IsNullOrWhiteSpace(repositoryUrl)) return repositoryUrl;
                }
            }
            if (value is JObject obj)
            {
                string? namedValue = obj.Value<string>("value") ?? obj.Value<string>("name");
                if (!string.IsNullOrWhiteSpace(namedValue)) return namedValue.Trim();
            }

            return null;
        }

        private static string BuildGitflowCommand(GitRepositoryConfig repository, JiraIssueSummary issue, string issueUrl, IReadOnlyList<GitflowAttachmentClaim> attachments)
        {
            JObject payload = new JObject
            {
                ["repositoryUrl"] = repository.RepositoryUrl,
                ["sourceBranch"] = repository.SourceBranch,
                ["targetBranch"] = repository.TargetBranch,
                ["ticketNumber"] = issue.Key,
                ["ticketUrl"] = issueUrl,
                ["title"] = issue.Fields.Value<string>("summary") ?? string.Empty,
                ["description"] = ReadJiraText(issue.Fields["description"])
            };

            if (attachments.Count > 0)
            {
                payload["attachments"] = JArray.FromObject(attachments);
            }

            return payload.ToString(Formatting.None);
        }

        private static string ReadJiraText(JToken? value)
        {
            if (value == null || value.Type == JTokenType.Null) return string.Empty;
            if (value.Type == JTokenType.String) return value.Value<string>()?.Trim() ?? string.Empty;
            if (value is JArray array)
            {
                return string.Join("\n", array.Select(ReadJiraText).Where(text => !string.IsNullOrWhiteSpace(text)));
            }
            if (value is JObject obj)
            {
                string text = obj.Value<string>("text")?.Trim() ?? string.Empty;
                string content = ReadJiraText(obj["content"]);
                return string.Join("\n", new[] { text, content }.Where(part => !string.IsNullOrWhiteSpace(part)));
            }

            return string.Empty;
        }

        private static IEnumerable<JiraAttachmentMetadata> ReadImageAttachments(JiraIssueSummary issue)
        {
            if (issue.Fields["attachment"] is not JArray attachments) yield break;

            long totalBytes = 0;
            int count = 0;
            foreach (JObject attachment in attachments.OfType<JObject>())
            {
                string id = attachment.Value<string>("id") ?? string.Empty;
                string filename = attachment.Value<string>("filename") ?? string.Empty;
                string mimeType = attachment.Value<string>("mimeType") ?? string.Empty;
                string contentUrl = attachment.Value<string>("content") ?? string.Empty;
                long? size = attachment.Value<long?>("size");
                if (string.IsNullOrWhiteSpace(id) ||
                    string.IsNullOrWhiteSpace(filename) ||
                    string.IsNullOrWhiteSpace(mimeType) ||
                    string.IsNullOrWhiteSpace(contentUrl) ||
                    !SupportedImageMimeTypes.Contains(mimeType))
                {
                    continue;
                }

                long attachmentBytes = size ?? 0;
                if (attachmentBytes > MaxImageAttachmentBytes) continue;
                if (totalBytes + attachmentBytes > MaxImageAttachmentTotalBytes) yield break;

                totalBytes += attachmentBytes;
                count++;
                yield return new JiraAttachmentMetadata(id, filename, mimeType, size, contentUrl);
                if (count >= MaxImageAttachments) yield break;
            }
        }

        private static string BuildIssueUrl(string siteUrl, string issueKey)
        {
            return $"{JiraIntegrationConfigService.CleanSiteUrl(siteUrl)}/browse/{Uri.EscapeDataString(issueKey)}";
        }

        public void Dispose()
        {
            _http.Dispose();
            _cancellation?.Dispose();
        }

        private sealed class JiraClaimResponse
        {
            public bool Claimed { get; set; }
            public string? TransactionId { get; set; }
            public string? EventId { get; set; }
            public string? Reason { get; set; }
            public JiraClaimEvent? Event { get; set; }
        }

        private sealed class JiraClaimEvent
        {
            public string? WorkerId { get; set; }
            public string? TransactionId { get; set; }
            public string? Status { get; set; }
        }

        private sealed record JiraAttachmentMetadata(string Id, string Filename, string MimeType, long? Size, string ContentUrl);

        private sealed record GitflowAttachmentClaim(string Id, string Filename, string MimeType, long? Size, string IntegrationId, string ContentUrl);
    }
}
