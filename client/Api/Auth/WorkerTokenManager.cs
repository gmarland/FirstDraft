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
            _refreshToken = _applicationData.GetWorkerRefreshToken();
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

            throw new InvalidOperationException("Worker is not authenticated. Run firstdraft init to log in or sign up.");
        }

        public async Task AuthenticateWithLoginAsync(string email, string password)
        {
            AuthResponse auth = await PostAuthAsync("/api/auth/login", new { email, password });
            await IssueAsync(auth.Token);
            ApplyUser(auth);
            await _applicationDataService.Save(_applicationData);
        }

        public async Task AuthenticateWithSignupAsync(string email, string password, string? name)
        {
            AuthResponse auth = await PostAuthAsync("/api/auth/signup", new { email, password, name });
            await IssueAsync(auth.Token);
            ApplyUser(auth);
            await _applicationDataService.Save(_applicationData);
        }

        private async Task IssueAsync(string userAccessToken)
        {
            TokenResponse response = await PostTokenAsync(
                "/api/worker-auth/token",
                new
                {
                    workerId = _applicationData.WorkerId
                },
                userAccessToken);
            Apply(response);
            await StoreRefreshToken(response);
        }

        private async Task RefreshAsync()
        {
            TokenResponse response = await PostTokenAsync(
                "/api/worker-auth/refresh",
                new { refreshToken = _refreshToken });
            Apply(response);
            if (!string.IsNullOrEmpty(_applicationData.ConfigEncryptionKey))
            {
                _applicationData.StoreWorkerRefreshToken(response.RefreshToken, _applicationData.ConfigEncryptionKey);
                await _applicationDataService.Save(_applicationData);
            }
        }

        private async Task<AuthResponse> PostAuthAsync(string path, object body)
        {
            using HttpResponseMessage response = await _http.PostAsJsonAsync($"{_applicationData.ExternalAPI}{path}", body);
            response.EnsureSuccessStatusCode();
            AuthResponse? authResponse = await response.Content.ReadFromJsonAsync<AuthResponse>();
            if (authResponse == null || string.IsNullOrEmpty(authResponse.Token))
            {
                throw new InvalidOperationException("Auth response did not include a token");
            }

            return authResponse;
        }

        private async Task<TokenResponse> PostTokenAsync(string path, object body, string? bearerToken = null)
        {
            using HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Post, $"{_applicationData.ExternalAPI}{path}");
            request.Content = JsonContent.Create(body);
            if (!string.IsNullOrEmpty(bearerToken))
            {
                request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", bearerToken);
            }

            using HttpResponseMessage response = await _http.SendAsync(request);
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

        private async Task StoreRefreshToken(TokenResponse response)
        {
            if (string.IsNullOrEmpty(response.ConfigEncryptionKey)) return;

            _applicationData.StoreWorkerRefreshToken(response.RefreshToken, response.ConfigEncryptionKey);
            await _applicationDataService.Save(_applicationData);
        }

        private void ApplyUser(AuthResponse response)
        {
            if (response.User == null) return;
            _applicationData.AuthUserId = response.User.UserId;
            _applicationData.AuthEmail = response.User.Email;
            _applicationData.AuthName = response.User.Name;
        }

        private sealed class AuthResponse
        {
            public string Token { get; set; } = string.Empty;
            public AuthUser? User { get; set; }
        }

        private sealed class AuthUser
        {
            public string UserId { get; set; } = string.Empty;
            public string Email { get; set; } = string.Empty;
            public string? Name { get; set; }
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
