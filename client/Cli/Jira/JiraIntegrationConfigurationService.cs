using FirstDraft.Configuration;
using FirstDraft.Cli.Common;

namespace FirstDraft.Cli.Jira
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
            JiraIntegrationConfig[] integrations = JiraIntegrationConfigService.NormalizeIntegrations(applicationData.JiraIntegrations);

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
                    JiraIntegrationConfigService.GetIntegrationStatus(applicationData, integration),
                    integration.Enabled ? "yes" : "no",
                    integration.SiteUrl,
                    integration.Email,
                    integration.BoardName,
                    integration.ReadyStatusName,
                    integration.ProcessingStatusName,
                    integration.ProcessedStatusName,
                    JiraIntegrationConfigService.HasStoredApiToken(integration) ? "configured" : "missing");
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
            List<JiraIntegrationConfig> integrations = JiraIntegrationConfigService.NormalizeIntegrations(applicationData.JiraIntegrations).ToList();

            if (string.IsNullOrEmpty(applicationData.ConfigEncryptionKey))
            {
                Console.Error.WriteLine("ConfigEncryptionKey is required before saving Jira API tokens. Run firstdraft init to authenticate this worker.");
                return 1;
            }

            Console.WriteLine("Add Jira integration");
            string siteUrl = ConsolePrompt.PromptUntilValid("Jira site URL", string.Empty, JiraIntegrationConfigService.ValidateSiteUrl);
            string email = ConsolePrompt.PromptUntilValid("Jira email", string.Empty, value => JiraIntegrationConfigService.ValidateEmail(value, "Jira email"));
            string apiToken = ConsolePrompt.PromptSensitiveRequired("Jira API token");
            string? connectionError = JiraIntegrationConfigService.ValidateConnectionFields(siteUrl, email, apiToken);
            if (connectionError != null) return PrintIntegrationsHelp(connectionError);

            string? integrationId = JiraIntegrationConfigService.GenerateUniqueIntegrationId(integrations);
            if (integrationId == null)
            {
                Console.Error.WriteLine("Unable to generate a unique Jira integration ID. Remove unused integrations and try again.");
                return 1;
            }

            JiraIntegrationConfig integration = new JiraIntegrationConfig
            {
                IntegrationId = integrationId,
                Enabled = false,
                SiteUrl = JiraIntegrationConfigService.CleanSiteUrl(siteUrl),
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
            string? integrationId = JiraIntegrationConfigService.NormalizeIntegrationId(args[0]);
            if (integrationId == null) return PrintIntegrationsHelp("Integration ID must be 5 lowercase alphanumeric characters.");
            if (args.Length > 1) return PrintIntegrationsHelp("Configure is interactive and does not accept option flags.");
            if (Console.IsInputRedirected || Console.IsOutputRedirected)
            {
                Console.Error.WriteLine("Interactive Jira configuration requires a terminal.");
                return 1;
            }

            ApplicationData applicationData = await _applicationDataService.GetApplicationData();
            List<JiraIntegrationConfig> integrations = JiraIntegrationConfigService.NormalizeIntegrations(applicationData.JiraIntegrations).ToList();
            int existingIndex = integrations.FindIndex(integration =>
                string.Equals(integration.IntegrationId, integrationId, StringComparison.OrdinalIgnoreCase));

            if (existingIndex < 0)
            {
                Console.Error.WriteLine("Jira integration is not configured. Use firstdraft integrations add jira to add it.");
                return 1;
            }

            JiraIntegrationConfig saved = integrations[existingIndex];
            saved.IntegrationId = integrationId;
            string? connectionError = JiraIntegrationConfigService.ValidateSavedConnection(applicationData, saved);
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

                JiraBoardOption board = ConsolePrompt.PromptSelection("Board", boards, FormatBoard);
                JiraBoardConfiguration boardConfiguration = await jira.GetBoardConfiguration(board.Id);
                JiraStatusOption[] statuses = await jira.GetBoardStatuses(boardConfiguration);
                if (statuses.Length == 0)
                {
                    Console.Error.WriteLine("No Jira statuses were returned for the selected board.");
                    return 1;
                }

                JiraStatusOption ready = ConsolePrompt.PromptSelection("Ready for AI status", statuses, FormatStatus);
                JiraStatusOption processing = ConsolePrompt.PromptSelection("AI Processing status", statuses, FormatStatus);
                JiraStatusOption processed = ConsolePrompt.PromptSelection("Processed by AI status", statuses, FormatStatus);

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

            string? validationError = JiraIntegrationConfigService.ValidateIntegration(applicationData, saved, requireReadableToken: false);
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
            string? integrationId = JiraIntegrationConfigService.NormalizeIntegrationId(args[0]);
            if (integrationId == null) return PrintIntegrationsHelp("Integration ID must be 5 lowercase alphanumeric characters.");

            ApplicationData applicationData = await _applicationDataService.GetApplicationData();
            List<JiraIntegrationConfig> integrations = JiraIntegrationConfigService.NormalizeIntegrations(applicationData.JiraIntegrations).ToList();
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

        private static string FormatBoard(JiraBoardOption board)
        {
            return $"{board.Name}";
        }

        private static string FormatStatus(JiraStatusOption status)
        {
            return status.Name;
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
            Console.Error.WriteLine("  firstdraft integrations add jira");
            Console.Error.WriteLine("  firstdraft integrations configure <integration-id>");
            Console.Error.WriteLine("  firstdraft integrations remove <integration-id>");
            return string.IsNullOrWhiteSpace(error) ? 0 : 1;
        }
    }
}
