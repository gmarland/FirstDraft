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

        public async Task TestConnection()
        {
            await RequestJson("rest/api/3/myself");
        }

        public async Task<JiraBoardOption[]> ListBoards()
        {
            JObject json = await RequestJson("rest/agile/1.0/board?maxResults=100");
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

        public async Task<JiraBoardConfiguration> GetBoardConfiguration(int boardId)
        {
            JObject json = await RequestJson($"rest/agile/1.0/board/{boardId}/configuration");
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

        public async Task<JiraStatusOption[]> GetBoardStatuses(JiraBoardConfiguration configuration)
        {
            List<JiraStatusOption> statuses = new List<JiraStatusOption>();
            foreach (string statusId in configuration.StatusIds)
            {
                statuses.Add(await GetStatus(statusId));
            }

            return statuses
                .OrderBy(status => status.Name, StringComparer.OrdinalIgnoreCase)
                .ThenBy(status => status.Id, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }

        private async Task<JiraStatusOption> GetStatus(string statusId)
        {
            JObject json = await RequestJson($"rest/api/3/status/{Uri.EscapeDataString(statusId)}");
            return new JiraStatusOption(
                json.Value<string>("id") ?? statusId,
                json.Value<string>("name") ?? statusId,
                json["statusCategory"]?.Value<string>("name") ?? string.Empty);
        }

        private async Task<JObject> RequestJson(string path)
        {
            using HttpResponseMessage response = await _httpClient.GetAsync(path);
            string body = await response.Content.ReadAsStringAsync();
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

        public void Dispose()
        {
            _httpClient.Dispose();
        }
    }

    public sealed record JiraBoardOption(int Id, string Name, string Type);

    public sealed record JiraBoardConfiguration(int BoardId, int? FilterId, string[] StatusIds);

    public sealed record JiraStatusOption(string Id, string Name, string StatusCategory);
}
