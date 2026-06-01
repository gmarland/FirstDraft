using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using FirstDraft.Cli.Commands;
using FirstDraft.Commands;
using FirstDraft.Commands.Handlers;
using FirstDraft.Configuration;

namespace FirstDraft
{
    public class Program
    {
        public static async Task<int> Main(string[] args)
        {
            CliCommandRegistry registry = CliCommandRegistry.CreateDefault(CreateHostBuilder, PrintHelp);
            return await registry.Execute(args);
        }

        public static IHostBuilder CreateHostBuilder(string[] args)
        {
            return Host.CreateDefaultBuilder(args).ConfigureServices((hostContext, services) =>
            {
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
            Console.WriteLine("  firstdraft integrations list|details|add|configure|remove  Manage Jira integrations for this worker");
            Console.WriteLine("  firstdraft run    Start the FirstDraft client worker");
            Console.WriteLine("  firstdraft help    Show this help");
        }
    }
}
