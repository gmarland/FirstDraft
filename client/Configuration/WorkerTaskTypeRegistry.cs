namespace FirstDraft.Configuration
{
    public static class WorkerTaskTypeRegistry
    {
        private static readonly string[] SupportedTaskTypes = new[] { "ai", "shell", "gitflow" };

        public static string[] KnownTaskTypes => SupportedTaskTypes.ToArray();

        public static string[] ResolveEnabledTaskTypes(string[]? configuredTaskTypes)
        {
            string[] normalizedTaskTypes = NormalizeConfiguredTaskTypes(configuredTaskTypes);
            return normalizedTaskTypes.Length > 0 ? normalizedTaskTypes : KnownTaskTypes;
        }

        public static string[] NormalizeConfiguredTaskTypes(string[]? configuredTaskTypes)
        {
            if (configuredTaskTypes == null || configuredTaskTypes.Length == 0) return Array.Empty<string>();

            List<string> taskTypes = new List<string>();
            foreach (string configuredTaskType in configuredTaskTypes)
            {
                string taskType = configuredTaskType.Trim().ToLowerInvariant();
                if (string.IsNullOrEmpty(taskType)) continue;

                if (!SupportedTaskTypes.Contains(taskType, StringComparer.OrdinalIgnoreCase))
                {
                    throw new InvalidOperationException($"Unsupported worker task type: {configuredTaskType}");
                }

                if (!taskTypes.Contains(taskType, StringComparer.OrdinalIgnoreCase))
                {
                    taskTypes.Add(taskType);
                }
            }

            return taskTypes.ToArray();
        }

        public static void ValidateCommandTaskType(string commandMode, string[]? configuredTaskTypes)
        {
            string[] enabledTaskTypes = ResolveEnabledTaskTypes(configuredTaskTypes);
            if (!enabledTaskTypes.Contains(commandMode, StringComparer.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException($"Command mode '{commandMode}' is not enabled for this worker.");
            }
        }
    }
}
