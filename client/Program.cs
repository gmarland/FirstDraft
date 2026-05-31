using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using FirstDraft.Cli;
using FirstDraft.Commands;
using FirstDraft.Commands.Handlers;
using FirstDraft.Configuration;

namespace FirstDraft
{
    public class Program
    {
        public static async Task<int> Main(string[] args)
        {
            string command = args.Length > 0 ? args[0].ToLowerInvariant() : "run";

            switch (command)
            {
                case "init":
                    ApplicationDataService applicationDataService = new ApplicationDataService();
                    ConfigurationWizardService configurationWizardService = new ConfigurationWizardService(applicationDataService);
                    return await configurationWizardService.Init();

                case "skills":
                    ApplicationDataService skillsApplicationDataService = new ApplicationDataService();
                    ConfigurationWizardService skillsConfigurationWizardService = new ConfigurationWizardService(skillsApplicationDataService);
                    return await skillsConfigurationWizardService.Skills();

                case "capacity":
                    ApplicationDataService capacityApplicationDataService = new ApplicationDataService();
                    ConfigurationWizardService capacityConfigurationWizardService = new ConfigurationWizardService(capacityApplicationDataService);
                    return await capacityConfigurationWizardService.Capacity();

                case "tasktypes":
                case "task-types":
                    ApplicationDataService taskTypesApplicationDataService = new ApplicationDataService();
                    ConfigurationWizardService taskTypesConfigurationWizardService = new ConfigurationWizardService(taskTypesApplicationDataService);
                    return await taskTypesConfigurationWizardService.TaskTypes();

                case "enableplanning":
                    ApplicationDataService planningApplicationDataService = new ApplicationDataService();
                    ConfigurationWizardService planningConfigurationWizardService = new ConfigurationWizardService(planningApplicationDataService);
                    return await planningConfigurationWizardService.EnablePlanning();

                case "repos":
                case "repositories":
                    ApplicationDataService reposApplicationDataService = new ApplicationDataService();
                    GitRepositoryConfigurationService gitRepositoryConfigurationService = new GitRepositoryConfigurationService(reposApplicationDataService);
                    return await gitRepositoryConfigurationService.Repos(args.Skip(1).ToArray());

                case "run":
                    await CreateHostBuilder(args.Skip(1).ToArray()).Build().RunAsync();
                    return 0;

                case "help":
                case "--help":
                case "-h":
                    PrintHelp();
                    return 0;

                default:
                    Console.Error.WriteLine($"Unknown command: {args[0]}");
                    PrintHelp();
                    return 1;
            }
        }

        public static IHostBuilder CreateHostBuilder(string[] args)
        {
            WorkerRuntimeOptions runtimeOptions = new WorkerRuntimeOptions
            {
                EnabledTaskTypesOverride = ParseTaskTypesOverride(args)
            };

            return Host.CreateDefaultBuilder(args).ConfigureServices((hostContext, services) =>
            {
                services.AddSingleton(runtimeOptions);
                services.AddSingleton<ApplicationDataService>();
                services.AddSingleton<ICommandHandler, ShellCommandHandler>();
                services.AddSingleton<ICommandHandler, AICommandHandler>();
                services.AddSingleton<ICommandHandler, GitflowCommandHandler>();
                services.AddSingleton<CommandDispatcher>();
                services.AddHostedService<Worker>();
            });
        }

        private static void PrintHelp()
        {
            Console.WriteLine("firstdraft");
            Console.WriteLine();
            Console.WriteLine("Usage:");
            Console.WriteLine("  firstdraft init    Create or update config.json interactively");
            Console.WriteLine("  firstdraft skills  Update worker skills interactively");
            Console.WriteLine("  firstdraft capacity  Update max concurrent gitflow tasks interactively");
            Console.WriteLine("  firstdraft taskTypes  Update enabled task types interactively");
            Console.WriteLine("  firstdraft enablePlanning  Configure AI planning for this client");
            Console.WriteLine("  firstdraft repos list|add|update|remove  Manage Git repositories for this worker");
            Console.WriteLine("  firstdraft run [--task-types ai,shell,gitflow]  Start the FirstDraft client worker");
            Console.WriteLine("  firstdraft help    Show this help");
        }

        private static string[]? ParseTaskTypesOverride(string[] args)
        {
            for (int index = 0; index < args.Length; index++)
            {
                string arg = args[index];
                string? value = null;

                if (arg.StartsWith("--task-types=", StringComparison.OrdinalIgnoreCase))
                {
                    value = arg.Substring("--task-types=".Length);
                }
                else if (string.Equals(arg, "--task-types", StringComparison.OrdinalIgnoreCase) && index + 1 < args.Length)
                {
                    value = args[index + 1];
                }

                if (value != null)
                {
                    return WorkerTaskTypeRegistry.ResolveEnabledTaskTypes(
                        value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
                }
            }

            return null;
        }
    }
}
