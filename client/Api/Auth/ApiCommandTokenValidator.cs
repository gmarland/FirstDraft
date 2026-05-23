using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using FirstDraft.Configuration;

namespace FirstDraft.Api.Auth
{
    internal sealed class ApiCommandTokenValidator
    {
        private readonly ApplicationData _applicationData;
        private readonly HttpClient _http = new HttpClient();
        private string? _publicKey;

        public ApiCommandTokenValidator(ApplicationData applicationData)
        {
            _applicationData = applicationData;
        }

        public async Task EnsurePublicKeyAsync(bool forceRefresh = false)
        {
            if (!forceRefresh && !string.IsNullOrEmpty(_publicKey)) return;

            PublicKeyResponse? response = await _http.GetFromJsonAsync<PublicKeyResponse>($"{_applicationData.ExternalAPI}/api/worker-auth/public-key");
            if (response == null || response.Alg != "RS256" || string.IsNullOrEmpty(response.PublicKey))
            {
                throw new InvalidOperationException("API command public key is unavailable");
            }

            _publicKey = response.PublicKey;
        }

        public CommandTokenValidationResult Validate(string token, string transactionId)
        {
            try
            {
                return ValidateCore(token, transactionId);
            }
            catch
            {
                return CommandTokenValidationResult.Malformed;
            }
        }

        private CommandTokenValidationResult ValidateCore(string token, string transactionId)
        {
            if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(_publicKey)) return CommandTokenValidationResult.Malformed;

            string[] parts = token.Split('.');
            if (parts.Length != 3) return CommandTokenValidationResult.Malformed;

            byte[] signedBytes = Encoding.ASCII.GetBytes($"{parts[0]}.{parts[1]}");
            byte[] signature = Base64UrlDecode(parts[2]);

            using RSA rsa = RSA.Create();
            rsa.ImportFromPem(_publicKey.AsSpan());
            if (!rsa.VerifyData(signedBytes, signature, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1))
            {
                return CommandTokenValidationResult.InvalidSignature;
            }

            using JsonDocument payload = JsonDocument.Parse(Base64UrlDecode(parts[1]));
            JsonElement root = payload.RootElement;
            if (ReadString(root, "typ") != "api_to_worker"
                || ReadString(root, "workerId") != _applicationData.WorkerId
                || ReadString(root, "transactionId") != transactionId
                || !HasAudience(root, $"firstdraft-worker:{_applicationData.WorkerId}"))
            {
                return CommandTokenValidationResult.InvalidClaims;
            }

            return ReadUnixSeconds(root, "exp") > DateTimeOffset.UtcNow.ToUnixTimeSeconds()
                ? CommandTokenValidationResult.Valid
                : CommandTokenValidationResult.Expired;
        }

        private static string ReadString(JsonElement root, string property)
        {
            return root.TryGetProperty(property, out JsonElement value) && value.ValueKind == JsonValueKind.String
                ? value.GetString() ?? string.Empty
                : string.Empty;
        }

        private static long ReadUnixSeconds(JsonElement root, string property)
        {
            return root.TryGetProperty(property, out JsonElement value) && value.TryGetInt64(out long seconds)
                ? seconds
                : 0;
        }

        private static bool HasAudience(JsonElement root, string expected)
        {
            if (!root.TryGetProperty("aud", out JsonElement value)) return false;
            if (value.ValueKind == JsonValueKind.String) return value.GetString() == expected;
            if (value.ValueKind != JsonValueKind.Array) return false;

            foreach (JsonElement item in value.EnumerateArray())
            {
                if (item.ValueKind == JsonValueKind.String && item.GetString() == expected) return true;
            }

            return false;
        }

        private static byte[] Base64UrlDecode(string value)
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

        private sealed class PublicKeyResponse
        {
            public string Alg { get; set; } = string.Empty;
            public string PublicKey { get; set; } = string.Empty;
        }
    }

    internal enum CommandTokenValidationResult
    {
        Valid,
        Expired,
        InvalidSignature,
        InvalidClaims,
        Malformed,
        RefreshFailed
    }
}
