using Microsoft.Extensions.Hosting;
using FirstDraft.Cli.Git;
using FirstDraft.Cli.Jira;
using FirstDraft.Cli.Setup;
using FirstDraft.Configuration;

namespace FirstDraft.Cli.Commands
{
    internal interface ICliCommand
    {
        IReadOnlyList<string> Names { get; }
        Task<int> Execute(string[] args);
    }

    internal sealed class CliCommandRegistry
    {
        private readonly IReadOnlyDictionary<string, ICliCommand> _commands;
        private readonly Action _printHelp;

        private CliCommandRegistry(IEnumerable<ICliCommand> commands, Action printHelp)
        {
            _commands = commands
                .SelectMany(command => command.Names.Select(name => new { Name = name, Command = command }))
                .ToDictionary(entry => entry.Name, entry => entry.Command, StringComparer.OrdinalIgnoreCase);
            _printHelp = printHelp;
        }

        public static CliCommandRegistry CreateDefault(
            Func<string[], IHostBuilder> createHostBuilder,
            Action printHelp)
        {
            return new CliCommandRegistry(new ICliCommand[]
            {
                new DelegateCliCommand("init", args => CreateConfigurationWizard().Init()),
                new DelegateCliCommand("skills", args => CreateConfigurationWizard().Skills()),
                new DelegateCliCommand("capacity", args => CreateConfigurationWizard().Capacity()),
                new DelegateCliCommand("tasktypes", args => CreateConfigurationWizard().TaskTypes()),
                new DelegateCliCommand("enableplanning", args => CreateConfigurationWizard().EnablePlanning()),
                new DelegateCliCommand("repos", args => new GitRepositoryConfigurationService(new ApplicationDataService()).Repos(args)),
                new DelegateCliCommand("integrations", args => new JiraIntegrationConfigurationService(new ApplicationDataService()).Integrations(args)),
                new DelegateCliCommand("run", async args =>
                {
                    if (args.Length > 0)
                    {
                        Console.Error.WriteLine($"Unknown run option: {args[0]}");
                        printHelp();
                        return 1;
                    }

                    await createHostBuilder(args).Build().RunAsync();
                    return 0;
                }),
                new DelegateCliCommand(new[] { "help", "--help", "-h" }, args =>
                {
                    printHelp();
                    return Task.FromResult(0);
                }),
            }, printHelp);
        }

        public Task<int> Execute(string[] args)
        {
            string commandName = args.Length > 0 ? args[0].ToLowerInvariant() : "run";
            string[] commandArgs = commandName == "run" && args.Length == 0
                ? Array.Empty<string>()
                : args.Skip(1).ToArray();

            if (_commands.TryGetValue(commandName, out ICliCommand? command))
            {
                return command.Execute(commandArgs);
            }

            Console.Error.WriteLine($"Unknown command: {args[0]}");
            _printHelp();
            return Task.FromResult(1);
        }

        private static ConfigurationWizardService CreateConfigurationWizard()
        {
            return new ConfigurationWizardService(new ApplicationDataService());
        }
    }

    internal sealed class DelegateCliCommand : ICliCommand
    {
        private readonly Func<string[], Task<int>> _execute;

        public DelegateCliCommand(string name, Func<string[], Task<int>> execute)
            : this(new[] { name }, execute)
        {
        }

        public DelegateCliCommand(IReadOnlyList<string> names, Func<string[], Task<int>> execute)
        {
            Names = names;
            _execute = execute;
        }

        public IReadOnlyList<string> Names { get; }

        public Task<int> Execute(string[] args)
        {
            return _execute(args);
        }
    }
}
