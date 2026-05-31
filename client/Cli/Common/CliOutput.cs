namespace FirstDraft.Cli.Common
{
    public static class CliOutput
    {
        public static void PrintConfigWritten(string configLocation)
        {
            Console.WriteLine($"Config written to {configLocation}");
        }

        public static int PrintHelp(string? error, params string[] usageLines)
        {
            if (!string.IsNullOrWhiteSpace(error))
            {
                Console.Error.WriteLine(error);
                Console.Error.WriteLine();
            }

            Console.Error.WriteLine("Usage:");
            foreach (string usageLine in usageLines)
            {
                Console.Error.WriteLine(usageLine);
            }

            return string.IsNullOrWhiteSpace(error) ? 0 : 1;
        }
    }
}
