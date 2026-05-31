using FirstDraft.Configuration;

namespace FirstDraft.Cli
{
    public class JiraIntegrationConfigurationService
    {
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
                "add" => await Save(args.Skip(1).ToArray(), createOnly: true),
                "update" => await Save(args.Skip(1).ToArray(), createOnly: false),
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

            PrintRow("INTEGRATION ID", "ENABLED", "SITE URL", "EMAIL", "BOARD", "READY", "PROCESSING", "PROCESSED", "TOKEN");
            foreach (JiraIntegrationConfig integration in integrations)
            {
                PrintRow(
                    integration.IntegrationId,
                    integration.Enabled ? "yes" : "no",
                    integration.SiteUrl,
                    integration.Email,
                    integration.BoardName,
                    integration.ReadyStatusName,
                    integration.ProcessingStatusName,
                    integration.ProcessedStatusName,
                    integration.HasApiToken(applicationData) ? "configured" : "missing");
            }

            return 0;
        }

        private static void PrintRow(
            string integrationId,
            string enabled,
            string siteUrl,
            string email,
            string board,
            string ready,
            string processing,
            string processed,
            string token)
        {
            Console.WriteLine($"{integrationId}\t{enabled}\t{siteUrl}\t{email}\t{board}\t{ready}\t{processing}\t{processed}\t{token}");
        }

        private async Task<int> Save(string[] args, bool createOnly)
        {
            if (args.Length == 0) return PrintIntegrationsHelp("Integration ID is required.");
            if (!Guid.TryParse(args[0], out Guid integrationGuid)) return PrintIntegrationsHelp("Integration ID must be a UUID.");

            ApplicationData applicationData = await _applicationDataService.GetApplicationData();
            if (string.IsNullOrEmpty(applicationData.ConfigEncryptionKey))
            {
                Console.Error.WriteLine("ConfigEncryptionKey is required before saving Jira API tokens. Run firstdraft init to authenticate this worker.");
                return 1;
            }

            List<JiraIntegrationConfig> integrations = NormalizeIntegrations(applicationData, applicationData.JiraIntegrations).ToList();
            string integrationId = integrationGuid.ToString();
            int existingIndex = integrations.FindIndex(integration =>
                string.Equals(integration.IntegrationId, integrationId, StringComparison.OrdinalIgnoreCase));

            if (createOnly && existingIndex >= 0)
            {
                Console.Error.WriteLine("Jira integration is already configured. Use firstdraft integrations update to change it.");
                return 1;
            }

            if (!createOnly && existingIndex < 0)
            {
                Console.Error.WriteLine("Jira integration is not configured. Use firstdraft integrations add to add it.");
                return 1;
            }

            JiraIntegrationConfig saved = existingIndex >= 0 ? integrations[existingIndex] : new JiraIntegrationConfig();
            saved.IntegrationId = integrationId;
            try
            {
                saved.Enabled = ReadBoolOption(args, "--enabled") ?? saved.Enabled;
                saved.SiteUrl = ReadRequiredOption(args, "--site-url", saved.SiteUrl, createOnly);
                saved.Email = ReadRequiredOption(args, "--email", saved.Email, createOnly);
                saved.BoardId = ReadRequiredIntOption(args, "--board-id", saved.BoardId, createOnly);
                saved.BoardName = ReadRequiredOption(args, "--board-name", saved.BoardName, createOnly);
                saved.BoardType = ReadRequiredOption(args, "--board-type", saved.BoardType, createOnly);
                saved.BoardFilterId = ReadOptionalIntOption(args, "--board-filter-id", saved.BoardFilterId);
                saved.ReadyStatusId = ReadRequiredOption(args, "--ready-status-id", saved.ReadyStatusId, createOnly);
                saved.ReadyStatusName = ReadRequiredOption(args, "--ready-status-name", saved.ReadyStatusName, createOnly);
                saved.ProcessingStatusId = ReadRequiredOption(args, "--processing-status-id", saved.ProcessingStatusId, createOnly);
                saved.ProcessingStatusName = ReadRequiredOption(args, "--processing-status-name", saved.ProcessingStatusName, createOnly);
                saved.ProcessedStatusId = ReadRequiredOption(args, "--processed-status-id", saved.ProcessedStatusId, createOnly);
                saved.ProcessedStatusName = ReadRequiredOption(args, "--processed-status-name", saved.ProcessedStatusName, createOnly);
            }
            catch (ArgumentException ex)
            {
                return PrintIntegrationsHelp(ex.Message);
            }

            string? apiToken = ReadOption(args, "--api-token");
            if (!string.IsNullOrWhiteSpace(apiToken))
            {
                saved.StoreApiToken(applicationData, apiToken);
            }
            else if (createOnly || !saved.HasApiToken(applicationData))
            {
                return PrintIntegrationsHelp("--api-token is required.");
            }

            string? validationError = ValidateIntegration(applicationData, saved);
            if (validationError != null) return PrintIntegrationsHelp(validationError);

            if (existingIndex >= 0) integrations[existingIndex] = saved;
            else integrations.Add(saved);

            applicationData.JiraIntegrations = integrations
                .OrderBy(integration => integration.IntegrationId, StringComparer.OrdinalIgnoreCase)
                .ToArray();
            await _applicationDataService.Save(applicationData);

            Console.WriteLine($"{(createOnly ? "Added" : "Updated")} Jira integration {saved.IntegrationId}");
            Console.WriteLine($"Config written to {_applicationDataService.ConfigLocation}");
            return 0;
        }

        private async Task<int> Remove(string[] args)
        {
            if (args.Length == 0) return PrintIntegrationsHelp("Integration ID is required.");
            if (!Guid.TryParse(args[0], out Guid integrationGuid)) return PrintIntegrationsHelp("Integration ID must be a UUID.");

            ApplicationData applicationData = await _applicationDataService.GetApplicationData();
            List<JiraIntegrationConfig> integrations = NormalizeIntegrations(applicationData, applicationData.JiraIntegrations).ToList();
            string integrationId = integrationGuid.ToString();
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
                .Where(integration => Guid.TryParse(integration.IntegrationId, out _))
                .Select(integration =>
                {
                    Guid integrationId = Guid.Parse(integration.IntegrationId);
                    return new JiraIntegrationConfig
                    {
                        IntegrationId = integrationId.ToString(),
                        Enabled = integration.Enabled,
                        SiteUrl = CleanSiteUrl(integration.SiteUrl),
                        Email = (integration.Email ?? string.Empty).Trim(),
                        ApiToken = string.Empty,
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

        private static string? ValidateIntegration(ApplicationData applicationData, JiraIntegrationConfig integration)
        {
            if (!Guid.TryParse(integration.IntegrationId, out _)) return "Integration ID must be a UUID.";
            if (!Uri.TryCreate(integration.SiteUrl, UriKind.Absolute, out Uri? uri) ||
                (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            {
                return "Jira site URL must be an absolute http or https URL.";
            }
            if (string.IsNullOrWhiteSpace(integration.Email)) return "Jira email is required.";
            if (string.IsNullOrWhiteSpace(integration.GetApiToken(applicationData))) return "Jira API token is required.";
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

        private static string ReadRequiredOption(string[] args, string name, string currentValue, bool createOnly)
        {
            string? value = ReadOption(args, name);
            if (!string.IsNullOrWhiteSpace(value)) return value.Trim();
            if (!createOnly && !string.IsNullOrWhiteSpace(currentValue)) return currentValue;
            throw new ArgumentException($"{name} is required.");
        }

        private static int? ReadRequiredIntOption(string[] args, string name, int? currentValue, bool createOnly)
        {
            int? value = ReadOptionalIntOption(args, name, currentValue);
            if (value.HasValue) return value;
            if (!createOnly && currentValue.HasValue) return currentValue;
            throw new ArgumentException($"{name} is required.");
        }

        private static int? ReadOptionalIntOption(string[] args, string name, int? currentValue)
        {
            string? value = ReadOption(args, name);
            if (string.IsNullOrWhiteSpace(value)) return currentValue;
            if (int.TryParse(value, out int parsed) && parsed > 0) return parsed;
            throw new ArgumentException($"{name} must be a positive integer.");
        }

        private static bool? ReadBoolOption(string[] args, string name)
        {
            string? value = ReadOption(args, name);
            if (string.IsNullOrWhiteSpace(value)) return null;
            if (string.Equals(value, "true", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(value, "yes", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(value, "1", StringComparison.OrdinalIgnoreCase)) return true;
            if (string.Equals(value, "false", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(value, "no", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(value, "0", StringComparison.OrdinalIgnoreCase)) return false;
            throw new ArgumentException($"{name} must be true or false.");
        }

        private static string? ReadOption(string[] args, string name)
        {
            for (int index = 1; index < args.Length; index++)
            {
                string arg = args[index];
                if (arg.StartsWith($"{name}=", StringComparison.OrdinalIgnoreCase))
                {
                    return arg[(name.Length + 1)..].Trim();
                }

                if (string.Equals(arg, name, StringComparison.OrdinalIgnoreCase) && index + 1 < args.Length)
                {
                    return args[index + 1].Trim();
                }
            }

            return null;
        }

        private static string CleanSiteUrl(string value)
        {
            return (value ?? string.Empty).Trim().TrimEnd('/');
        }

        private static int PrintIntegrationsHelp(string? error = null)
        {
            if (!string.IsNullOrWhiteSpace(error))
            {
                Console.Error.WriteLine(error);
                Console.Error.WriteLine();
            }

            Console.Error.WriteLine("Usage:");
            Console.Error.WriteLine("  firstdraft integrations list");
            Console.Error.WriteLine("  firstdraft integrations add <integration-id> --site-url <url> --email <email> --api-token <token> --board-id <id> --board-name <name> --board-type <type> --ready-status-id <id> --ready-status-name <name> --processing-status-id <id> --processing-status-name <name> --processed-status-id <id> --processed-status-name <name> [--board-filter-id <id>] [--enabled true|false]");
            Console.Error.WriteLine("  firstdraft integrations update <integration-id> [options]");
            Console.Error.WriteLine("  firstdraft integrations remove <integration-id>");
            return string.IsNullOrWhiteSpace(error) ? 0 : 1;
        }
    }
}
