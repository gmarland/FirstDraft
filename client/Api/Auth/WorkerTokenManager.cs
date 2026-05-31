using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
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
                await RefreshAsync();
                return _accessToken!;
            }

            throw WorkerAuthenticationException.RequiresReauthentication(
                "Worker is not authenticated. Run firstdraft init and choose 'Re-authenticate worker: yes' to log in or sign up.");
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

            HttpResponseMessage response;
            try
            {
                response = await _http.SendAsync(request);
            }
            catch (HttpRequestException ex)
            {
                throw new WorkerAuthenticationException(
                    $"Unable to reach worker auth endpoint {_applicationData.ExternalAPI}{path}: {ex.Message}",
                    reauthenticationRequired: false,
                    ex);
            }
            catch (TaskCanceledException ex)
            {
                throw new WorkerAuthenticationException(
                    $"Timed out connecting to worker auth endpoint {_applicationData.ExternalAPI}{path}.",
                    reauthenticationRequired: false,
                    ex);
            }

            using (response)
            {
                if (!response.IsSuccessStatusCode)
                {
                    ThrowTokenResponseError(path, response.StatusCode);
                }

                TokenResponse? tokenResponse;
                try
                {
                    tokenResponse = await response.Content.ReadFromJsonAsync<TokenResponse>();
                }
                catch (JsonException ex)
                {
                    throw new WorkerAuthenticationException(
                        $"Worker auth endpoint {_applicationData.ExternalAPI}{path} returned malformed JSON.",
                        reauthenticationRequired: false,
                        ex);
                }

                if (tokenResponse == null)
                {
                    throw new WorkerAuthenticationException(
                        $"Worker auth endpoint {_applicationData.ExternalAPI}{path} returned an empty or malformed token response.",
                        reauthenticationRequired: false);
                }

                string[] missingFields = GetMissingTokenResponseFields(tokenResponse);
                if (missingFields.Length > 0)
                {
                    throw new WorkerAuthenticationException(
                        $"Worker auth endpoint {_applicationData.ExternalAPI}{path} returned a token response missing: {string.Join(", ", missingFields)}.",
                        reauthenticationRequired: false);
                }

                return tokenResponse;
            }
        }

        private static string[] GetMissingTokenResponseFields(TokenResponse tokenResponse)
        {
            List<string> missingFields = new List<string>();

            if (string.IsNullOrEmpty(tokenResponse.AccessToken)) missingFields.Add("accessToken");
            if (!tokenResponse.AccessTokenExpiresIn.HasValue) missingFields.Add("accessTokenExpiresIn");
            if (string.IsNullOrEmpty(tokenResponse.RefreshToken)) missingFields.Add("refreshToken");

            return missingFields.ToArray();
        }

        private static void ThrowTokenResponseError(string path, HttpStatusCode statusCode)
        {
            if (path == "/api/worker-auth/refresh" && (statusCode == HttpStatusCode.BadRequest || statusCode == HttpStatusCode.Unauthorized))
            {
                throw WorkerAuthenticationException.RequiresReauthentication(
                    $"Stored worker refresh token was rejected by the API ({(int)statusCode} {statusCode}). Run firstdraft init and choose 'Re-authenticate worker: yes'.");
            }

            throw new WorkerAuthenticationException(
                $"Worker auth endpoint {path} failed with {(int)statusCode} {statusCode}.",
                reauthenticationRequired: false);
        }

        private void Apply(TokenResponse response)
        {
            _accessToken = response.AccessToken;
            _refreshToken = response.RefreshToken;
            _accessExpiresAt = DateTimeOffset.UtcNow.AddSeconds(Math.Max(60, response.AccessTokenExpiresIn!.Value));
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
            public int? AccessTokenExpiresIn { get; set; }
            public string RefreshToken { get; set; } = string.Empty;
            public string ConfigEncryptionKey { get; set; } = string.Empty;
        }
    }

    internal sealed class WorkerAuthenticationException : Exception
    {
        public bool ReauthenticationRequired { get; }

        public WorkerAuthenticationException(string message, bool reauthenticationRequired, Exception? innerException = null)
            : base(message, innerException)
        {
            ReauthenticationRequired = reauthenticationRequired;
        }

        public static WorkerAuthenticationException RequiresReauthentication(string message)
        {
            return new WorkerAuthenticationException(message, reauthenticationRequired: true);
        }
    }
}
