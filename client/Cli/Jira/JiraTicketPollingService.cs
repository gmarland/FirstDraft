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
        private const int PollIntervalSeconds = 60;
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
        private readonly Func<bool> _canClaimWork;
        private readonly Func<string, string, string, Task> _executeClaimedCommand;
        private readonly HttpClient _http = new HttpClient();
        private CancellationTokenSource? _cancellation;
        private Task? _runTask;

        public JiraTicketPollingService(
            Log logger,
            ApplicationData applicationData,
            Func<Task<string>> getWorkerAccessToken,
            Func<bool> canClaimWork,
            Func<string, string, string, Task> executeClaimedCommand)
        {
            _logger = logger;
            _applicationData = applicationData;
            _getWorkerAccessToken = getWorkerAccessToken;
            _canClaimWork = canClaimWork;
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

        private async Task PollOnce(CancellationToken cancellationToken)
        {
            if (!_canClaimWork()) return;
            if (!WorkerTaskTypeRegistry.ResolveEnabledTaskTypes(_applicationData.EnabledTaskTypes).Contains("gitflow", StringComparer.OrdinalIgnoreCase)) return;
            if (!WorkerSkillRegistry.ResolveAvailableSkills(_applicationData.Skills).Contains("git", StringComparer.OrdinalIgnoreCase)) return;

            JiraIntegrationConfig[] integrations = JiraIntegrationConfigService.NormalizeIntegrations(_applicationData.JiraIntegrations)
                .Where(integration => integration.Enabled && JiraIntegrationConfigService.ValidateIntegration(_applicationData, integration) == null)
                .ToArray();
            if (integrations.Length == 0) return;

            GitRepositoryConfig[] repositories = GitRepositoryConfigurationService.NormalizeRepositories(_applicationData.GitRepositories);
            if (repositories.Length == 0) return;

            foreach (JiraIntegrationConfig integration in integrations)
            {
                if (!_canClaimWork() || cancellationToken.IsCancellationRequested) return;
                await PollIntegration(integration, repositories, cancellationToken);
            }
        }

        private async Task PollIntegration(JiraIntegrationConfig integration, GitRepositoryConfig[] repositories, CancellationToken cancellationToken)
        {
            using JiraCliClient jira = new JiraCliClient(integration.SiteUrl, integration.Email, integration.GetApiToken(_applicationData));
            string[] repositoryFieldKeys = await ResolveRepositoryFieldKeys(jira);
            string[] fields = new[] { "summary", "status", "description", "attachment", "repository" }
                .Concat(repositoryFieldKeys)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();
            JiraIssueSummary[] issues = await jira.SearchIssues(BuildReadyJql(integration), MaxIssuesPerIntegration, fields);

            foreach (JiraIssueSummary issue in issues)
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (!_canClaimWork()) return;

                string? repositoryUrl = ReadRepositoryField(issue, new[] { "repository" }.Concat(repositoryFieldKeys));
                if (string.IsNullOrWhiteSpace(repositoryUrl))
                {
                    continue;
                }

                string normalizedRepositoryUrl = GitRepositoryConfigurationService.NormalizeRepositoryUrl(repositoryUrl);
                GitRepositoryConfig? repository = repositories.FirstOrDefault(candidate =>
                    string.Equals(candidate.NormalizedRepositoryUrl, normalizedRepositoryUrl, StringComparison.OrdinalIgnoreCase));
                if (repository == null)
                {
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
                    continue;
                }

                GitflowAttachmentClaim[] executionAttachments = imageAttachments
                    .Select(attachment => new GitflowAttachmentClaim(
                        attachment.Id,
                        attachment.Filename,
                        attachment.MimeType,
                        attachment.Size,
                        $"/api/worker-auth/jira-attachments/{Uri.EscapeDataString(claim.EventId ?? string.Empty)}/{Uri.EscapeDataString(attachment.Id)}"))
                    .Where(attachment => !string.IsNullOrWhiteSpace(claim.EventId))
                    .ToArray();
                string executionCommand = BuildGitflowCommand(repository, issue, issueUrl, executionAttachments);

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
            using HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, $"{_applicationData.ExternalAPI}/api/worker-auth/integration-tickets/jira/claim");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", await _getWorkerAccessToken());
            request.Content = JsonContent.Create(new
            {
                integrationId = integration.IntegrationId,
                sourceItemId = issue.Id,
                sourceItemKey = issue.Key,
                sourceItemUrl = issueUrl,
                repositoryUrl = repository.RepositoryUrl,
                normalizedRepositoryUrl,
                command,
                metadata = new
                {
                    issueId = issue.Id,
                    issueKey = issue.Key,
                    imageAttachments
                }
            });

            using HttpResponseMessage response = await _http.SendAsync(request, cancellationToken);
            if (response.StatusCode == HttpStatusCode.Conflict)
            {
                return new JiraClaimResponse { Claimed = false };
            }

            string body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.Debug($"Jira claim for {issue.Key} failed with {(int)response.StatusCode}: {body}");
                return null;
            }

            return JsonConvert.DeserializeObject<JiraClaimResponse>(body);
        }

        private static async Task<string[]> ResolveRepositoryFieldKeys(JiraCliClient jira)
        {
            try
            {
                JiraFieldOption[] fields = await jira.FindFields("repository");
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
        }

        private sealed record JiraAttachmentMetadata(string Id, string Filename, string MimeType, long? Size, string ContentUrl);

        private sealed record GitflowAttachmentClaim(string Id, string Filename, string MimeType, long? Size, string DownloadUrl);
    }
}
