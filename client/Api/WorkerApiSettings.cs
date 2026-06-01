using FirstDraft.Configuration;

namespace FirstDraft.Api
{
    internal static class WorkerApiSettings
    {
        public static int GetMaxConcurrentTasks(ApplicationData applicationData)
        {
            return Math.Clamp(applicationData.MaxConcurrentTasks, 1, 8);
        }
    }
}
