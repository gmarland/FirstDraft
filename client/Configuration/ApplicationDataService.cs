using Newtonsoft.Json;

namespace FirstDraft.Configuration
{
    public class ApplicationDataService
    {
        private readonly string _configLocation;
        private readonly WorkerEnvFileService _envFileService;

        public ApplicationDataService()
        {
            _configLocation = Path.Join(Directory.GetCurrentDirectory(), "config.json");
            _envFileService = new WorkerEnvFileService();
        }

        public string ConfigLocation => _configLocation;

        public WorkerEnvConfiguration? LastEnvironmentConfiguration { get; private set; }

        public async Task<ApplicationData> GetApplicationData()
        {
            ApplicationData applicationData;

            if (File.Exists(_configLocation))
            {
                string jsonConfig = File.ReadAllText(_configLocation);

                applicationData = JsonConvert.DeserializeObject<ApplicationData>(jsonConfig) ?? new ApplicationData();
                if (!jsonConfig.Contains("\"WorkerId\"") || string.IsNullOrWhiteSpace(applicationData.WorkerId))
                {
                    applicationData.WorkerId = string.IsNullOrWhiteSpace(applicationData.WorkerId)
                        ? Guid.NewGuid().ToString()
                        : applicationData.WorkerId;
                    await Save(applicationData);
                }
            }
            else
            {
                applicationData = new ApplicationData();

                await Save(applicationData);
            }

            LastEnvironmentConfiguration = _envFileService.ApplyIfExists(
                applicationData,
                Path.GetDirectoryName(_configLocation) ?? Directory.GetCurrentDirectory());

            return applicationData;
        }

        public async Task Save(ApplicationData applicationData)
        {
            string jsonConfig = JsonConvert.SerializeObject(applicationData, Formatting.Indented);

            await File.WriteAllTextAsync(_configLocation, jsonConfig);
        }
    }
}
