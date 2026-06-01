using FirstDraft.Configuration;

namespace FirstDraft.Api.Hub
{
    internal static class WorkerApiSettings
    {
        public static int? GetMaxConcurrentTasks(ApplicationData applicationData)
        {
            return applicationData.MaxConcurrentTasks.HasValue
                ? Math.Clamp(applicationData.MaxConcurrentTasks.Value, 1, 8)
                : null;
        }

        public static string FormatMaxConcurrentTasks(ApplicationData applicationData)
        {
            int? maxConcurrentTasks = GetMaxConcurrentTasks(applicationData);
            return maxConcurrentTasks.HasValue ? maxConcurrentTasks.Value.ToString() : "unlimited";
        }
    }
}
