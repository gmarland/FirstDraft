using System.Text;

namespace FirstDraft.Cli.Common
{
    public static class ConsolePrompt
    {
        public static T PromptSelection<T>(string label, IReadOnlyList<T> options, Func<T, string> format)
        {
            Console.WriteLine();
            Console.WriteLine($"{label}:");
            for (int index = 0; index < options.Count; index++)
            {
                Console.WriteLine($"  {index + 1}. {format(options[index])}");
            }

            while (true)
            {
                Console.Write($"Select {label.ToLowerInvariant()} [1-{options.Count}]: ");
                string? input = Console.ReadLine();
                if (int.TryParse(input, out int selected) && selected >= 1 && selected <= options.Count)
                {
                    return options[selected - 1];
                }

                Console.Error.WriteLine("Enter one of the listed numbers.");
            }
        }

        public static string PromptUntilValid(string label, string defaultValue, Func<string, string?> validate)
        {
            while (true)
            {
                string value = Prompt(label, defaultValue);
                string? error = validate(value);
                if (error == null) return value;

                Console.Error.WriteLine(error);
            }
        }

        public static string PromptSensitiveRequired(string label)
        {
            while (true)
            {
                string value = PromptSensitive(label);
                if (!string.IsNullOrWhiteSpace(value)) return value.Trim();
                Console.Error.WriteLine($"{label} is required.");
            }
        }

        private static string Prompt(string label, string defaultValue)
        {
            string suffix = string.IsNullOrWhiteSpace(defaultValue) ? string.Empty : $" [{defaultValue}]";
            Console.Write($"{label}{suffix}: ");
            string? input = Console.ReadLine();
            return string.IsNullOrWhiteSpace(input) ? defaultValue : input.Trim();
        }

        private static string PromptSensitive(string label)
        {
            Console.Write($"{label}: ");
            StringBuilder value = new StringBuilder();

            while (true)
            {
                ConsoleKeyInfo key = Console.ReadKey(intercept: true);
                if (key.Key == ConsoleKey.Enter)
                {
                    Console.WriteLine();
                    return value.ToString();
                }

                if (key.Key == ConsoleKey.Backspace)
                {
                    if (value.Length > 0) value.Length--;
                    continue;
                }

                if (!char.IsControl(key.KeyChar)) value.Append(key.KeyChar);
            }
        }
    }
}
