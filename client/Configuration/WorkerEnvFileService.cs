namespace FirstDraft.Configuration
{
    public sealed class WorkerEnvConfiguration
    {
        public WorkerEnvConfiguration(string path, IReadOnlySet<string> appliedFields)
        {
            Path = path;
            AppliedFields = appliedFields;
        }

        public string Path { get; }

        public IReadOnlySet<string> AppliedFields { get; }

        public bool HasField(string fieldName)
        {
            return AppliedFields.Contains(fieldName);
        }
    }

    public sealed class WorkerEnvFileService
    {
        public const string FileName = ".env";

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
            ["FIRSTDRAFT_TAGS"] = nameof(ApplicationData.Tags)
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

            return new WorkerEnvConfiguration(envPath, appliedFields);
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
            }
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
    }
}
