namespace FirstDraft.Configuration
{
    public static class WorkerTaskTypeRegistry
    {
        private static readonly string[] SupportedTaskTypes = new[] { "gitflow" };

        public static string[] KnownTaskTypes => SupportedTaskTypes.ToArray();

        public static string[] ResolveEnabledTaskTypes(string[]? configuredTaskTypes)
        {
            return KnownTaskTypes;
        }

        public static string[] NormalizeConfiguredTaskTypes(string[]? configuredTaskTypes)
        {
            return ResolveEnabledTaskTypes(configuredTaskTypes);
        }

        public static void ValidateCommandTaskType(string commandMode, string[]? configuredTaskTypes)
        {
            if (!string.Equals(commandMode, "gitflow", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException($"Unsupported command mode: {commandMode}");
            }
        }
    }
}
