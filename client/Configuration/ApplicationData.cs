namespace FirstDraft.Configuration
{
    public class EncryptedConfigValue
    {
        public int V { get; set; } = 1;

        public string Alg { get; set; } = "AES-256-GCM";

        public string Iv { get; set; } = string.Empty;

        public string Tag { get; set; } = string.Empty;

        public string Ciphertext { get; set; } = string.Empty;
    }

    public enum AIProvider
    {
        None,
        Codex,
        Claude
    }

    public class ApplicationData
    {
        public ApplicationData()
        {
            WorkerId = Guid.NewGuid().ToString();

            WorkerRefreshToken = string.Empty;

            ApplicationFolder = "App";

            LogsFolder = "Logs";
        }

        public string WorkerId { get; set; }

        public string WorkerRefreshToken { get; set; }

        public string? ConfigEncryptionKey { get; set; }

        public EncryptedConfigValue? EncryptedWorkerRefreshToken { get; set; }

        public string? AuthUserId { get; set; }

        public string? AuthEmail { get; set; }

        public string? AuthName { get; set; }

        public string? Name { get; set; }

        public string[]? Tags { get; set; }

        public string ApplicationFolder { get; set; }

        public string LogsFolder { get; set; }

        public string? ExternalAPI { get; set; }

        public string[]? ApplicationPaths { get; set; }

        public string[]? Skills { get; set; }

        public string[]? EnabledTaskTypes { get; set; }

        public AIProvider AIProvider { get; set; } = AIProvider.None;

        public bool PlanningEnabled { get; set; } = true;

        public string? AIWorkingDirectory { get; set; }

        public string? GitWorkspaceDirectory { get; set; }

        public int MaxConcurrentTasks { get; set; } = 1;

        public GitRepositoryConfig[]? GitRepositories { get; set; }

        public JiraIntegrationConfig[]? JiraIntegrations { get; set; }

        public void ValidateApplicationData()
        {
            ApplicationDataValidator.Validate(this);
        }

        public string GetRegisteredAddress()
        {
            if (ExternalAPI != null && ExternalAPI.StartsWith("https://")) return $"https://{WorkerId}.{ExternalAPI.Substring("https://".Length)}";
            else return $"http://{WorkerId}.{ExternalAPI!.Substring("http://".Length)}";
        }

        public string GetWorkerRefreshToken()
        {
            if (!string.IsNullOrEmpty(WorkerRefreshToken)) return WorkerRefreshToken;
            return DecryptConfigValue(EncryptedWorkerRefreshToken);
        }

        public bool HasPlaintextCredentials()
        {
            return !string.IsNullOrEmpty(WorkerRefreshToken);
        }

        public void EncryptCredentials(string configEncryptionKey)
        {
            string workerRefreshToken = GetWorkerRefreshToken();

            ConfigEncryptionKey = configEncryptionKey;
            if (!string.IsNullOrEmpty(workerRefreshToken))
            {
                EncryptedWorkerRefreshToken = EncryptConfigValue(workerRefreshToken);
            }
            WorkerRefreshToken = string.Empty;
        }

        public void StoreWorkerRefreshToken(string refreshToken, string configEncryptionKey)
        {
            ConfigEncryptionKey = configEncryptionKey;
            WorkerRefreshToken = refreshToken;
            EncryptedWorkerRefreshToken = EncryptConfigValue(refreshToken);
            WorkerRefreshToken = string.Empty;
        }

        public string DecryptSecret(EncryptedConfigValue? value)
        {
            return DecryptConfigValue(value);
        }

        public EncryptedConfigValue EncryptSecret(string value)
        {
            return EncryptConfigValue(value);
        }

        private string DecryptConfigValue(EncryptedConfigValue? value)
        {
            if (value == null) return string.Empty;
            if (string.IsNullOrEmpty(ConfigEncryptionKey)) return string.Empty;
            if (value.V != 1 || value.Alg != "AES-256-GCM") throw new Exception("Unsupported encrypted config value");

            byte[] key = DecodeBase64Url(ConfigEncryptionKey);
            byte[] iv = DecodeBase64Url(value.Iv);
            byte[] tag = DecodeBase64Url(value.Tag);
            byte[] ciphertext = DecodeBase64Url(value.Ciphertext);
            byte[] plaintext = new byte[ciphertext.Length];

            using System.Security.Cryptography.AesGcm aes = new System.Security.Cryptography.AesGcm(key, tag.Length);
            aes.Decrypt(iv, ciphertext, tag, plaintext);

            return System.Text.Encoding.UTF8.GetString(plaintext);
        }

        private EncryptedConfigValue EncryptConfigValue(string value)
        {
            if (string.IsNullOrEmpty(ConfigEncryptionKey)) throw new Exception("ConfigEncryptionKey is required");

            byte[] key = DecodeBase64Url(ConfigEncryptionKey);
            byte[] iv = System.Security.Cryptography.RandomNumberGenerator.GetBytes(12);
            byte[] plaintext = System.Text.Encoding.UTF8.GetBytes(value);
            byte[] ciphertext = new byte[plaintext.Length];
            byte[] tag = new byte[16];

            using System.Security.Cryptography.AesGcm aes = new System.Security.Cryptography.AesGcm(key, tag.Length);
            aes.Encrypt(iv, plaintext, ciphertext, tag);

            return new EncryptedConfigValue
            {
                V = 1,
                Alg = "AES-256-GCM",
                Iv = Convert.ToBase64String(iv).TrimEnd('=').Replace('+', '-').Replace('/', '_'),
                Tag = Convert.ToBase64String(tag).TrimEnd('=').Replace('+', '-').Replace('/', '_'),
                Ciphertext = Convert.ToBase64String(ciphertext).TrimEnd('=').Replace('+', '-').Replace('/', '_')
            };
        }

        private static byte[] DecodeBase64Url(string value)
        {
            string padded = value.Replace('-', '+').Replace('_', '/');
            switch (padded.Length % 4)
            {
                case 2:
                    padded += "==";
                    break;
                case 3:
                    padded += "=";
                    break;
            }

            return Convert.FromBase64String(padded);
        }

        public string GetApplicationFolder()
        {
            return ApplicationPathResolver.EnsureDirectory(ApplicationFolder);
        }

        public string GetLogsFolder()
        {
            return ApplicationPathResolver.EnsureDirectory(LogsFolder);
        }

    }

    public class GitRepositoryConfig
    {
        public string RepositoryUrl { get; set; } = string.Empty;

        public string NormalizedRepositoryUrl { get; set; } = string.Empty;

        public string SourceBranch { get; set; } = "main";

        public string TargetBranch { get; set; } = "main";
    }

    public class JiraIntegrationConfig
    {
        public string IntegrationId { get; set; } = string.Empty;

        public bool Enabled { get; set; } = true;

        public string SiteUrl { get; set; } = string.Empty;

        public string Email { get; set; } = string.Empty;

        public EncryptedConfigValue? EncryptedApiToken { get; set; }

        public int? BoardId { get; set; }

        public string BoardName { get; set; } = string.Empty;

        public string BoardType { get; set; } = string.Empty;

        public int? BoardFilterId { get; set; }

        public string ReadyStatusId { get; set; } = string.Empty;

        public string ReadyStatusName { get; set; } = string.Empty;

        public string ProcessingStatusId { get; set; } = string.Empty;

        public string ProcessingStatusName { get; set; } = string.Empty;

        public string ProcessedStatusId { get; set; } = string.Empty;

        public string ProcessedStatusName { get; set; } = string.Empty;

        public string GetApiToken(ApplicationData applicationData)
        {
            return applicationData.DecryptSecret(EncryptedApiToken);
        }

        public bool HasApiToken(ApplicationData applicationData)
        {
            return !string.IsNullOrEmpty(GetApiToken(applicationData));
        }

        public void StoreApiToken(ApplicationData applicationData, string apiToken)
        {
            if (string.IsNullOrEmpty(applicationData.ConfigEncryptionKey))
            {
                throw new Exception("ConfigEncryptionKey is required before saving Jira API tokens. Run firstdraft init to authenticate this worker.");
            }

            EncryptedApiToken = applicationData.EncryptSecret(apiToken);
        }
    }
}
