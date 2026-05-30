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

            ApiKey = string.Empty;

            ApiSecret = string.Empty;

            WorkerRefreshToken = string.Empty;

            ApplicationFolder = "App";

            LogsFolder = "Logs";
        }

        public string WorkerId { get; set; }

        public string ApiKey { get; set; }

        public string ApiSecret { get; set; }

        public string WorkerRefreshToken { get; set; }

        public string? ConfigEncryptionKey { get; set; }

        public EncryptedConfigValue? EncryptedApiKey { get; set; }

        public EncryptedConfigValue? EncryptedApiSecret { get; set; }

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

        public void ValidateApplicationData()
        {
            ApplicationDataValidator.Validate(this);
        }

        public string GetRegisteredAddress()
        {
            if (ExternalAPI != null && ExternalAPI.StartsWith("https://")) return $"https://{WorkerId}.{ExternalAPI.Substring("https://".Length)}";
            else return $"http://{WorkerId}.{ExternalAPI!.Substring("http://".Length)}";
        }

        public string GetApiKey()
        {
            if (!string.IsNullOrEmpty(ApiKey)) return ApiKey;
            return DecryptConfigValue(EncryptedApiKey);
        }

        public string GetApiSecret()
        {
            if (!string.IsNullOrEmpty(ApiSecret)) return ApiSecret;
            return DecryptConfigValue(EncryptedApiSecret);
        }

        public string GetWorkerRefreshToken()
        {
            if (!string.IsNullOrEmpty(WorkerRefreshToken)) return WorkerRefreshToken;
            return DecryptConfigValue(EncryptedWorkerRefreshToken);
        }

        public bool HasPlaintextCredentials()
        {
            return !string.IsNullOrEmpty(ApiKey) || !string.IsNullOrEmpty(ApiSecret) || !string.IsNullOrEmpty(WorkerRefreshToken);
        }

        public void EncryptCredentials(string configEncryptionKey)
        {
            string apiKey = GetApiKey();
            string apiSecret = GetApiSecret();
            string workerRefreshToken = GetWorkerRefreshToken();

            ConfigEncryptionKey = configEncryptionKey;
            if (!string.IsNullOrEmpty(apiKey) && !string.IsNullOrEmpty(apiSecret))
            {
                EncryptedApiKey = EncryptConfigValue(apiKey);
                EncryptedApiSecret = EncryptConfigValue(apiSecret);
            }
            if (!string.IsNullOrEmpty(workerRefreshToken))
            {
                EncryptedWorkerRefreshToken = EncryptConfigValue(workerRefreshToken);
            }
            ApiKey = string.Empty;
            ApiSecret = string.Empty;
            WorkerRefreshToken = string.Empty;
        }

        public void StoreWorkerRefreshToken(string refreshToken, string configEncryptionKey)
        {
            ConfigEncryptionKey = configEncryptionKey;
            WorkerRefreshToken = refreshToken;
            EncryptedWorkerRefreshToken = EncryptConfigValue(refreshToken);
            WorkerRefreshToken = string.Empty;
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
}
