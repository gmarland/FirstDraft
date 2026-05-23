using System.Net.Http.Json;
using FirstDraft.Configuration;

namespace FirstDraft.Api.Auth
{
    internal sealed class WorkerTokenManager
    {
        private readonly ApplicationData _applicationData;
        private readonly ApplicationDataService _applicationDataService;
        private readonly HttpClient _http = new HttpClient();
        private string? _accessToken;
        private string? _refreshToken;
        private DateTimeOffset _accessExpiresAt = DateTimeOffset.MinValue;

        public WorkerTokenManager(ApplicationData applicationData, ApplicationDataService applicationDataService)
        {
            _applicationData = applicationData;
            _applicationDataService = applicationDataService;
        }

        public async Task<string> EnsureAccessTokenAsync()
        {
            if (!string.IsNullOrEmpty(_accessToken) && _accessExpiresAt > DateTimeOffset.UtcNow.AddMinutes(5))
            {
                return _accessToken;
            }

            if (!string.IsNullOrEmpty(_refreshToken))
            {
                try
                {
                    await RefreshAsync();
                    return _accessToken!;
                }
                catch
                {
                    _refreshToken = null;
                }
            }

            await IssueAsync();
            return _accessToken!;
        }

        private async Task IssueAsync()
        {
            TokenResponse response = await PostTokenAsync(
                "/api/worker-auth/token",
                new
                {
                    workerId = _applicationData.WorkerId,
                    apiKey = _applicationData.GetApiKey(),
                    apiSecret = _applicationData.GetApiSecret()
                });
            Apply(response);
            await EncryptStoredCredentials(response);
        }

        private async Task RefreshAsync()
        {
            TokenResponse response = await PostTokenAsync(
                "/api/worker-auth/refresh",
                new { refreshToken = _refreshToken });
            Apply(response);
        }

        private async Task<TokenResponse> PostTokenAsync(string path, object body)
        {
            using HttpResponseMessage response = await _http.PostAsJsonAsync($"{_applicationData.ExternalAPI}{path}", body);
            response.EnsureSuccessStatusCode();
            TokenResponse? tokenResponse = await response.Content.ReadFromJsonAsync<TokenResponse>();
            if (tokenResponse == null || string.IsNullOrEmpty(tokenResponse.AccessToken) || string.IsNullOrEmpty(tokenResponse.RefreshToken))
            {
                throw new InvalidOperationException("Worker auth response did not include tokens");
            }

            return tokenResponse;
        }

        private void Apply(TokenResponse response)
        {
            _accessToken = response.AccessToken;
            _refreshToken = response.RefreshToken;
            _accessExpiresAt = DateTimeOffset.UtcNow.AddSeconds(Math.Max(60, response.AccessTokenExpiresIn));
        }

        private async Task EncryptStoredCredentials(TokenResponse response)
        {
            if (string.IsNullOrEmpty(response.ConfigEncryptionKey)) return;
            if (!_applicationData.HasPlaintextCredentials() && !string.IsNullOrEmpty(_applicationData.ConfigEncryptionKey)) return;

            _applicationData.EncryptCredentials(response.ConfigEncryptionKey);
            await _applicationDataService.Save(_applicationData);
        }

        private sealed class TokenResponse
        {
            public string AccessToken { get; set; } = string.Empty;
            public int AccessTokenExpiresIn { get; set; }
            public string RefreshToken { get; set; } = string.Empty;
            public string ConfigEncryptionKey { get; set; } = string.Empty;
        }
    }
}
