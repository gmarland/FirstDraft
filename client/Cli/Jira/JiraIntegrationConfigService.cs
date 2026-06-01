using System.Net.Mail;
using System.Security.Cryptography;
using FirstDraft.Configuration;

namespace FirstDraft.Cli.Jira
{
    public static class JiraIntegrationConfigService
    {
        private const int IntegrationIdLength = 5;
        private const int GenerateIntegrationIdMaxAttempts = 100;
        private const string IntegrationIdCharacters = "abcdefghijklmnopqrstuvwxyz0123456789";

        public static JiraIntegrationConfig[] NormalizeIntegrations(JiraIntegrationConfig[]? integrations)
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
                        ProcessedStatusName = (integration.ProcessedStatusName ?? string.Empty).Trim(),
                        Assignees = NormalizeAssignees(integration.Assignees)
                    };
                })
                .GroupBy(integration => integration.IntegrationId, StringComparer.OrdinalIgnoreCase)
                .Select(group => group.Last())
                .OrderBy(integration => integration.IntegrationId, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }

        public static object[] BuildRegistrationPayload(ApplicationData applicationData)
        {
            return NormalizeIntegrations(applicationData.JiraIntegrations)
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
                    processedStatusName = integration.ProcessedStatusName,
                    assignees = NormalizeAssignees(integration.Assignees).Select(assignee => new
                    {
                        accountId = assignee.AccountId,
                        displayName = assignee.DisplayName,
                        emailAddress = assignee.EmailAddress
                    }).ToArray()
                })
                .ToArray();
        }

        public static string? ValidateIntegration(ApplicationData applicationData, JiraIntegrationConfig integration, bool requireReadableToken = true)
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

        public static string GetIntegrationStatus(ApplicationData applicationData, JiraIntegrationConfig integration)
        {
            if (ValidateIntegration(applicationData, integration, requireReadableToken: false) == null) return "configured";
            if (ValidateSavedConnection(applicationData, integration, requireReadableToken: false) == null) return "connection";
            return "incomplete";
        }

        public static string? ValidateConnectionFields(string? siteUrl, string? email, string? apiToken)
        {
            string? siteError = ValidateSiteUrl(siteUrl);
            if (siteError != null) return siteError;
            string? emailError = ValidateEmail(email, "--email");
            if (emailError != null) return emailError;
            if (string.IsNullOrWhiteSpace(apiToken)) return "--api-token is required.";
            return null;
        }

        public static string? ValidateSavedConnection(ApplicationData applicationData, JiraIntegrationConfig integration, bool requireReadableToken = true)
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

        public static string? ValidateEmail(string? email, string label)
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

        public static string? ValidateSiteUrl(string? siteUrl)
        {
            if (string.IsNullOrWhiteSpace(siteUrl)) return "Jira site URL is required.";
            if (!Uri.TryCreate(siteUrl, UriKind.Absolute, out Uri? uri) ||
                (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            {
                return "Jira site URL must be an absolute http or https URL.";
            }

            return null;
        }

        public static string? GenerateUniqueIntegrationId(IEnumerable<JiraIntegrationConfig> integrations)
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

        public static string? NormalizeIntegrationId(string? integrationId)
        {
            string normalized = (integrationId ?? string.Empty).Trim();
            if (normalized.Length != IntegrationIdLength) return null;
            return normalized.All(character =>
                (character >= 'a' && character <= 'z') ||
                (character >= '0' && character <= '9'))
                ? normalized
                : null;
        }

        public static string CleanSiteUrl(string? value)
        {
            return (value ?? string.Empty).Trim().TrimEnd('/');
        }

        public static bool HasStoredApiToken(JiraIntegrationConfig integration)
        {
            return integration.EncryptedApiToken != null;
        }

        public static JiraAssigneeConfig[] NormalizeAssignees(JiraAssigneeConfig[]? assignees)
        {
            if (assignees == null || assignees.Length == 0) return Array.Empty<JiraAssigneeConfig>();

            return assignees
                .Select(assignee => new JiraAssigneeConfig
                {
                    AccountId = (assignee.AccountId ?? string.Empty).Trim(),
                    DisplayName = (assignee.DisplayName ?? string.Empty).Trim(),
                    EmailAddress = (assignee.EmailAddress ?? string.Empty).Trim()
                })
                .Where(assignee => !string.IsNullOrWhiteSpace(assignee.AccountId))
                .GroupBy(assignee => assignee.AccountId, StringComparer.OrdinalIgnoreCase)
                .Select(group => group.Last())
                .OrderBy(assignee => assignee.DisplayName, StringComparer.OrdinalIgnoreCase)
                .ThenBy(assignee => assignee.EmailAddress, StringComparer.OrdinalIgnoreCase)
                .ThenBy(assignee => assignee.AccountId, StringComparer.OrdinalIgnoreCase)
                .ToArray();
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
    }
}
