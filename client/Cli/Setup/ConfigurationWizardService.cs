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

            Console.WriteLine("firstdraft init");
            Console.WriteLine("Configure this client. Press enter to accept the value in brackets.");
            Console.WriteLine();

            if (string.IsNullOrWhiteSpace(applicationData.WorkerId))
            {
                applicationData.WorkerId = Guid.NewGuid().ToString();
            }

            Console.WriteLine($"Worker ID: {applicationData.WorkerId}");

            applicationData.ExternalAPI = PromptUntilValid(
                "External API",
                string.IsNullOrWhiteSpace(applicationData.ExternalAPI) ? "http://localhost:5080" : applicationData.ExternalAPI,
                ValidateExternalApi);

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

            applicationData.AIProvider = PromptAIProvider(applicationData.AIProvider);
            applicationData.PlanningEnabled = PromptBool("AI planning enabled", applicationData.PlanningEnabled);

            applicationData.AIWorkingDirectory = PromptUntilValid(
                "AI working directory",
                string.IsNullOrWhiteSpace(applicationData.AIWorkingDirectory) ? Directory.GetCurrentDirectory() : applicationData.AIWorkingDirectory,
                ValidateExistingDirectory);

            applicationData.ApplicationFolder = PromptRequired("Application folder", applicationData.ApplicationFolder);
            applicationData.LogsFolder = PromptRequired("Logs folder", applicationData.LogsFolder);
            applicationData.ApplicationPaths = PromptApplicationPaths(applicationData.ApplicationPaths);
            applicationData.EnabledTaskTypes = PromptTaskTypes(applicationData.EnabledTaskTypes);
            applicationData.Skills = PromptSkills(applicationData.Skills);
            applicationData.MaxConcurrentTasks = PromptOptionalInt("Max concurrent gitflow tasks", ClampOptionalCapacity(applicationData.MaxConcurrentTasks), 1, 8, "unlimited");

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

        public async Task<int> TaskTypes()
        {
            ApplicationData applicationData = await _applicationDataService.GetApplicationData();

            Console.WriteLine("firstdraft taskTypes");
            Console.WriteLine("Configure this client's enabled task types.");

            applicationData.EnabledTaskTypes = PromptTaskTypes(applicationData.EnabledTaskTypes);

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

        private static string[] PromptTaskTypes(string[]? defaultTaskTypes)
        {
            string[] knownTaskTypes = WorkerTaskTypeRegistry.KnownTaskTypes;
            string[] selectedTaskTypes = WorkerTaskTypeRegistry.ResolveEnabledTaskTypes(defaultTaskTypes);

            while (true)
            {
                selectedTaskTypes = PromptCheckboxes(
                    "Task types",
                    knownTaskTypes,
                    selectedTaskTypes,
                    input => input.Length == 1 && string.Equals(input[0], "all", StringComparison.OrdinalIgnoreCase)
                        ? WorkerTaskTypeRegistry.KnownTaskTypes
                        : WorkerTaskTypeRegistry.ResolveEnabledTaskTypes(input),
                    "all for all task types");

                try
                {
                    return WorkerTaskTypeRegistry.ResolveEnabledTaskTypes(selectedTaskTypes);
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
