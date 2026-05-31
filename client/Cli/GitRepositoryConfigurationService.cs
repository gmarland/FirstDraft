using System.Text.RegularExpressions;
using FirstDraft.Configuration;

namespace FirstDraft.Cli
{
    public class GitRepositoryConfigurationService
    {
        private readonly ApplicationDataService _applicationDataService;

        public GitRepositoryConfigurationService(ApplicationDataService applicationDataService)
        {
            _applicationDataService = applicationDataService;
        }

        public async Task<int> Repos(string[] args)
        {
            string command = args.Length > 0 ? args[0].ToLowerInvariant() : "list";

            return command switch
            {
                "list" => await List(),
                "add" => await Save(args.Skip(1).ToArray(), createOnly: true),
                "update" => await Save(args.Skip(1).ToArray(), createOnly: false),
                "remove" => await Remove(args.Skip(1).ToArray()),
                "delete" => await Remove(args.Skip(1).ToArray()),
                _ => PrintReposHelp($"Unknown repos command: {args[0]}")
            };
        }

        private async Task<int> List()
        {
            ApplicationData applicationData = await _applicationDataService.GetApplicationData();
            GitRepositoryConfig[] repositories = NormalizeRepositories(applicationData.GitRepositories);

            if (repositories.Length == 0)
            {
                Console.WriteLine("No Git repositories configured for this worker.");
                return 0;
            }

            int repositoryWidth = Math.Max(
                "REPOSITORY URL".Length,
                repositories.Max(repository => repository.RepositoryUrl.Length));
            int sourceWidth = Math.Max(
                "BRANCH SOURCE".Length,
                repositories.Max(repository => repository.SourceBranch.Length));
            int targetWidth = Math.Max(
                "PR TARGET".Length,
                repositories.Max(repository => repository.TargetBranch.Length));

            PrintReposTableRow("REPOSITORY URL", "BRANCH SOURCE", "PR TARGET", repositoryWidth, sourceWidth, targetWidth);
            foreach (GitRepositoryConfig repository in repositories)
            {
                PrintReposTableRow(repository.RepositoryUrl, repository.SourceBranch, repository.TargetBranch, repositoryWidth, sourceWidth, targetWidth);
            }

            return 0;
        }

        private static void PrintReposTableRow(
            string repositoryUrl,
            string sourceBranch,
            string targetBranch,
            int repositoryWidth,
            int sourceWidth,
            int targetWidth)
        {
            Console.WriteLine(
                $"{repositoryUrl.PadRight(repositoryWidth)}  {sourceBranch.PadRight(sourceWidth)}  {targetBranch.PadRight(targetWidth)}");
        }

        private async Task<int> Save(string[] args, bool createOnly)
        {
            if (args.Length == 0) return PrintReposHelp("Repository URL is required.");

            string repositoryUrl = args[0].Trim();
            string? sourceBranch = ReadOption(args, "--source");
            string? targetBranch = ReadOption(args, "--target");

            if (string.IsNullOrWhiteSpace(repositoryUrl)) return PrintReposHelp("Repository URL is required.");
            if (string.IsNullOrWhiteSpace(sourceBranch)) return PrintReposHelp("--source is required.");
            if (string.IsNullOrWhiteSpace(targetBranch)) return PrintReposHelp("--target is required.");

            string? repositoryError = ValidateRepositoryUrl(repositoryUrl);
            if (repositoryError != null) return PrintReposHelp(repositoryError);

            string? sourceError = ValidateBranchName(sourceBranch, "source");
            if (sourceError != null) return PrintReposHelp(sourceError);

            string? targetError = ValidateBranchName(targetBranch, "target");
            if (targetError != null) return PrintReposHelp(targetError);

            ApplicationData applicationData = await _applicationDataService.GetApplicationData();
            List<GitRepositoryConfig> repositories = NormalizeRepositories(applicationData.GitRepositories).ToList();
            string normalizedRepositoryUrl = NormalizeRepositoryUrl(repositoryUrl);
            int existingIndex = repositories.FindIndex(repository =>
                string.Equals(repository.NormalizedRepositoryUrl, normalizedRepositoryUrl, StringComparison.OrdinalIgnoreCase));

            if (createOnly && existingIndex >= 0)
            {
                Console.Error.WriteLine("Repository is already configured. Use firstdraft repos update to change branches.");
                return 1;
            }

            if (!createOnly && existingIndex < 0)
            {
                Console.Error.WriteLine("Repository is not configured. Use firstdraft repos add to add it.");
                return 1;
            }

            GitRepositoryConfig saved = new GitRepositoryConfig
            {
                RepositoryUrl = repositoryUrl,
                NormalizedRepositoryUrl = normalizedRepositoryUrl,
                SourceBranch = CleanBranch(sourceBranch),
                TargetBranch = CleanBranch(targetBranch)
            };

            if (existingIndex >= 0) repositories[existingIndex] = saved;
            else repositories.Add(saved);

            applicationData.GitRepositories = repositories
                .OrderBy(repository => repository.NormalizedRepositoryUrl, StringComparer.OrdinalIgnoreCase)
                .ToArray();
            await _applicationDataService.Save(applicationData);

            Console.WriteLine($"{(createOnly ? "Added" : "Updated")} repository {saved.RepositoryUrl}");
            Console.WriteLine($"Config written to {_applicationDataService.ConfigLocation}");
            return 0;
        }

        private async Task<int> Remove(string[] args)
        {
            if (args.Length == 0) return PrintReposHelp("Repository URL is required.");

            ApplicationData applicationData = await _applicationDataService.GetApplicationData();
            List<GitRepositoryConfig> repositories = NormalizeRepositories(applicationData.GitRepositories).ToList();
            string normalizedRepositoryUrl = NormalizeRepositoryUrl(args[0]);
            int removed = repositories.RemoveAll(repository =>
                string.Equals(repository.NormalizedRepositoryUrl, normalizedRepositoryUrl, StringComparison.OrdinalIgnoreCase));

            if (removed == 0)
            {
                Console.Error.WriteLine("Repository is not configured.");
                return 1;
            }

            applicationData.GitRepositories = repositories.ToArray();
            await _applicationDataService.Save(applicationData);

            Console.WriteLine($"Removed repository {args[0].Trim()}");
            Console.WriteLine($"Config written to {_applicationDataService.ConfigLocation}");
            return 0;
        }

        public static GitRepositoryConfig[] NormalizeRepositories(GitRepositoryConfig[]? repositories)
        {
            if (repositories == null || repositories.Length == 0) return Array.Empty<GitRepositoryConfig>();

            return repositories
                .Where(repository => !string.IsNullOrWhiteSpace(repository.RepositoryUrl))
                .Select(repository =>
                {
                    string repositoryUrl = repository.RepositoryUrl.Trim();
                    string sourceBranch = CleanBranch(repository.SourceBranch);
                    string targetBranch = CleanBranch(repository.TargetBranch);
                    return new GitRepositoryConfig
                    {
                        RepositoryUrl = repositoryUrl,
                        NormalizedRepositoryUrl = string.IsNullOrWhiteSpace(repository.NormalizedRepositoryUrl)
                            ? NormalizeRepositoryUrl(repositoryUrl)
                            : repository.NormalizedRepositoryUrl.Trim(),
                        SourceBranch = string.IsNullOrWhiteSpace(sourceBranch) ? "main" : sourceBranch,
                        TargetBranch = string.IsNullOrWhiteSpace(targetBranch) ? "main" : targetBranch
                    };
                })
                .GroupBy(repository => repository.NormalizedRepositoryUrl, StringComparer.OrdinalIgnoreCase)
                .Select(group => group.Last())
                .OrderBy(repository => repository.NormalizedRepositoryUrl, StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }

        public static string NormalizeRepositoryUrl(string repositoryUrl)
        {
            string trimmed = repositoryUrl.Trim().Replace('\\', '/').TrimEnd('/');
            Match sshMatch = Regex.Match(trimmed, "^git@github\\.com:([^/]+)/(.+)$", RegexOptions.IgnoreCase);
            if (sshMatch.Success)
            {
                return NormalizeGitHubPath(sshMatch.Groups[1].Value, sshMatch.Groups[2].Value);
            }

            if (Uri.TryCreate(trimmed, UriKind.Absolute, out Uri? uri) &&
                string.Equals(uri.Host, "github.com", StringComparison.OrdinalIgnoreCase))
            {
                string[] parts = uri.AbsolutePath.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length >= 2) return NormalizeGitHubPath(parts[0], parts[1]);
            }

            return StripGitSuffix(trimmed).ToLowerInvariant();
        }

        private static string NormalizeGitHubPath(string owner, string repo)
        {
            return $"github.com/{owner.ToLowerInvariant()}/{StripGitSuffix(repo).ToLowerInvariant()}";
        }

        private static string StripGitSuffix(string value)
        {
            return value.EndsWith(".git", StringComparison.OrdinalIgnoreCase) ? value[..^4] : value;
        }

        private static string? ReadOption(string[] args, string name)
        {
            for (int index = 1; index < args.Length; index++)
            {
                string arg = args[index];
                if (arg.StartsWith($"{name}=", StringComparison.OrdinalIgnoreCase))
                {
                    return arg[(name.Length + 1)..].Trim();
                }

                if (string.Equals(arg, name, StringComparison.OrdinalIgnoreCase) && index + 1 < args.Length)
                {
                    return args[index + 1].Trim();
                }
            }

            return null;
        }

        private static string CleanBranch(string? value)
        {
            return (value ?? string.Empty).Trim().Replace("refs/heads/", string.Empty);
        }

        private static string? ValidateBranchName(string? branchName, string label)
        {
            string value = CleanBranch(branchName);
            if (string.IsNullOrWhiteSpace(value)) return $"{label} branch is required.";
            if (!Regex.IsMatch(value, "^[A-Za-z0-9._/-]+$") ||
                value.Contains("..") ||
                value.StartsWith("/") ||
                value.EndsWith("/") ||
                value.EndsWith("."))
            {
                return $"{label} branch contains unsafe branch characters.";
            }

            return null;
        }

        private static string? ValidateRepositoryUrl(string repositoryUrl)
        {
            string value = repositoryUrl.Trim();
            if (Regex.IsMatch(value, "^git@github\\.com:[^/]+/.+\\.git$", RegexOptions.IgnoreCase) ||
                Regex.IsMatch(value, "^git@github\\.com:[^/]+/.+$", RegexOptions.IgnoreCase))
            {
                return null;
            }

            if (!Uri.TryCreate(value, UriKind.Absolute, out Uri? uri))
            {
                return "Repository URL must be an absolute URL or git@github.com:owner/repo.git SSH URL.";
            }

            if (uri.Scheme != "https" && uri.Scheme != "http" && uri.Scheme != "ssh")
            {
                return "Repository URL scheme must be https, http, or ssh.";
            }

            if (string.IsNullOrWhiteSpace(uri.Host) || string.IsNullOrWhiteSpace(uri.AbsolutePath.Trim('/')))
            {
                return "Repository URL must include a host and repository path.";
            }

            return null;
        }

        private static int PrintReposHelp(string? error = null)
        {
            if (!string.IsNullOrWhiteSpace(error))
            {
                Console.Error.WriteLine(error);
                Console.Error.WriteLine();
            }

            Console.Error.WriteLine("Usage:");
            Console.Error.WriteLine("  firstdraft repos list");
            Console.Error.WriteLine("  firstdraft repos add <repository-url> --source <branch> --target <branch>");
            Console.Error.WriteLine("  firstdraft repos update <repository-url> --source <branch> --target <branch>");
            Console.Error.WriteLine("  firstdraft repos remove <repository-url>");
            return string.IsNullOrWhiteSpace(error) ? 0 : 1;
        }
    }
}
