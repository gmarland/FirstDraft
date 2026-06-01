using System.Net.Http.Headers;
using System.Text;
using Newtonsoft.Json.Linq;

namespace FirstDraft.Cli.Jira
{
    public sealed class JiraCliClient : IDisposable
    {
        private readonly HttpClient _httpClient;

        public JiraCliClient(string siteUrl, string email, string apiToken)
        {
            _httpClient = new HttpClient
            {
                BaseAddress = new Uri($"{JiraIntegrationConfigService.CleanSiteUrl(siteUrl)}/")
            };
            string credentials = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{email}:{apiToken}"));
            _httpClient.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Basic", credentials);
            _httpClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        }

        public async Task TestConnection(CancellationToken cancellationToken = default)
        {
            await RequestJson("rest/api/3/myself", cancellationToken);
        }

        public async Task<JiraBoardOption[]> ListBoards(CancellationToken cancellationToken = default)
        {
            JObject json = await RequestJson("rest/agile/1.0/board?maxResults=100", cancellationToken);
            return json["values"]?
                .OfType<JObject>()
                .Select(board => new JiraBoardOption(
                    board.Value<int?>("id") ?? 0,
                    board.Value<string>("name") ?? string.Empty,
                    board.Value<string>("type") ?? string.Empty))
                .Where(board => board.Id > 0 && !string.IsNullOrWhiteSpace(board.Name))
                .OrderBy(board => board.Name, StringComparer.OrdinalIgnoreCase)
                .ThenBy(board => board.Id)
                .ToArray() ?? Array.Empty<JiraBoardOption>();
        }

        public async Task<JiraBoardConfiguration> GetBoardConfiguration(int boardId, CancellationToken cancellationToken = default)
        {
            JObject json = await RequestJson($"rest/agile/1.0/board/{boardId}/configuration", cancellationToken);
            int? filterId = json["filter"]?.Value<int?>("id");
            string[] statusIds = json["columnConfig"]?["columns"]?
                .OfType<JObject>()
                .SelectMany(column => column["statuses"]?.OfType<JObject>() ?? Enumerable.Empty<JObject>())
                .Select(status => status.Value<string>("id") ?? string.Empty)
                .Where(statusId => !string.IsNullOrWhiteSpace(statusId))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray() ?? Array.Empty<string>();

            return new JiraBoardConfiguration(boardId, filterId, statusIds);
        }

        public async Task<JiraStatusOption[]> GetBoardStatuses(JiraBoardConfiguration configuration, CancellationToken cancellationToken = default)
        {
            List<JiraStatusOption> statuses = new List<JiraStatusOption>();
            foreach (string statusId in configuration.StatusIds)
            {
                statuses.Add(await GetStatus(statusId, cancellationToken));
            }

            return statuses
                .OrderBy(status => status.Name, StringComparer.OrdinalIgnoreCase)
                .ThenBy(status => status.Id, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }

        public async Task<JiraFieldOption[]> FindFields(string searchText, CancellationToken cancellationToken = default)
        {
            JObject[] fields = (await RequestJsonArray("rest/api/3/field", cancellationToken))
                .OfType<JObject>()
                .ToArray();
            string needle = searchText.Trim();

            return fields
                .Select(field => new JiraFieldOption(
                    field.Value<string>("id") ?? string.Empty,
                    field.Value<string>("key") ?? field.Value<string>("id") ?? string.Empty,
                    field.Value<string>("name") ?? string.Empty))
                .Where(field =>
                    !string.IsNullOrWhiteSpace(field.Id) &&
                    (field.Id.Contains(needle, StringComparison.OrdinalIgnoreCase) ||
                     field.Key.Contains(needle, StringComparison.OrdinalIgnoreCase) ||
                     field.Name.Contains(needle, StringComparison.OrdinalIgnoreCase)))
                .ToArray();
        }

        public async Task<JiraUserOption[]> ListUsers(CancellationToken cancellationToken = default)
        {
            JObject[] users = (await RequestJsonArray("rest/api/3/users/search?maxResults=1000", cancellationToken))
                .OfType<JObject>()
                .ToArray();

            return users
                .Select(user => new JiraUserOption(
                    user.Value<string>("accountId") ?? string.Empty,
                    user.Value<string>("displayName") ?? string.Empty,
                    user.Value<string>("emailAddress") ?? string.Empty,
                    user.Value<bool?>("active") ?? false,
                    user.Value<string>("accountType") ?? string.Empty))
                .Where(user =>
                    !string.IsNullOrWhiteSpace(user.AccountId) &&
                    !string.IsNullOrWhiteSpace(user.DisplayName) &&
                    user.Active &&
                    string.Equals(user.AccountType, "atlassian", StringComparison.OrdinalIgnoreCase))
                .OrderBy(user => user.DisplayName, StringComparer.OrdinalIgnoreCase)
                .ThenBy(user => user.EmailAddress, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }

        public async Task<JiraIssueSummary[]> SearchIssues(string jql, int maxResults, IEnumerable<string> fields, CancellationToken cancellationToken = default)
        {
            JObject body = new JObject
            {
                ["jql"] = jql,
                ["maxResults"] = Math.Clamp(maxResults, 1, 100),
                ["fields"] = new JArray(fields.Where(field => !string.IsNullOrWhiteSpace(field)).Distinct(StringComparer.OrdinalIgnoreCase))
            };

            JObject json = await PostJson("rest/api/3/search/jql", body, cancellationToken);
            return json["issues"]?
                .OfType<JObject>()
                .Select(issue => new JiraIssueSummary(
                    issue.Value<string>("id") ?? string.Empty,
                    issue.Value<string>("key") ?? string.Empty,
                    issue["fields"] as JObject ?? new JObject()))
                .Where(issue => !string.IsNullOrWhiteSpace(issue.Id) && !string.IsNullOrWhiteSpace(issue.Key))
                .ToArray() ?? Array.Empty<JiraIssueSummary>();
        }

        public async Task TransitionIssue(string issueKey, string targetStatusId, string targetStatusName, CancellationToken cancellationToken = default)
        {
            JObject json = await RequestJson($"rest/api/3/issue/{Uri.EscapeDataString(issueKey)}/transitions", cancellationToken);
            JObject? transition = json["transitions"]?
                .OfType<JObject>()
                .FirstOrDefault(candidate => IsTargetTransition(candidate, targetStatusId, targetStatusName));

            if (transition == null)
            {
                string target = string.IsNullOrWhiteSpace(targetStatusName) ? targetStatusId : targetStatusName;
                throw new InvalidOperationException($"No Jira transition is available for {issueKey} to status {target}");
            }

            string transitionId = transition.Value<string>("id") ?? string.Empty;
            if (string.IsNullOrWhiteSpace(transitionId))
            {
                throw new InvalidOperationException($"Jira transition for {issueKey} did not include an id");
            }

            JObject body = new JObject
            {
                ["transition"] = new JObject
                {
                    ["id"] = transitionId
                }
            };

            await PostJson($"rest/api/3/issue/{Uri.EscapeDataString(issueKey)}/transitions", body, cancellationToken);
        }

        public async Task AddComment(string issueKey, string body, CancellationToken cancellationToken = default)
        {
            JObject payload = new JObject
            {
                ["body"] = BuildJiraDocument(body)
            };

            await PostJson($"rest/api/3/issue/{Uri.EscapeDataString(issueKey)}/comment", payload, cancellationToken);
        }

        private async Task<JiraStatusOption> GetStatus(string statusId, CancellationToken cancellationToken)
        {
            JObject json = await RequestJson($"rest/api/3/status/{Uri.EscapeDataString(statusId)}", cancellationToken);
            return new JiraStatusOption(
                json.Value<string>("id") ?? statusId,
                json.Value<string>("name") ?? statusId,
                json["statusCategory"]?.Value<string>("name") ?? string.Empty);
        }

        private async Task<JObject> RequestJson(string path, CancellationToken cancellationToken)
        {
            using HttpResponseMessage response = await _httpClient.GetAsync(path, cancellationToken);
            string body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                string message = string.IsNullOrWhiteSpace(body) ? response.ReasonPhrase ?? "request failed" : body;
                throw new InvalidOperationException($"Jira API returned {(int)response.StatusCode}: {message}");
            }

            try
            {
                return JObject.Parse(body);
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Jira API returned invalid JSON: {ex.Message}");
            }
        }

        private async Task<JArray> RequestJsonArray(string path, CancellationToken cancellationToken)
        {
            using HttpResponseMessage response = await _httpClient.GetAsync(path, cancellationToken);
            string body = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                string message = string.IsNullOrWhiteSpace(body) ? response.ReasonPhrase ?? "request failed" : body;
                throw new InvalidOperationException($"Jira API returned {(int)response.StatusCode}: {message}");
            }

            try
            {
                return JArray.Parse(body);
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Jira API returned invalid JSON: {ex.Message}");
            }
        }

        private async Task<JObject> PostJson(string path, JObject body, CancellationToken cancellationToken)
        {
            using StringContent content = new StringContent(body.ToString(Newtonsoft.Json.Formatting.None), Encoding.UTF8, "application/json");
            using HttpResponseMessage response = await _httpClient.PostAsync(path, content, cancellationToken);
            string responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                string message = string.IsNullOrWhiteSpace(responseBody) ? response.ReasonPhrase ?? "request failed" : responseBody;
                throw new InvalidOperationException($"Jira API returned {(int)response.StatusCode}: {message}");
            }

            try
            {
                return string.IsNullOrWhiteSpace(responseBody) ? new JObject() : JObject.Parse(responseBody);
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException($"Jira API returned invalid JSON: {ex.Message}");
            }
        }

        private static bool IsTargetTransition(JObject transition, string targetStatusId, string targetStatusName)
        {
            string normalizedStatusId = targetStatusId.Trim();
            string transitionStatusId = transition["to"]?.Value<string>("id") ?? string.Empty;
            if (!string.IsNullOrWhiteSpace(normalizedStatusId) &&
                string.Equals(transitionStatusId, normalizedStatusId, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            string normalizedStatusName = NormalizeTransitionStatusName(targetStatusName);
            if (string.IsNullOrWhiteSpace(normalizedStatusName)) return false;

            string transitionStatusName = NormalizeTransitionStatusName(transition["to"]?.Value<string>("name") ?? string.Empty);
            string transitionName = NormalizeTransitionStatusName(transition.Value<string>("name") ?? string.Empty);
            return string.Equals(transitionStatusName, normalizedStatusName, StringComparison.OrdinalIgnoreCase) ||
                   string.Equals(transitionName, normalizedStatusName, StringComparison.OrdinalIgnoreCase);
        }

        private static string NormalizeTransitionStatusName(string value)
        {
            return value.Trim().ToLowerInvariant();
        }

        private static JObject BuildJiraDocument(string text)
        {
            JArray content = new JArray();
            foreach (string rawLine in text.Replace("\r\n", "\n").Split('\n'))
            {
                string line = rawLine.TrimEnd();
                JObject paragraph = new JObject
                {
                    ["type"] = "paragraph"
                };
                if (!string.IsNullOrWhiteSpace(line))
                {
                    paragraph["content"] = new JArray
                    {
                        new JObject
                        {
                            ["type"] = "text",
                            ["text"] = line
                        }
                    };
                }
                content.Add(paragraph);
            }

            if (content.Count == 0)
            {
                content.Add(new JObject { ["type"] = "paragraph" });
            }

            return new JObject
            {
                ["type"] = "doc",
                ["version"] = 1,
                ["content"] = content
            };
        }

        public void Dispose()
        {
            _httpClient.Dispose();
        }
    }

    public sealed record JiraBoardOption(int Id, string Name, string Type);

    public sealed record JiraBoardConfiguration(int BoardId, int? FilterId, string[] StatusIds);

    public sealed record JiraStatusOption(string Id, string Name, string StatusCategory);

    public sealed record JiraFieldOption(string Id, string Key, string Name);

    public sealed record JiraUserOption(string AccountId, string DisplayName, string EmailAddress, bool Active, string AccountType);

    public sealed record JiraIssueSummary(string Id, string Key, JObject Fields);
}
