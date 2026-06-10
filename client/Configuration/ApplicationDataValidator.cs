namespace FirstDraft.Configuration
{
    public static class ApplicationDataValidator
    {
        public static void Validate(ApplicationData applicationData)
        {
            if (string.IsNullOrEmpty(applicationData.WorkerId)) throw new Exception("You must provide a valid WorkerId");

            ValidateWorkerId(applicationData.WorkerId);

            bool hasApiKey = !string.IsNullOrWhiteSpace(applicationData.WorkerApiKey);
            bool hasApiSecret = !string.IsNullOrWhiteSpace(applicationData.WorkerApiSecret);
            if (hasApiKey != hasApiSecret) throw new Exception("WORKER_API_KEY and WORKER_API_SECRET must both be set or both be omitted");
            if (string.IsNullOrEmpty(applicationData.GetWorkerRefreshToken()) && !applicationData.HasWorkerApiCredentials()) throw new Exception("You must authenticate this worker with firstdraft init or configure WORKER_API_KEY and WORKER_API_SECRET");

            if (string.IsNullOrEmpty(applicationData.ApplicationFolder)) throw new Exception("You must provide a valid ApplicationFolder");

            if (string.IsNullOrEmpty(applicationData.LogsFolder)) throw new Exception("You must provide a valid LogsFolder");

            if (string.IsNullOrEmpty(applicationData.ExternalAPI)) throw new Exception("You must provide a valid ExternalAPI");

            if (applicationData.AIProvider == AIProvider.None) throw new Exception("You must provide a valid AIProvider (Codex or Claude)");

            WorkerSkillRegistry.NormalizeConfiguredSkills(applicationData.Skills);

            WorkerTaskTypeRegistry.ResolveEnabledTaskTypes(applicationData.EnabledTaskTypes);

            if (applicationData.MaxConcurrentTasks.HasValue && (applicationData.MaxConcurrentTasks < 1 || applicationData.MaxConcurrentTasks > 8)) throw new Exception("MaxConcurrentTasks must be between 1 and 8, or unset for unlimited");
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
