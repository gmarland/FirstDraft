using System.Net.Http.Headers;
using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using FirstDraft.Configuration;
using Newtonsoft.Json.Linq;

namespace FirstDraft.Cli
{
    public class JiraIntegrationConfigurationService
    {
        private const int IntegrationIdLength = 5;
        private const int GenerateIntegrationIdMaxAttempts = 100;
        private const string IntegrationIdCharacters = "abcdefghijklmnopqrstuvwxyz0123456789";
        private readonly ApplicationDataService _applicationDataService;

        public JiraIntegrationConfigurationService(ApplicationDataService applicationDataService)
        {
            _applicationDataService = applicationDataService;
        }

        public async Task<int> Integrations(string[] args)
        {
            string command = args.Length > 0 ? args[0].ToLowerInvariant() : "list";

            return command switch
            {
                "list" => await List(),
                "add" => await Add(args.Skip(1).ToArray()),
                "configure" => await Configure(args.Skip(1).ToArray()),
                "update" => await Configure(args.Skip(1).ToArray()),
                "remove" => await Remove(args.Skip(1).ToArray()),
                "delete" => await Remove(args.Skip(1).ToArray()),
                _ => PrintIntegrationsHelp($"Unknown integrations command: {args[0]}")
            };
        }

        private async Task<int> List()
        {
            ApplicationData applicationData = await _applicationDataService.GetApplicationData();
            JiraIntegrationConfig[] integrations = NormalizeIntegrations(applicationData, applicationData.JiraIntegrations);

            if (integrations.Length == 0)
            {
                Console.WriteLine("No Jira integrations configured for this worker.");
                return 0;
            }

            PrintRow("INTEGRATION ID", "STATUS", "ENABLED", "SITE URL", "EMAIL", "BOARD", "READY", "PROCESSING", "PROCESSED", "TOKEN");
            foreach (JiraIntegrationConfig integration in integrations)
            {
                PrintRow(
                    integration.IntegrationId,
                    GetIntegrationStatus(applicationData, integration),
                    integration.Enabled ? "yes" : "no",
                    integration.SiteUrl,
                    integration.Email,
                    integration.BoardName,
                    integration.ReadyStatusName,
                    integration.ProcessingStatusName,
                    integration.ProcessedStatusName,
                    HasStoredApiToken(integration) ? "configured" : "missing");
            }

            return 0;
        }

        private static void PrintRow(
            string integrationId,
            string status,
            string enabled,
            string siteUrl,
            string email,
            string board,
            string ready,
            string processing,
            string processed,
            string token)
        {
            Console.WriteLine($"{integrationId}\t{status}\t{enabled}\t{siteUrl}\t{email}\t{board}\t{ready}\t{processing}\t{processed}\t{token}");
        }

        private async Task<int> Add(string[] args)
        {
            if (args.Length == 0) return PrintIntegrationsHelp("Integration type is required. Use: firstdraft integrations add jira");
            if (args.Length > 1) return PrintIntegrationsHelp("Jira connection details are collected interactively. Use: firstdraft integrations add jira");
            if (!string.Equals(args[0], "jira", StringComparison.OrdinalIgnoreCase))
            {
                return PrintIntegrationsHelp($"Unsupported integration type: {args[0]}");
            }

            if (Console.IsInputRedirected || Console.IsOutputRedirected)
            {
                Console.Error.WriteLine("Interactive Jira connection setup requires a terminal.");
                return 1;
            }

            ApplicationData applicationData = await _applicationDataService.GetApplicationData();
            List<JiraIntegrationConfig> integrations = NormalizeIntegrations(applicationData, applicationData.JiraIntegrations).ToList();

            if (string.IsNullOrEmpty(applicationData.ConfigEncryptionKey))
            {
                Console.Error.WriteLine("ConfigEncryptionKey is required before saving Jira API tokens. Run firstdraft init to authenticate this worker.");
                return 1;
            }

            Console.WriteLine("Add Jira integration");
            string siteUrl = PromptUntilValid("Jira site URL", string.Empty, ValidateSiteUrl);
            string email = PromptUntilValid("Jira email", string.Empty, value => ValidateEmail(value, "Jira email"));
            string apiToken = PromptSensitiveRequired("Jira API token");
            string? connectionError = ValidateConnectionFields(siteUrl, email, apiToken);
            if (connectionError != null) return PrintIntegrationsHelp(connectionError);

            string? integrationId = GenerateUniqueIntegrationId(integrations);
            if (integrationId == null)
            {
                Console.Error.WriteLine("Unable to generate a unique Jira integration ID. Remove unused integrations and try again.");
                return 1;
            }

            JiraIntegrationConfig integration = new JiraIntegrationConfig
            {
                IntegrationId = integrationId,
                Enabled = false,
                SiteUrl = CleanSiteUrl(siteUrl),
                Email = email.Trim()
            };
            integration.StoreApiToken(applicationData, apiToken.Trim());

            integrations.Add(integration);

            applicationData.JiraIntegrations = integrations
                .OrderBy(integration => integration.IntegrationId, StringComparer.OrdinalIgnoreCase)
                .ToArray();
            await _applicationDataService.Save(applicationData);

            Console.WriteLine($"Added Jira integration {integrationId}");
            Console.WriteLine($"Configure board and statuses with: firstdraft integrations configure {integrationId}");
            Console.WriteLine($"Config written to {_applicationDataService.ConfigLocation}");
            return 0;
        }

        private async Task<int> Configure(string[] args)
        {
            if (args.Length == 0) return PrintIntegrationsHelp("Integration ID is required.");
            string? integrationId = NormalizeIntegrationId(args[0]);
            if (integrationId == null) return PrintIntegrationsHelp("Integration ID must be 5 lowercase alphanumeric characters.");
            if (args.Length > 1) return PrintIntegrationsHelp("Configure is interactive and does not accept option flags.");
            if (Console.IsInputRedirected || Console.IsOutputRedirected)
            {
                Console.Error.WriteLine("Interactive Jira configuration requires a terminal.");
                return 1;
            }

            ApplicationData applicationData = await _applicationDataService.GetApplicationData();
            List<JiraIntegrationConfig> integrations = NormalizeIntegrations(applicationData, applicationData.JiraIntegrations).ToList();
            int existingIndex = integrations.FindIndex(integration =>
                string.Equals(integration.IntegrationId, integrationId, StringComparison.OrdinalIgnoreCase));

            if (existingIndex < 0)
            {
                Console.Error.WriteLine("Jira integration is not configured. Use firstdraft integrations add jira to add it.");
                return 1;
            }

            JiraIntegrationConfig saved = integrations[existingIndex];
            saved.IntegrationId = integrationId;
            string? connectionError = ValidateSavedConnection(applicationData, saved);
            if (connectionError != null) return PrintIntegrationsHelp(connectionError);

            string apiToken = saved.GetApiToken(applicationData);
            try
            {
                using JiraCliClient jira = new JiraCliClient(saved.SiteUrl, saved.Email, apiToken);
                Console.WriteLine($"Testing Jira connection to {saved.SiteUrl}...");
                await jira.TestConnection();

                JiraBoardOption[] boards = await jira.ListBoards();
                if (boards.Length == 0)
                {
                    Console.Error.WriteLine("No Jira boards were returned for this account.");
                    return 1;
                }

                JiraBoardOption board = PromptSelection("Board", boards, FormatBoard);
                JiraBoardConfiguration boardConfiguration = await jira.GetBoardConfiguration(board.Id);
                JiraStatusOption[] statuses = await jira.GetBoardStatuses(boardConfiguration);
                if (statuses.Length == 0)
                {
                    Console.Error.WriteLine("No Jira statuses were returned for the selected board.");
                    return 1;
                }

                JiraStatusOption ready = PromptSelection("Ready for AI status", statuses, FormatStatus);
                JiraStatusOption processing = PromptSelection("AI Processing status", statuses, FormatStatus);
                JiraStatusOption processed = PromptSelection("Processed by AIstatus", statuses, FormatStatus);

                saved.BoardId = board.Id;
                saved.BoardName = board.Name;
                saved.BoardType = board.Type;
                saved.BoardFilterId = boardConfiguration.FilterId;
                saved.ReadyStatusId = ready.Id;
                saved.ReadyStatusName = ready.Name;
                saved.ProcessingStatusId = processing.Id;
                saved.ProcessingStatusName = processing.Name;
                saved.ProcessedStatusId = processed.Id;
                saved.ProcessedStatusName = processed.Name;
                saved.Enabled = true;
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Unable to configure Jira integration: {ex.Message}");
                return 1;
            }

            string? validationError = ValidateIntegration(applicationData, saved, requireReadableToken: false);
            if (validationError != null) return PrintIntegrationsHelp(validationError);

            integrations[existingIndex] = saved;
            applicationData.JiraIntegrations = integrations
                .OrderBy(integration => integration.IntegrationId, StringComparer.OrdinalIgnoreCase)
                .ToArray();
            await _applicationDataService.Save(applicationData);

            Console.WriteLine($"Configured Jira integration {saved.IntegrationId}");
            Console.WriteLine($"Config written to {_applicationDataService.ConfigLocation}");
            return 0;
        }

        private async Task<int> Remove(string[] args)
        {
            if (args.Length == 0) return PrintIntegrationsHelp("Integration ID is required.");
            string? integrationId = NormalizeIntegrationId(args[0]);
            if (integrationId == null) return PrintIntegrationsHelp("Integration ID must be 5 lowercase alphanumeric characters.");

            ApplicationData applicationData = await _applicationDataService.GetApplicationData();
            List<JiraIntegrationConfig> integrations = NormalizeIntegrations(applicationData, applicationData.JiraIntegrations).ToList();
            int removed = integrations.RemoveAll(integration =>
                string.Equals(integration.IntegrationId, integrationId, StringComparison.OrdinalIgnoreCase));

            if (removed == 0)
            {
                Console.Error.WriteLine("Jira integration is not configured.");
                return 1;
            }

            applicationData.JiraIntegrations = integrations.ToArray();
            await _applicationDataService.Save(applicationData);

            Console.WriteLine($"Removed Jira integration {integrationId}");
            Console.WriteLine($"Config written to {_applicationDataService.ConfigLocation}");
            return 0;
        }

        public static JiraIntegrationConfig[] NormalizeIntegrations(ApplicationData applicationData, JiraIntegrationConfig[]? integrations)
        {
            if (integrations == null || integrations.Length == 0) return Array.Empty<JiraIntegrationConfig>();

            return integrations
                .Where(integration => NormalizeIntegrationId(integration.IntegrationId) != null)
                .Select(integration =>
                {
                    string integrationId = NormalizeIntegrationId(integration.IntegrationId)!;
                    return new JiraIntegrationConfig
                    {
                        IntegrationId = integrationId,
                        Enabled = integration.Enabled,
                        SiteUrl = CleanSiteUrl(integration.SiteUrl),
                        Email = (integration.Email ?? string.Empty).Trim(),
                        EncryptedApiToken = integration.EncryptedApiToken,
                        BoardId = integration.BoardId,
                        BoardName = (integration.BoardName ?? string.Empty).Trim(),
                        BoardType = (integration.BoardType ?? string.Empty).Trim(),
                        BoardFilterId = integration.BoardFilterId,
                        ReadyStatusId = (integration.ReadyStatusId ?? string.Empty).Trim(),
                        ReadyStatusName = (integration.ReadyStatusName ?? string.Empty).Trim(),
                        ProcessingStatusId = (integration.ProcessingStatusId ?? string.Empty).Trim(),
                        ProcessingStatusName = (integration.ProcessingStatusName ?? string.Empty).Trim(),
                        ProcessedStatusId = (integration.ProcessedStatusId ?? string.Empty).Trim(),
                        ProcessedStatusName = (integration.ProcessedStatusName ?? string.Empty).Trim()
                    };
                })
                .GroupBy(integration => integration.IntegrationId, StringComparer.OrdinalIgnoreCase)
                .Select(group => group.Last())
                .OrderBy(integration => integration.IntegrationId, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }

        public static object[] BuildRegistrationPayload(ApplicationData applicationData)
        {
            return NormalizeIntegrations(applicationData, applicationData.JiraIntegrations)
                .Where(integration => ValidateIntegration(applicationData, integration) == null)
                .Select(integration => new
                {
                    integrationId = integration.IntegrationId,
                    enabled = integration.Enabled,
                    siteUrl = integration.SiteUrl,
                    email = integration.Email,
                    apiToken = integration.GetApiToken(applicationData),
                    boardId = integration.BoardId,
                    boardName = integration.BoardName,
                    boardType = integration.BoardType,
                    boardFilterId = integration.BoardFilterId,
                    readyStatusId = integration.ReadyStatusId,
                    readyStatusName = integration.ReadyStatusName,
                    processingStatusId = integration.ProcessingStatusId,
                    processingStatusName = integration.ProcessingStatusName,
                    processedStatusId = integration.ProcessedStatusId,
                    processedStatusName = integration.ProcessedStatusName
                })
                .ToArray();
        }

        private static string? ValidateIntegration(ApplicationData applicationData, JiraIntegrationConfig integration, bool requireReadableToken = true)
        {
            if (NormalizeIntegrationId(integration.IntegrationId) == null) return "Integration ID must be 5 lowercase alphanumeric characters.";
            string? connectionError = ValidateSavedConnection(applicationData, integration, requireReadableToken);
            if (connectionError != null) return connectionError;
            if (!integration.BoardId.HasValue || integration.BoardId.Value <= 0) return "Jira board ID is required.";
            if (string.IsNullOrWhiteSpace(integration.BoardName)) return "Jira board name is required.";
            if (string.IsNullOrWhiteSpace(integration.BoardType)) return "Jira board type is required.";
            if (string.IsNullOrWhiteSpace(integration.ReadyStatusId)) return "Jira ready status ID is required.";
            if (string.IsNullOrWhiteSpace(integration.ReadyStatusName)) return "Jira ready status name is required.";
            if (string.IsNullOrWhiteSpace(integration.ProcessingStatusId)) return "Jira processing status ID is required.";
            if (string.IsNullOrWhiteSpace(integration.ProcessingStatusName)) return "Jira processing status name is required.";
            if (string.IsNullOrWhiteSpace(integration.ProcessedStatusId)) return "Jira processed status ID is required.";
            if (string.IsNullOrWhiteSpace(integration.ProcessedStatusName)) return "Jira processed status name is required.";
            return null;
        }

        private static string GetIntegrationStatus(ApplicationData applicationData, JiraIntegrationConfig integration)
        {
            if (ValidateIntegration(applicationData, integration, requireReadableToken: false) == null) return "configured";
            if (ValidateSavedConnection(applicationData, integration, requireReadableToken: false) == null) return "connection";
            return "incomplete";
        }

        private static string? ValidateConnectionFields(string? siteUrl, string? email, string? apiToken)
        {
            string? siteError = ValidateSiteUrl(siteUrl);
            if (siteError != null) return siteError;
            string? emailError = ValidateEmail(email, "--email");
            if (emailError != null) return emailError;
            if (string.IsNullOrWhiteSpace(apiToken)) return "--api-token is required.";
            return null;
        }

        private static string? ValidateSavedConnection(ApplicationData applicationData, JiraIntegrationConfig integration, bool requireReadableToken = true)
        {
            string? siteError = ValidateSiteUrl(integration.SiteUrl);
            if (siteError != null) return siteError;
            string? emailError = ValidateEmail(integration.Email, "Jira email");
            if (emailError != null) return emailError;
            if (requireReadableToken)
            {
                if (string.IsNullOrWhiteSpace(integration.GetApiToken(applicationData))) return "Jira API token is required or could not be decrypted.";
            }
            else if (!HasStoredApiToken(integration))
            {
                return "Jira API token is required.";
            }

            return null;
        }

        private static string? ValidateEmail(string? email, string label)
        {
            if (string.IsNullOrWhiteSpace(email)) return $"{label} is required.";

            try
            {
                MailAddress parsed = new MailAddress(email.Trim());
                return string.Equals(parsed.Address, email.Trim(), StringComparison.OrdinalIgnoreCase)
                    ? null
                    : $"{label} must be a valid email address.";
            }
            catch (FormatException)
            {
                return $"{label} must be a valid email address.";
            }
        }

        private static string? ValidateSiteUrl(string? siteUrl)
        {
            if (string.IsNullOrWhiteSpace(siteUrl)) return "Jira site URL is required.";
            if (!Uri.TryCreate(siteUrl, UriKind.Absolute, out Uri? uri) ||
                (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            {
                return "Jira site URL must be an absolute http or https URL.";
            }

            return null;
        }

        private static string? GenerateUniqueIntegrationId(IEnumerable<JiraIntegrationConfig> integrations)
        {
            HashSet<string> existingIds = integrations
                .Select(integration => integration.IntegrationId)
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            for (int attempt = 0; attempt < GenerateIntegrationIdMaxAttempts; attempt++)
            {
                string integrationId = GenerateIntegrationId();
                if (!existingIds.Contains(integrationId)) return integrationId;
            }

            return null;
        }

        private static string GenerateIntegrationId()
        {
            char[] value = new char[IntegrationIdLength];
            for (int index = 0; index < value.Length; index++)
            {
                value[index] = IntegrationIdCharacters[RandomNumberGenerator.GetInt32(IntegrationIdCharacters.Length)];
            }

            return new string(value);
        }

        private static string? NormalizeIntegrationId(string? integrationId)
        {
            string normalized = (integrationId ?? string.Empty).Trim();
            if (normalized.Length != IntegrationIdLength) return null;
            return normalized.All(character =>
                (character >= 'a' && character <= 'z') ||
                (character >= '0' && character <= '9'))
                ? normalized
                : null;
        }

        private static string CleanSiteUrl(string value)
        {
            return (value ?? string.Empty).Trim().TrimEnd('/');
        }

        private static bool HasStoredApiToken(JiraIntegrationConfig integration)
        {
            return integration.EncryptedApiToken != null;
        }

        private static T PromptSelection<T>(string label, IReadOnlyList<T> options, Func<T, string> format)
        {
            Console.WriteLine();
            Console.WriteLine($"{label}:");
            for (int index = 0; index < options.Count; index++)
            {
                Console.WriteLine($"  {index + 1}. {format(options[index])}");
            }

            while (true)
            {
                Console.Write($"Select {label.ToLowerInvariant()} [1-{options.Count}]: ");
                string? input = Console.ReadLine();
                if (int.TryParse(input, out int selected) && selected >= 1 && selected <= options.Count)
                {
                    return options[selected - 1];
                }

                Console.Error.WriteLine("Enter one of the listed numbers.");
            }
        }

        private static string PromptUntilValid(string label, string defaultValue, Func<string, string?> validate)
        {
            while (true)
            {
                string value = Prompt(label, defaultValue);
                string? error = validate(value);
                if (error == null) return value;

                Console.Error.WriteLine(error);
            }
        }

        private static string Prompt(string label, string defaultValue)
        {
            string suffix = string.IsNullOrWhiteSpace(defaultValue) ? string.Empty : $" [{defaultValue}]";
            Console.Write($"{label}{suffix}: ");
            string? input = Console.ReadLine();
            return string.IsNullOrWhiteSpace(input) ? defaultValue : input.Trim();
        }

        private static string PromptSensitiveRequired(string label)
        {
            while (true)
            {
                string value = PromptSensitive(label);
                if (!string.IsNullOrWhiteSpace(value)) return value.Trim();
                Console.Error.WriteLine($"{label} is required.");
            }
        }

        private static string PromptSensitive(string label)
        {
            Console.Write($"{label}: ");
            StringBuilder value = new StringBuilder();

            while (true)
            {
                ConsoleKeyInfo key = Console.ReadKey(intercept: true);
                if (key.Key == ConsoleKey.Enter)
                {
                    Console.WriteLine();
                    return value.ToString();
                }

                if (key.Key == ConsoleKey.Backspace)
                {
                    if (value.Length > 0) value.Length--;
                    continue;
                }

                if (!char.IsControl(key.KeyChar)) value.Append(key.KeyChar);
            }
        }

        private static string FormatBoard(JiraBoardOption board)
        {
            return $"{board.Name}";
        }

        private static string FormatStatus(JiraStatusOption status)
        {
            return status.Name;
        }

        private sealed class JiraCliClient : IDisposable
        {
            private readonly HttpClient _httpClient;

            public JiraCliClient(string siteUrl, string email, string apiToken)
            {
                _httpClient = new HttpClient
                {
                    BaseAddress = new Uri($"{CleanSiteUrl(siteUrl)}/")
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

        private sealed record JiraBoardOption(int Id, string Name, string Type);

        private sealed record JiraBoardConfiguration(int BoardId, int? FilterId, string[] StatusIds);

        private sealed record JiraStatusOption(string Id, string Name, string StatusCategory);

        private static int PrintIntegrationsHelp(string? error = null)
        {
            if (!string.IsNullOrWhiteSpace(error))
            {
                Console.Error.WriteLine(error);
                Console.Error.WriteLine();
            }

            Console.Error.WriteLine("Usage:");
            Console.Error.WriteLine("  firstdraft integrations list");
            Console.Error.WriteLine("  firstdraft integrations add jira");
            Console.Error.WriteLine("  firstdraft integrations configure <integration-id>");
            Console.Error.WriteLine("  firstdraft integrations remove <integration-id>");
            return string.IsNullOrWhiteSpace(error) ? 0 : 1;
        }
    }
}
