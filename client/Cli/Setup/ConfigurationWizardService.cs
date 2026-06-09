using FirstDraft.Api.Auth;
using FirstDraft.Cli.Common;
using FirstDraft.Configuration;
using static FirstDraft.Cli.Common.ConsolePrompt;

namespace FirstDraft.Cli.Setup
{
    public class ConfigurationWizardService
    {
        private readonly ApplicationDataService _applicationDataService;

        public ConfigurationWizardService(ApplicationDataService applicationDataService)
        {
            _applicationDataService = applicationDataService;
        }

        public async Task<int> Init()
        {
            ApplicationData applicationData = await _applicationDataService.GetApplicationData();
            WorkerEnvConfiguration? envConfig = _applicationDataService.LastEnvironmentConfiguration;

            Console.WriteLine("firstdraft init");
            Console.WriteLine("Configure this client. Press enter to accept the value in brackets.");
            if (envConfig != null)
            {
                Console.WriteLine($"Loaded worker .env: {envConfig.Path}");
            }
            Console.WriteLine();

            if (string.IsNullOrWhiteSpace(applicationData.WorkerId))
            {
                applicationData.WorkerId = Guid.NewGuid().ToString();
            }

            if (HasEnvField(envConfig, nameof(ApplicationData.WorkerId)))
            {
                PrintEnvValue("Worker ID", applicationData.WorkerId);
            }
            else
            {
                Console.WriteLine($"Worker ID: {applicationData.WorkerId}");
            }

            if (HasEnvField(envConfig, nameof(ApplicationData.ExternalAPI)))
            {
                PrintEnvValue("External API", applicationData.ExternalAPI ?? string.Empty);
            }
            else
            {
                applicationData.ExternalAPI = PromptUntilValid(
                    "External API",
                    string.IsNullOrWhiteSpace(applicationData.ExternalAPI) ? "https://api.firstdraft.run" : applicationData.ExternalAPI,
                    ValidateExternalApi);
            }

            if (PromptAuthentication(applicationData))
            {
                WorkerTokenManager tokens = new WorkerTokenManager(applicationData, _applicationDataService);
                string authMode = PromptAuthMode(applicationData);
                string email = PromptRequired("Email", applicationData.AuthEmail ?? string.Empty);
                string password = PromptSensitiveRequired("Password", string.Empty);
                try
                {
                    if (authMode == "signup")
                    {
                        string name = Prompt("Name", applicationData.AuthName ?? string.Empty);
                        await tokens.AuthenticateWithSignupAsync(email, password, string.IsNullOrWhiteSpace(name) ? null : name);
                    }
                    else
                    {
                        await tokens.AuthenticateWithLoginAsync(email, password);
                    }
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine($"Authentication failed: {ex.Message}");
                    return 1;
                }
            }

            if (HasEnvField(envConfig, nameof(ApplicationData.AIProvider)))
            {
                PrintEnvValue("AI provider", applicationData.AIProvider.ToString());
            }
            else
            {
                applicationData.AIProvider = PromptAIProvider(applicationData.AIProvider);
            }

            if (HasEnvField(envConfig, nameof(ApplicationData.PlanningEnabled)))
            {
                PrintEnvValue("AI planning enabled", applicationData.PlanningEnabled.ToString());
            }
            else
            {
                applicationData.PlanningEnabled = PromptBool("AI planning enabled", applicationData.PlanningEnabled);
            }

            if (HasEnvField(envConfig, nameof(ApplicationData.AIWorkingDirectory)))
            {
                PrintEnvValue("AI working directory", applicationData.AIWorkingDirectory ?? string.Empty);
            }
            else
            {
                applicationData.AIWorkingDirectory = PromptUntilValid(
                    "AI working directory",
                    string.IsNullOrWhiteSpace(applicationData.AIWorkingDirectory) ? Directory.GetCurrentDirectory() : applicationData.AIWorkingDirectory,
                    ValidateExistingDirectory);
            }

            if (HasEnvField(envConfig, nameof(ApplicationData.ApplicationFolder)))
            {
                PrintEnvValue("Application folder", applicationData.ApplicationFolder);
            }
            else
            {
                applicationData.ApplicationFolder = PromptRequired("Application folder", applicationData.ApplicationFolder);
            }

            if (HasEnvField(envConfig, nameof(ApplicationData.LogsFolder)))
            {
                PrintEnvValue("Logs folder", applicationData.LogsFolder);
            }
            else
            {
                applicationData.LogsFolder = PromptRequired("Logs folder", applicationData.LogsFolder);
            }

            if (HasEnvField(envConfig, nameof(ApplicationData.ApplicationPaths)))
            {
                PrintEnvValue("Application paths", FormatList(applicationData.ApplicationPaths, "*"));
            }
            else
            {
                applicationData.ApplicationPaths = PromptApplicationPaths(applicationData.ApplicationPaths);
            }

            if (HasEnvField(envConfig, nameof(ApplicationData.Skills)))
            {
                PrintEnvValue("Skills", FormatList(applicationData.Skills, "none"));
            }
            else
            {
                applicationData.Skills = PromptSkills(applicationData.Skills);
            }

            if (HasEnvField(envConfig, nameof(ApplicationData.MaxConcurrentTasks)))
            {
                PrintEnvValue("Max concurrent gitflow tasks", applicationData.MaxConcurrentTasks?.ToString() ?? "unlimited");
            }
            else
            {
                applicationData.MaxConcurrentTasks = PromptOptionalInt("Max concurrent gitflow tasks", ClampOptionalCapacity(applicationData.MaxConcurrentTasks), 1, 8, "unlimited");
            }

            if (!string.IsNullOrEmpty(applicationData.ConfigEncryptionKey))
            {
                applicationData.EncryptCredentials(applicationData.ConfigEncryptionKey);
            }

            try
            {
                applicationData.ValidateApplicationData();
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"Configuration is invalid: {ex.Message}");
                return 1;
            }

            await _applicationDataService.Save(applicationData);

            Console.WriteLine();
            Console.WriteLine("Run the client with: firstdraft run");

            return 0;
        }

        public async Task<int> Skills()
        {
            ApplicationData applicationData = await _applicationDataService.GetApplicationData();

            Console.WriteLine("firstdraft skills");
            Console.WriteLine("Configure this client's worker skills.");

            applicationData.Skills = PromptSkills(applicationData.Skills);

            await _applicationDataService.Save(applicationData);

            Console.WriteLine();

            return 0;
        }

        public async Task<int> Capacity()
        {
            ApplicationData applicationData = await _applicationDataService.GetApplicationData();

            Console.WriteLine("firstdraft capacity");
            Console.WriteLine("Configure this client's max concurrent gitflow tasks.");

            applicationData.MaxConcurrentTasks = PromptOptionalInt("Max concurrent gitflow tasks", ClampOptionalCapacity(applicationData.MaxConcurrentTasks), 1, 8, "unlimited");

            await _applicationDataService.Save(applicationData);

            Console.WriteLine();

            return 0;
        }

        public async Task<int> EnablePlanning()
        {
            ApplicationData applicationData = await _applicationDataService.GetApplicationData();

            Console.WriteLine("firstdraft enablePlanning");
            Console.WriteLine("Configure the AI planning pass for this client.");

            applicationData.PlanningEnabled = PromptBool("AI planning enabled", applicationData.PlanningEnabled);

            await _applicationDataService.Save(applicationData);

            Console.WriteLine();
            Console.WriteLine(applicationData.PlanningEnabled
                ? "AI planning is enabled."
                : "AI planning is disabled.");

            return 0;
        }

        private static bool PromptAuthentication(ApplicationData applicationData)
        {
            if (string.IsNullOrEmpty(applicationData.GetWorkerRefreshToken())) return true;

            Console.WriteLine($"Authenticated user: {applicationData.AuthEmail ?? "unknown"}");
            return PromptBool("Re-authenticate worker", false);
        }

        private static bool HasEnvField(WorkerEnvConfiguration? envConfig, string fieldName)
        {
            return envConfig != null && envConfig.HasField(fieldName);
        }

        private static void PrintEnvValue(string label, string value)
        {
            Console.WriteLine($"{label}: {value} (.env)");
        }

        private static string FormatList(string[]? values, string emptyValue)
        {
            return values != null && values.Length > 0 ? string.Join(",", values) : emptyValue;
        }

        private static string PromptAuthMode(ApplicationData applicationData)
        {
            string defaultValue = string.IsNullOrWhiteSpace(applicationData.AuthEmail) ? "login" : "login";
            while (true)
            {
                string input = Prompt("Authenticate with login or signup", defaultValue).ToLowerInvariant();
                if (input == "login" || input == "signup") return input;

                Console.Error.WriteLine("Authentication mode must be login or signup");
            }
        }

        private static AIProvider PromptAIProvider(AIProvider defaultProvider)
        {
            string defaultValue = defaultProvider == AIProvider.None ? "Codex" : defaultProvider.ToString();

            while (true)
            {
                string input = Prompt("AI provider (Codex/Claude)", defaultValue);

                if (Enum.TryParse(input, true, out AIProvider provider) && provider != AIProvider.None)
                {
                    return provider;
                }

                Console.Error.WriteLine("AI provider must be Codex or Claude");
            }
        }

        private static int? ClampOptionalCapacity(int? maxConcurrentTasks)
        {
            return maxConcurrentTasks.HasValue ? Math.Clamp(maxConcurrentTasks.Value, 1, 8) : null;
        }

        private static string[] PromptApplicationPaths(string[]? defaultPaths)
        {
            string defaultValue = (defaultPaths != null && defaultPaths.Length > 0)
                ? string.Join(",", defaultPaths)
                : "*";

            string input = Prompt("Application paths, comma separated", defaultValue);
            if (string.IsNullOrWhiteSpace(input) || input == "*")
            {
                return Array.Empty<string>();
            }

            return input
                .Split(',')
                .Select(path => path.Trim())
                .Where(path => !string.IsNullOrWhiteSpace(path))
                .ToArray();
        }

        private static string[] PromptSkills(string[]? defaultSkills)
        {
            string[] knownSkills = WorkerSkillRegistry.KnownSkills;
            string[] selectedSkills = defaultSkills != null && defaultSkills.Length > 0
                ? WorkerSkillRegistry.NormalizeConfiguredSkills(defaultSkills)
                : knownSkills;

            while (true)
            {
                selectedSkills = PromptCheckboxes("Skills", knownSkills, selectedSkills);

                try
                {
                    return WorkerSkillRegistry.ResolveAvailableSkills(selectedSkills);
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine(ex.Message);
                }
            }
        }

        private static string[] PromptCheckboxes(
            string label,
            string[] options,
            string[] defaultSelected,
            Func<string[], string[]>? normalize = null,
            string emptyLabel = "none for no skills")
        {
            if (options.Length == 0) return Array.Empty<string>();
            normalize ??= WorkerSkillRegistry.NormalizeConfiguredSkills;

            if (Console.IsInputRedirected || Console.IsOutputRedirected)
            {
                string defaultValue = defaultSelected.Length > 0 ? string.Join(",", defaultSelected) : "none";
                string input = Prompt($"{label}, comma separated ({string.Join("/", options)}, {emptyLabel})", defaultValue);
                return normalize(ParseCommaSeparated(input));
            }

            HashSet<string> selected = new HashSet<string>(defaultSelected, StringComparer.OrdinalIgnoreCase);
            int selectedIndex = 0;

            Console.WriteLine();
            Console.WriteLine($"{label} (Space toggles, Up/Down moves, Enter saves)");

            int top = Console.CursorTop;

            while (true)
            {
                DrawCheckboxes(options, selected, selectedIndex, top);

                ConsoleKeyInfo key = Console.ReadKey(intercept: true);
                switch (key.Key)
                {
                    case ConsoleKey.UpArrow:
                        selectedIndex = selectedIndex == 0 ? options.Length - 1 : selectedIndex - 1;
                        break;

                    case ConsoleKey.DownArrow:
                        selectedIndex = selectedIndex == options.Length - 1 ? 0 : selectedIndex + 1;
                        break;

                    case ConsoleKey.Spacebar:
                        string skill = options[selectedIndex];
                        if (!selected.Add(skill))
                        {
                            selected.Remove(skill);
                        }
                        break;

                    case ConsoleKey.Enter:
                        Console.SetCursorPosition(0, top + options.Length);
                        Console.WriteLine();
                        return options.Where(option => selected.Contains(option)).ToArray();
                }
            }
        }

        private static void DrawCheckboxes(string[] options, HashSet<string> selected, int selectedIndex, int top)
        {
            for (int index = 0; index < options.Length; index++)
            {
                Console.SetCursorPosition(0, top + index);
                ClearCurrentLine();

                string pointer = index == selectedIndex ? ">" : " ";
                string checkbox = selected.Contains(options[index]) ? "[x]" : "[ ]";
                Console.Write($"{pointer} {checkbox} {options[index]}");
            }
        }

        private static void ClearCurrentLine()
        {
            int width = Math.Max(Console.BufferWidth - 1, 0);
            Console.Write(new string(' ', width));
            Console.SetCursorPosition(0, Console.CursorTop);
        }

        private static string[] ParseCommaSeparated(string value)
        {
            if (string.IsNullOrWhiteSpace(value) || value == "*" || string.Equals(value, "none", StringComparison.OrdinalIgnoreCase)) return Array.Empty<string>();

            return value
                .Split(',')
                .Select(part => part.Trim())
                .Where(part => !string.IsNullOrWhiteSpace(part))
                .ToArray();
        }

        private static string? ValidateWorkerId(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return "Worker id is required";
            if (value.Contains('.')) return "Worker id cannot contain a .";
            if (value.Contains('?')) return "Worker id cannot contain a ?";
            if (value.Contains('/')) return "Worker id cannot contain a /";
            if (value.Contains('\\')) return "Worker id cannot contain a \\";
            if (value.Contains('&')) return "Worker id cannot contain a &";
            if (value.Contains('#')) return "Worker id cannot contain a #";

            return null;
        }

        private static string? ValidateExternalApi(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return "External API is required";

            if (!Uri.TryCreate(value, UriKind.Absolute, out Uri? uri))
            {
                return "External API must be an absolute URL";
            }

            if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps)
            {
                return "External API must start with http:// or https://";
            }

            return null;
        }

        private static string? ValidateExistingDirectory(string value)
        {
            if (string.IsNullOrWhiteSpace(value)) return "AI working directory is required";
            if (!Directory.Exists(value)) return "AI working directory must exist";

            return null;
        }
    }
}
