namespace FirstDraft.Configuration
{
    public static class ApplicationDataValidator
    {
        public static void Validate(ApplicationData applicationData)
        {
            if (string.IsNullOrEmpty(applicationData.WorkerId)) throw new Exception("You must provide a valid WorkerId");

            ValidateWorkerId(applicationData.WorkerId);

            if (string.IsNullOrEmpty(applicationData.GetApiKey())) throw new Exception("You must provide a valid ApiKey");

            if (string.IsNullOrEmpty(applicationData.GetApiSecret())) throw new Exception("You must provide a valid ApiSecret");

            if (string.IsNullOrEmpty(applicationData.ApplicationFolder)) throw new Exception("You must provide a valid ApplicationFolder");

            if (string.IsNullOrEmpty(applicationData.LogsFolder)) throw new Exception("You must provide a valid LogsFolder");

            if (string.IsNullOrEmpty(applicationData.ExternalAPI)) throw new Exception("You must provide a valid ExternalAPI");

            if (applicationData.AIProvider == AIProvider.None) throw new Exception("You must provide a valid AIProvider (Codex or Claude)");

            WorkerSkillRegistry.NormalizeConfiguredSkills(applicationData.Skills);

            WorkerTaskTypeRegistry.ResolveEnabledTaskTypes(applicationData.EnabledTaskTypes);

            if (applicationData.MaxConcurrentTasks < 1 || applicationData.MaxConcurrentTasks > 8) throw new Exception("MaxConcurrentTasks must be between 1 and 8");
        }

        private static void ValidateWorkerId(string workerId)
        {
            if (workerId.Contains('.')) throw new Exception("A WorkerId cannot contain a .");
            if (workerId.Contains('?')) throw new Exception("A WorkerId cannot contain a ?");
            if (workerId.Contains('/')) throw new Exception("A WorkerId cannot contain a /");
            if (workerId.Contains('\\')) throw new Exception("A WorkerId cannot contain a \\");
            if (workerId.Contains('&')) throw new Exception("A WorkerId cannot contain a &");
            if (workerId.Contains('#')) throw new Exception("A WorkerId cannot contain a #");
        }
    }
}
