using FirstDraft.Cli.Git;
using FirstDraft.Cli.Jira;

namespace FirstDraft.Configuration
{
    public sealed class WorkerEnvConfiguration
    {
        public WorkerEnvConfiguration(
            string path,
            IReadOnlySet<string> appliedFields,
            IReadOnlyList<string> gitRepositoryUrls,
            IReadOnlyList<string> jiraIntegrationIds,
            IReadOnlyDictionary<string, string> pendingJiraApiTokens,
            IReadOnlyList<string> encryptedJiraApiTokenIds,
            IReadOnlyList<string> resolvedJiraIntegrationIds)
        {
            Path = path;
            AppliedFields = appliedFields;
            GitRepositoryUrls = gitRepositoryUrls;
            JiraIntegrationIds = jiraIntegrationIds;
            PendingJiraApiTokens = pendingJiraApiTokens;
            EncryptedJiraApiTokenIds = encryptedJiraApiTokenIds;
            ResolvedJiraIntegrationIds = resolvedJiraIntegrationIds;
        }

        public string Path { get; }

        public IReadOnlySet<string> AppliedFields { get; }

        public IReadOnlyList<string> GitRepositoryUrls { get; }

        public IReadOnlyList<string> JiraIntegrationIds { get; }

        public IReadOnlyDictionary<string, string> PendingJiraApiTokens { get; }

        public IReadOnlyList<string> EncryptedJiraApiTokenIds { get; }

        public IReadOnlyList<string> ResolvedJiraIntegrationIds { get; }

        public bool HasField(string fieldName)
        {
            return AppliedFields.Contains(fieldName);
        }

        public bool HasGitRepositories => GitRepositoryUrls.Count > 0;

        public bool HasJiraIntegrations => JiraIntegrationIds.Count > 0;

        public bool HasPendingJiraApiTokens => PendingJiraApiTokens.Count > 0;

        public bool HasEncryptedJiraApiTokens => EncryptedJiraApiTokenIds.Count > 0;

        public bool HasResolvedJiraIntegrations => ResolvedJiraIntegrationIds.Count > 0;
    }

    public sealed class WorkerEnvFileService
    {
        public const string FileName = ".env";
        private const string GitPrefix = "FIRSTDRAFT_GIT_";
        private const string JiraPrefix = "FIRSTDRAFT_JIRA_";

        private static readonly Dictionary<string, string> FieldNamesByKey = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["FIRSTDRAFT_WORKER_ID"] = nameof(ApplicationData.WorkerId),
            ["FIRSTDRAFT_EXTERNAL_API"] = nameof(ApplicationData.ExternalAPI),
            ["FIRSTDRAFT_AI_PROVIDER"] = nameof(ApplicationData.AIProvider),
            ["FIRSTDRAFT_PLANNING_ENABLED"] = nameof(ApplicationData.PlanningEnabled),
            ["FIRSTDRAFT_AI_WORKING_DIRECTORY"] = nameof(ApplicationData.AIWorkingDirectory),
            ["FIRSTDRAFT_APPLICATION_FOLDER"] = nameof(ApplicationData.ApplicationFolder),
            ["FIRSTDRAFT_LOGS_FOLDER"] = nameof(ApplicationData.LogsFolder),
            ["FIRSTDRAFT_APPLICATION_PATHS"] = nameof(ApplicationData.ApplicationPaths),
            ["FIRSTDRAFT_SKILLS"] = nameof(ApplicationData.Skills),
            ["FIRSTDRAFT_MAX_CONCURRENT_TASKS"] = nameof(ApplicationData.MaxConcurrentTasks),
            ["FIRSTDRAFT_GIT_WORKSPACE_DIRECTORY"] = nameof(ApplicationData.GitWorkspaceDirectory),
            ["FIRSTDRAFT_NAME"] = nameof(ApplicationData.Name),
            ["FIRSTDRAFT_TAGS"] = nameof(ApplicationData.Tags),
            ["WORKER_API_KEY"] = nameof(ApplicationData.WorkerApiKey),
            ["WORKER_API_SECRET"] = nameof(ApplicationData.WorkerApiSecret)
        };

        public WorkerEnvConfiguration? ApplyIfExists(ApplicationData applicationData, string configDirectory)
        {
            string envPath = System.IO.Path.Join(configDirectory, FileName);
            if (!File.Exists(envPath)) return null;

            Dictionary<string, string> values = Parse(envPath);
            HashSet<string> appliedFields = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

            foreach (KeyValuePair<string, string> entry in values)
            {
                if (!FieldNamesByKey.TryGetValue(entry.Key, out string? fieldName)) continue;

                ApplyValue(applicationData, entry.Key, entry.Value);
                appliedFields.Add(fieldName);
            }

            IReadOnlyList<string> gitRepositoryUrls = ApplyGitValues(applicationData, values);
            if (gitRepositoryUrls.Count > 0)
            {
                appliedFields.Add(nameof(ApplicationData.GitRepositories));
            }

            JiraEnvApplyResult jiraResult = ApplyJiraValues(applicationData, values);
            if (jiraResult.IntegrationIds.Count > 0)
            {
                appliedFields.Add(nameof(ApplicationData.JiraIntegrations));
            }

            return new WorkerEnvConfiguration(
                envPath,
                appliedFields,
                gitRepositoryUrls,
                jiraResult.IntegrationIds,
                jiraResult.PendingApiTokens,
                jiraResult.EncryptedApiTokenIds,
                jiraResult.ResolvedIntegrationIds);
        }

        public bool ApplyPendingJiraApiTokens(ApplicationData applicationData, WorkerEnvConfiguration? envConfiguration)
        {
            if (envConfiguration == null || !envConfiguration.HasPendingJiraApiTokens) return false;
            if (string.IsNullOrEmpty(applicationData.ConfigEncryptionKey)) return false;

            List<JiraIntegrationConfig> integrations = JiraIntegrationConfigService.NormalizeIntegrations(applicationData.JiraIntegrations).ToList();
            bool changed = false;

            foreach (KeyValuePair<string, string> entry in envConfiguration.PendingJiraApiTokens)
            {
                JiraIntegrationConfig? integration = integrations.FirstOrDefault(integration =>
                    string.Equals(integration.IntegrationId, entry.Key, StringComparison.OrdinalIgnoreCase));
                if (integration == null) continue;

                integration.StoreApiToken(applicationData, entry.Value);
                TryResolveJiraMetadata(integration, entry.Value);
                changed = true;
            }

            if (changed)
            {
                applicationData.JiraIntegrations = integrations
                    .OrderBy(integration => integration.IntegrationId, StringComparer.OrdinalIgnoreCase)
                    .ToArray();
            }

            return changed;
        }

        private static Dictionary<string, string> Parse(string envPath)
        {
            Dictionary<string, string> values = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            string[] lines = File.ReadAllLines(envPath);

            for (int index = 0; index < lines.Length; index++)
            {
                string line = lines[index].Trim();
                if (string.IsNullOrWhiteSpace(line) || line.StartsWith("#")) continue;

                int separator = line.IndexOf('=');
                if (separator <= 0)
                {
                    throw new InvalidOperationException($"{envPath}:{index + 1} must use KEY=value syntax.");
                }

                string key = line.Substring(0, separator).Trim();
                string value = line.Substring(separator + 1).Trim();

                if (key.StartsWith("export ", StringComparison.OrdinalIgnoreCase))
                {
                    key = key.Substring("export ".Length).Trim();
                }

                if (string.IsNullOrWhiteSpace(key))
                {
                    throw new InvalidOperationException($"{envPath}:{index + 1} must include an environment key.");
                }

                values[key] = Unquote(value);
            }

            return values;
        }

        private static string Unquote(string value)
        {
            if (value.Length < 2) return value;

            char quote = value[0];
            if ((quote != '"' && quote != '\'') || value[value.Length - 1] != quote) return value;

            string unquoted = value.Substring(1, value.Length - 2);
            if (quote == '\'') return unquoted;

            return unquoted
                .Replace("\\n", "\n")
                .Replace("\\r", "\r")
                .Replace("\\t", "\t")
                .Replace("\\\"", "\"")
                .Replace("\\\\", "\\");
        }

        private static void ApplyValue(ApplicationData applicationData, string key, string value)
        {
            switch (key.ToUpperInvariant())
            {
                case "FIRSTDRAFT_WORKER_ID":
                    applicationData.WorkerId = RequireWorkerId(key, value);
                    break;

                case "FIRSTDRAFT_EXTERNAL_API":
                    applicationData.ExternalAPI = RequireAbsoluteHttpUrl(key, value);
                    break;

                case "FIRSTDRAFT_AI_PROVIDER":
                    applicationData.AIProvider = ParseAIProvider(key, value);
                    break;

                case "FIRSTDRAFT_PLANNING_ENABLED":
                    applicationData.PlanningEnabled = ParseBool(key, value);
                    break;

                case "FIRSTDRAFT_AI_WORKING_DIRECTORY":
                    applicationData.AIWorkingDirectory = RequireExistingDirectory(key, value);
                    break;

                case "FIRSTDRAFT_APPLICATION_FOLDER":
                    applicationData.ApplicationFolder = RequireValue(key, value);
                    break;

                case "FIRSTDRAFT_LOGS_FOLDER":
                    applicationData.LogsFolder = RequireValue(key, value);
                    break;

                case "FIRSTDRAFT_APPLICATION_PATHS":
                    applicationData.ApplicationPaths = ParseCommaSeparated(value);
                    break;

                case "FIRSTDRAFT_SKILLS":
                    applicationData.Skills = WorkerSkillRegistry.NormalizeConfiguredSkills(ParseCommaSeparated(value));
                    break;

                case "FIRSTDRAFT_MAX_CONCURRENT_TASKS":
                    applicationData.MaxConcurrentTasks = ParseOptionalCapacity(key, value);
                    break;

                case "FIRSTDRAFT_GIT_WORKSPACE_DIRECTORY":
                    applicationData.GitWorkspaceDirectory = NullIfEmpty(value);
                    break;

                case "FIRSTDRAFT_NAME":
                    applicationData.Name = NullIfEmpty(value);
                    break;

                case "FIRSTDRAFT_TAGS":
                    applicationData.Tags = ParseCommaSeparated(value);
                    break;

                case "WORKER_API_KEY":
                    applicationData.WorkerApiKey = RequireValue(key, value);
                    break;

                case "WORKER_API_SECRET":
                    applicationData.WorkerApiSecret = RequireValue(key, value);
                    break;
            }
        }

        private static IReadOnlyList<string> ApplyGitValues(ApplicationData applicationData, Dictionary<string, string> values)
        {
            Dictionary<int, Dictionary<string, string>> groups = GetGitGroups(values);
            if (groups.Count == 0) return Array.Empty<string>();

            List<GitRepositoryConfig> repositories = GitRepositoryConfigurationService.NormalizeRepositories(applicationData.GitRepositories).ToList();
            List<string> repositoryUrls = new List<string>();

            foreach (KeyValuePair<int, Dictionary<string, string>> group in groups.OrderBy(group => group.Key))
            {
                GitRepositoryConfig envRepository = BuildGitRepository(group.Key, group.Value);
                int existingIndex = repositories.FindIndex(repository =>
                    string.Equals(repository.NormalizedRepositoryUrl, envRepository.NormalizedRepositoryUrl, StringComparison.OrdinalIgnoreCase));

                if (existingIndex >= 0) repositories[existingIndex] = envRepository;
                else repositories.Add(envRepository);

                repositoryUrls.Add(envRepository.RepositoryUrl);
            }

            applicationData.GitRepositories = repositories
                .OrderBy(repository => repository.NormalizedRepositoryUrl, StringComparer.OrdinalIgnoreCase)
                .ToArray();

            return repositoryUrls;
        }

        private static Dictionary<int, Dictionary<string, string>> GetGitGroups(Dictionary<string, string> values)
        {
            Dictionary<int, Dictionary<string, string>> groups = new Dictionary<int, Dictionary<string, string>>();
            HashSet<string> supportedFields = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "REPOSITORY_URL",
                "SOURCE_BRANCH",
                "TARGET_BRANCH"
            };

            foreach (KeyValuePair<string, string> entry in values)
            {
                if (!entry.Key.StartsWith(GitPrefix, StringComparison.OrdinalIgnoreCase)) continue;
                if (FieldNamesByKey.ContainsKey(entry.Key)) continue;

                string suffix = entry.Key.Substring(GitPrefix.Length);
                int separator = suffix.IndexOf('_');
                if (separator <= 0)
                {
                    throw new InvalidOperationException($"{entry.Key} must use FIRSTDRAFT_GIT_<number>_<field> syntax.");
                }

                string indexText = suffix.Substring(0, separator);
                string field = suffix.Substring(separator + 1);
                if (!int.TryParse(indexText, out int repositoryIndex) || repositoryIndex <= 0)
                {
                    throw new InvalidOperationException($"{entry.Key} must use a positive Git repository number.");
                }

                if (!supportedFields.Contains(field))
                {
                    throw new InvalidOperationException($"{entry.Key} is not a supported Git repository .env field.");
                }

                if (!groups.TryGetValue(repositoryIndex, out Dictionary<string, string>? group))
                {
                    group = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    groups[repositoryIndex] = group;
                }

                group[field] = entry.Value;
            }

            return groups;
        }

        private static GitRepositoryConfig BuildGitRepository(int index, Dictionary<string, string> values)
        {
            string prefix = $"{GitPrefix}{index}_";
            string repositoryUrl = GetRequired(values, "REPOSITORY_URL", prefix);
            string sourceBranch = values.TryGetValue("SOURCE_BRANCH", out string? source) && !string.IsNullOrWhiteSpace(source)
                ? source
                : "main";
            string targetBranch = values.TryGetValue("TARGET_BRANCH", out string? target) && !string.IsNullOrWhiteSpace(target)
                ? target
                : sourceBranch;

            try
            {
                return GitRepositoryConfigurationService.BuildRepositoryConfig(repositoryUrl, sourceBranch, targetBranch);
            }
            catch (InvalidOperationException ex)
            {
                throw new InvalidOperationException($"{prefix}{ex.Message}", ex);
            }
        }

        private static JiraEnvApplyResult ApplyJiraValues(ApplicationData applicationData, Dictionary<string, string> values)
        {
            Dictionary<int, Dictionary<string, string>> groups = GetJiraGroups(values);
            if (groups.Count == 0) return JiraEnvApplyResult.Empty;

            List<JiraIntegrationConfig> integrations = JiraIntegrationConfigService.NormalizeIntegrations(applicationData.JiraIntegrations).ToList();
            List<string> integrationIds = new List<string>();
            Dictionary<string, string> pendingApiTokens = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            List<string> encryptedApiTokenIds = new List<string>();
            List<string> resolvedIntegrationIds = new List<string>();

            foreach (KeyValuePair<int, Dictionary<string, string>> group in groups.OrderBy(group => group.Key))
            {
                string integrationId = ResolveJiraIntegrationId(group.Key, group.Value);
                int existingIndex = integrations.FindIndex(integration =>
                    string.Equals(integration.IntegrationId, integrationId, StringComparison.OrdinalIgnoreCase));
                JiraIntegrationConfig? existingIntegration = existingIndex >= 0 ? integrations[existingIndex] : null;
                JiraIntegrationConfig envIntegration = BuildJiraIntegration(group.Key, group.Value, integrationId, existingIntegration);

                if (existingIndex >= 0)
                {
                    envIntegration.EncryptedApiToken = existingIntegration!.EncryptedApiToken;
                    integrations[existingIndex] = envIntegration;
                }
                else
                {
                    integrations.Add(envIntegration);
                }

                integrationIds.Add(envIntegration.IntegrationId);

                string? apiToken = GetOptionalString(group.Value, "API_KEY", "API_TOKEN");
                if (!string.IsNullOrWhiteSpace(apiToken))
                {
                    string trimmedApiToken = apiToken.Trim();
                    if (!string.IsNullOrEmpty(applicationData.ConfigEncryptionKey))
                    {
                        if (!string.Equals(envIntegration.GetApiToken(applicationData), trimmedApiToken, StringComparison.Ordinal))
                        {
                            envIntegration.StoreApiToken(applicationData, trimmedApiToken);
                            encryptedApiTokenIds.Add(envIntegration.IntegrationId);
                        }
                    }
                    else
                    {
                        pendingApiTokens[envIntegration.IntegrationId] = trimmedApiToken;
                    }
                }

                string readableApiToken = envIntegration.GetApiToken(applicationData);
                if (!string.IsNullOrWhiteSpace(readableApiToken) && TryResolveJiraMetadata(envIntegration, readableApiToken))
                {
                    resolvedIntegrationIds.Add(envIntegration.IntegrationId);
                }
            }

            applicationData.JiraIntegrations = integrations
                .OrderBy(integration => integration.IntegrationId, StringComparer.OrdinalIgnoreCase)
                .ToArray();

            return new JiraEnvApplyResult(integrationIds, pendingApiTokens, encryptedApiTokenIds, resolvedIntegrationIds);
        }

        private static Dictionary<int, Dictionary<string, string>> GetJiraGroups(Dictionary<string, string> values)
        {
            Dictionary<int, Dictionary<string, string>> groups = new Dictionary<int, Dictionary<string, string>>();
            HashSet<string> supportedFields = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "ID",
                "ENABLED",
                "SITE_URL",
                "EMAIL",
                "API_KEY",
                "API_TOKEN",
                "BOARD_ID",
                "BOARD_NAME",
                "BOARD_TYPE",
                "BOARD_FILTER_ID",
                "READY_STATUS_ID",
                "READY_STATUS",
                "READY_STATUS_NAME",
                "PROCESSING_STATUS_ID",
                "PROCESSING_STATUS",
                "PROCESSING_STATUS_NAME",
                "PROCESSED_STATUS_ID",
                "PROCESSED_STATUS",
                "PROCESSED_STATUS_NAME",
                "ASSIGNEES"
            };

            foreach (KeyValuePair<string, string> entry in values)
            {
                if (!entry.Key.StartsWith(JiraPrefix, StringComparison.OrdinalIgnoreCase)) continue;

                string suffix = entry.Key.Substring(JiraPrefix.Length);
                int separator = suffix.IndexOf('_');
                if (separator <= 0)
                {
                    throw new InvalidOperationException($"{entry.Key} must use FIRSTDRAFT_JIRA_<number>_<field> syntax.");
                }

                string indexText = suffix.Substring(0, separator);
                string field = suffix.Substring(separator + 1);
                if (!int.TryParse(indexText, out int integrationIndex) || integrationIndex <= 0)
                {
                    throw new InvalidOperationException($"{entry.Key} must use a positive Jira integration number.");
                }

                if (!supportedFields.Contains(field))
                {
                    throw new InvalidOperationException($"{entry.Key} is not a supported Jira .env field.");
                }

                if (!groups.TryGetValue(integrationIndex, out Dictionary<string, string>? group))
                {
                    group = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                    groups[integrationIndex] = group;
                }

                group[field] = entry.Value;
            }

            return groups;
        }

        private static string ResolveJiraIntegrationId(int index, Dictionary<string, string> values)
        {
            string prefix = $"{JiraPrefix}{index}_";
            string integrationId = values.TryGetValue("ID", out string? configuredId) && !string.IsNullOrWhiteSpace(configuredId)
                ? configuredId
                : DefaultJiraIntegrationId(index);
            string? normalizedIntegrationId = JiraIntegrationConfigService.NormalizeIntegrationId(integrationId);
            if (normalizedIntegrationId == null)
            {
                throw new InvalidOperationException($"{prefix}ID must be 5 lowercase alphanumeric characters.");
            }

            return normalizedIntegrationId;
        }

        private static JiraIntegrationConfig BuildJiraIntegration(
            int index,
            Dictionary<string, string> values,
            string integrationId,
            JiraIntegrationConfig? existingIntegration)
        {
            string prefix = $"{JiraPrefix}{index}_";
            string siteUrl = values.TryGetValue("SITE_URL", out string? configuredSiteUrl) && !string.IsNullOrWhiteSpace(configuredSiteUrl)
                ? configuredSiteUrl
                : existingIntegration?.SiteUrl ?? string.Empty;

            JiraIntegrationConfig integration = new JiraIntegrationConfig
            {
                IntegrationId = integrationId,
                Enabled = values.TryGetValue("ENABLED", out string? enabled) ? ParseBool($"{prefix}ENABLED", enabled) : true,
                SiteUrl = JiraIntegrationConfigService.CleanSiteUrl(siteUrl),
                Email = GetRequired(values, "EMAIL", prefix).Trim(),
                BoardId = GetOptionalInt(values, "BOARD_ID", prefix, minimum: 1),
                BoardName = GetRequired(values, "BOARD_NAME", prefix).Trim(),
                BoardType = GetOptionalString(values, "BOARD_TYPE"),
                BoardFilterId = GetOptionalInt(values, "BOARD_FILTER_ID", prefix, minimum: 1),
                ReadyStatusId = GetOptionalString(values, "READY_STATUS_ID"),
                ReadyStatusName = GetOptionalString(values, "READY_STATUS_NAME", "READY_STATUS"),
                ProcessingStatusId = GetOptionalString(values, "PROCESSING_STATUS_ID"),
                ProcessingStatusName = GetOptionalString(values, "PROCESSING_STATUS_NAME", "PROCESSING_STATUS"),
                ProcessedStatusId = GetOptionalString(values, "PROCESSED_STATUS_ID"),
                ProcessedStatusName = GetOptionalString(values, "PROCESSED_STATUS_NAME", "PROCESSED_STATUS"),
                Assignees = values.TryGetValue("ASSIGNEES", out string? assignees)
                    ? ParseAssignees($"{prefix}ASSIGNEES", assignees)
                    : Array.Empty<JiraAssigneeConfig>()
            };

            string? siteError = JiraIntegrationConfigService.ValidateSiteUrl(integration.SiteUrl);
            if (siteError != null) throw new InvalidOperationException($"{prefix}SITE_URL: {siteError}");

            string? emailError = JiraIntegrationConfigService.ValidateEmail(integration.Email, $"{prefix}EMAIL");
            if (emailError != null) throw new InvalidOperationException(emailError);

            RequireNamedStatus(integration.ReadyStatusName, $"{prefix}READY_STATUS");
            RequireNamedStatus(integration.ProcessingStatusName, $"{prefix}PROCESSING_STATUS");
            RequireNamedStatus(integration.ProcessedStatusName, $"{prefix}PROCESSED_STATUS");

            return integration;
        }

        private static bool TryResolveJiraMetadata(JiraIntegrationConfig integration, string apiToken)
        {
            if (!NeedsJiraMetadataResolution(integration)) return false;

            using JiraCliClient jira = new JiraCliClient(integration.SiteUrl, integration.Email, apiToken);
            ResolveJiraMetadata(jira, integration).GetAwaiter().GetResult();
            return true;
        }

        private static async Task ResolveJiraMetadata(JiraCliClient jira, JiraIntegrationConfig integration)
        {
            await jira.TestConnection();

            JiraBoardOption[] boards = await jira.ListBoards();
            JiraBoardOption board = ResolveSingle(
                boards.Where(board => string.Equals(board.Name.Trim(), integration.BoardName.Trim(), StringComparison.OrdinalIgnoreCase)),
                $"Jira board '{integration.BoardName}'");

            JiraBoardConfiguration boardConfiguration = await jira.GetBoardConfiguration(board.Id);
            JiraStatusOption[] statuses = await jira.GetBoardStatuses(boardConfiguration);

            JiraStatusOption ready = ResolveStatus(statuses, integration.ReadyStatusName, "ready");
            JiraStatusOption processing = ResolveStatus(statuses, integration.ProcessingStatusName, "processing");
            JiraStatusOption processed = ResolveStatus(statuses, integration.ProcessedStatusName, "processed");

            integration.BoardId = board.Id;
            integration.BoardName = board.Name;
            integration.BoardType = board.Type;
            integration.BoardFilterId = boardConfiguration.FilterId;
            integration.ReadyStatusId = ready.Id;
            integration.ReadyStatusName = ready.Name;
            integration.ProcessingStatusId = processing.Id;
            integration.ProcessingStatusName = processing.Name;
            integration.ProcessedStatusId = processed.Id;
            integration.ProcessedStatusName = processed.Name;
        }

        private static JiraStatusOption ResolveStatus(IEnumerable<JiraStatusOption> statuses, string statusName, string label)
        {
            return ResolveSingle(
                statuses.Where(status => string.Equals(status.Name.Trim(), statusName.Trim(), StringComparison.OrdinalIgnoreCase)),
                $"Jira {label} status '{statusName}'");
        }

        private static T ResolveSingle<T>(IEnumerable<T> matches, string label)
        {
            T[] resolved = matches.ToArray();
            if (resolved.Length == 0) throw new InvalidOperationException($"{label} was not found.");
            if (resolved.Length > 1) throw new InvalidOperationException($"{label} matched multiple Jira records.");
            return resolved[0];
        }

        private static bool NeedsJiraMetadataResolution(JiraIntegrationConfig integration)
        {
            return !integration.BoardId.HasValue ||
                   integration.BoardId.Value <= 0 ||
                   string.IsNullOrWhiteSpace(integration.BoardType) ||
                   string.IsNullOrWhiteSpace(integration.ReadyStatusId) ||
                   string.IsNullOrWhiteSpace(integration.ProcessingStatusId) ||
                   string.IsNullOrWhiteSpace(integration.ProcessedStatusId);
        }

        private static void RequireNamedStatus(string value, string key)
        {
            if (string.IsNullOrWhiteSpace(value)) throw new InvalidOperationException($"{key} is required.");
        }

        private static string DefaultJiraIntegrationId(int index)
        {
            if (index <= 99) return $"jir{index:00}";
            return JiraIntegrationConfigService.GenerateIntegrationIdFromSeed($"jira:{index}");
        }

        private static string GetRequired(Dictionary<string, string> values, string field, string prefix)
        {
            if (!values.TryGetValue(field, out string? value) || string.IsNullOrWhiteSpace(value))
            {
                throw new InvalidOperationException($"{prefix}{field} is required.");
            }

            return value;
        }

        private static string GetOptionalString(Dictionary<string, string> values, string field)
        {
            return values.TryGetValue(field, out string? value) ? value.Trim() : string.Empty;
        }

        private static string GetOptionalString(Dictionary<string, string> values, string preferredField, string fallbackField)
        {
            string value = GetOptionalString(values, preferredField);
            return string.IsNullOrWhiteSpace(value) ? GetOptionalString(values, fallbackField) : value;
        }

        private static int? GetOptionalInt(Dictionary<string, string> values, string field, string prefix, int minimum)
        {
            if (!values.TryGetValue(field, out string? value) || string.IsNullOrWhiteSpace(value)) return null;

            if (!int.TryParse(value, out int parsed) || parsed < minimum)
            {
                throw new InvalidOperationException($"{prefix}{field} must be a number greater than or equal to {minimum}.");
            }

            return parsed;
        }

        private static JiraAssigneeConfig[] ParseAssignees(string key, string value)
        {
            if (string.IsNullOrWhiteSpace(value) ||
                string.Equals(value, "none", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(value, "any", StringComparison.OrdinalIgnoreCase))
            {
                return Array.Empty<JiraAssigneeConfig>();
            }

            return value
                .Split(';')
                .Select(entry => ParseAssignee(key, entry))
                .Where(assignee => !string.IsNullOrWhiteSpace(assignee.AccountId))
                .ToArray();
        }

        private static JiraAssigneeConfig ParseAssignee(string key, string value)
        {
            string[] parts = value.Split('|');
            if (parts.Length > 3)
            {
                throw new InvalidOperationException($"{key} assignees must use accountId|displayName|emailAddress entries separated by semicolons.");
            }

            string accountId = parts.Length > 0 ? parts[0].Trim() : string.Empty;
            if (string.IsNullOrWhiteSpace(accountId))
            {
                throw new InvalidOperationException($"{key} assignee accountId cannot be empty.");
            }

            return new JiraAssigneeConfig
            {
                AccountId = accountId,
                DisplayName = parts.Length > 1 ? parts[1].Trim() : string.Empty,
                EmailAddress = parts.Length > 2 ? parts[2].Trim() : string.Empty
            };
        }

        private static string RequireValue(string key, string value)
        {
            if (string.IsNullOrWhiteSpace(value)) throw new InvalidOperationException($"{key} cannot be empty.");
            return value;
        }

        private static string RequireWorkerId(string key, string value)
        {
            string workerId = RequireValue(key, value);
            if (workerId.Contains('.')) throw new InvalidOperationException($"{key} cannot contain a .");
            if (workerId.Contains('?')) throw new InvalidOperationException($"{key} cannot contain a ?");
            if (workerId.Contains('/')) throw new InvalidOperationException($"{key} cannot contain a /");
            if (workerId.Contains('\\')) throw new InvalidOperationException($"{key} cannot contain a \\");
            if (workerId.Contains('&')) throw new InvalidOperationException($"{key} cannot contain a &");
            if (workerId.Contains('#')) throw new InvalidOperationException($"{key} cannot contain a #");

            return workerId;
        }

        private static string RequireExistingDirectory(string key, string value)
        {
            string directory = RequireValue(key, value);
            if (!Directory.Exists(directory))
            {
                throw new InvalidOperationException($"{key} must be an existing directory.");
            }

            return directory;
        }

        private static string RequireAbsoluteHttpUrl(string key, string value)
        {
            string required = RequireValue(key, value);
            if (!Uri.TryCreate(required, UriKind.Absolute, out Uri? uri) ||
                (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps))
            {
                throw new InvalidOperationException($"{key} must be an absolute http:// or https:// URL.");
            }

            return required;
        }

        private static AIProvider ParseAIProvider(string key, string value)
        {
            if (Enum.TryParse(value, true, out AIProvider provider) && provider != AIProvider.None)
            {
                return provider;
            }

            throw new InvalidOperationException($"{key} must be Codex or Claude.");
        }

        private static bool ParseBool(string key, string value)
        {
            if (bool.TryParse(value, out bool parsed)) return parsed;

            if (string.Equals(value, "1", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(value, "yes", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(value, "y", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }

            if (string.Equals(value, "0", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(value, "no", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(value, "n", StringComparison.OrdinalIgnoreCase))
            {
                return false;
            }

            throw new InvalidOperationException($"{key} must be true or false.");
        }

        private static int? ParseOptionalCapacity(string key, string value)
        {
            if (string.IsNullOrWhiteSpace(value) ||
                string.Equals(value, "null", StringComparison.OrdinalIgnoreCase) ||
                string.Equals(value, "unlimited", StringComparison.OrdinalIgnoreCase))
            {
                return null;
            }

            if (!int.TryParse(value, out int capacity) || capacity < 1 || capacity > 8)
            {
                throw new InvalidOperationException($"{key} must be 1 through 8, null, or unlimited.");
            }

            return capacity;
        }

        private static string[] ParseCommaSeparated(string value)
        {
            if (string.IsNullOrWhiteSpace(value) ||
                string.Equals(value, "none", StringComparison.OrdinalIgnoreCase) ||
                value == "*")
            {
                return Array.Empty<string>();
            }

            return value
                .Split(',')
                .Select(part => part.Trim())
                .Where(part => !string.IsNullOrWhiteSpace(part))
                .ToArray();
        }

        private static string? NullIfEmpty(string value)
        {
            return string.IsNullOrWhiteSpace(value) ? null : value;
        }

        private sealed class JiraEnvApplyResult
        {
            public static readonly JiraEnvApplyResult Empty = new JiraEnvApplyResult(
                Array.Empty<string>(),
                new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase),
                Array.Empty<string>(),
                Array.Empty<string>());

            public JiraEnvApplyResult(
                IReadOnlyList<string> integrationIds,
                IReadOnlyDictionary<string, string> pendingApiTokens,
                IReadOnlyList<string> encryptedApiTokenIds,
                IReadOnlyList<string> resolvedIntegrationIds)
            {
                IntegrationIds = integrationIds;
                PendingApiTokens = pendingApiTokens;
                EncryptedApiTokenIds = encryptedApiTokenIds;
                ResolvedIntegrationIds = resolvedIntegrationIds;
            }

            public IReadOnlyList<string> IntegrationIds { get; }

            public IReadOnlyDictionary<string, string> PendingApiTokens { get; }

            public IReadOnlyList<string> EncryptedApiTokenIds { get; }

            public IReadOnlyList<string> ResolvedIntegrationIds { get; }
        }
    }
}
