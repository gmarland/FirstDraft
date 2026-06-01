using System.Text;

namespace FirstDraft.Cli.Common
{
    public static class ConsolePrompt
    {
        public static string Prompt(string label, string defaultValue)
        {
            string suffix = !string.IsNullOrWhiteSpace(defaultValue) ? $" [{defaultValue}]" : string.Empty;
            Console.Write($"{label}{suffix}: ");

            string? input = Console.ReadLine();
            if (string.IsNullOrWhiteSpace(input)) return defaultValue ?? string.Empty;

            return input.Trim();
        }

        public static string PromptUntilValid(string label, string defaultValue, Func<string, string?> validate)
        {
            while (true)
            {
                string value = Prompt(label, defaultValue);
                string? error = validate(value);
                if (string.IsNullOrEmpty(error)) return value;

                Console.Error.WriteLine(error);
            }
        }

        public static string PromptRequired(string label, string defaultValue)
        {
            return PromptUntilValid(label, defaultValue, value =>
            {
                if (string.IsNullOrWhiteSpace(value)) return $"{label} is required";
                return null;
            });
        }

        public static string PromptSensitiveRequired(string label, string defaultValue = "", string? requiredMessage = null)
        {
            while (true)
            {
                string value = PromptSensitive(label, defaultValue);
                if (!string.IsNullOrWhiteSpace(value)) return value.Trim();

                Console.Error.WriteLine(requiredMessage ?? $"{label} is required");
            }
        }

        public static int PromptInt(string label, int defaultValue, int min, int max)
        {
            while (true)
            {
                string input = Prompt(label, defaultValue.ToString());
                if (int.TryParse(input, out int value) && value >= min && value <= max)
                {
                    return value;
                }

                Console.Error.WriteLine($"{label} must be between {min} and {max}");
            }
        }

        public static int? PromptOptionalInt(string label, int? defaultValue, int min, int max, string emptyLabel)
        {
            while (true)
            {
                string suffix = defaultValue.HasValue
                    ? $" [{defaultValue.Value}; empty for {emptyLabel}]"
                    : $" [{emptyLabel}]";
                Console.Write($"{label}{suffix}: ");

                string? input = Console.ReadLine();
                if (string.IsNullOrWhiteSpace(input) || string.Equals(input.Trim(), emptyLabel, StringComparison.OrdinalIgnoreCase))
                {
                    return null;
                }

                if (int.TryParse(input.Trim(), out int value) && value >= min && value <= max)
                {
                    return value;
                }

                Console.Error.WriteLine($"{label} must be between {min} and {max}, or {emptyLabel}");
            }
        }

        public static bool PromptBool(string label, bool defaultValue)
        {
            string defaultText = defaultValue ? "yes" : "no";

            while (true)
            {
                string input = Prompt($"{label} (yes/no)", defaultText);

                if (IsYes(input)) return true;
                if (IsNo(input)) return false;

                Console.Error.WriteLine($"{label} must be yes or no");
            }
        }

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

        public static T[] PromptMultiSelection<T>(string label, IReadOnlyList<T> options, Func<T, string> format)
        {
            Console.WriteLine();
            Console.WriteLine($"{label}:");
            for (int index = 0; index < options.Count; index++)
            {
                Console.WriteLine($"  {index + 1}. {format(options[index])}");
            }

            while (true)
            {
                Console.Write($"Select {label.ToLowerInvariant()} numbers separated by commas [1-{options.Count}]: ");
                string? input = Console.ReadLine();
                if (string.IsNullOrWhiteSpace(input))
                {
                    Console.Error.WriteLine("Enter at least one listed number.");
                    continue;
                }

                List<int> selectedIndexes = new List<int>();
                bool valid = true;
                foreach (string part in input.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                {
                    if (!int.TryParse(part, out int selected) || selected < 1 || selected > options.Count)
                    {
                        valid = false;
                        break;
                    }

                    int index = selected - 1;
                    if (!selectedIndexes.Contains(index)) selectedIndexes.Add(index);
                }

                if (valid && selectedIndexes.Count > 0)
                {
                    return selectedIndexes.Select(index => options[index]).ToArray();
                }

                Console.Error.WriteLine("Enter one or more listed numbers separated by commas.");
            }
        }

        public static string PromptSensitive(string label, string defaultValue = "")
        {
            string suffix = !string.IsNullOrWhiteSpace(defaultValue) ? " [configured]" : string.Empty;
            Console.Write($"{label}{suffix}: ");

            if (Console.IsInputRedirected)
            {
                string? redirectedInput = Console.ReadLine();
                return string.IsNullOrWhiteSpace(redirectedInput) ? defaultValue ?? string.Empty : redirectedInput.Trim();
            }

            string input = ReadHiddenLine();
            return string.IsNullOrWhiteSpace(input) ? defaultValue ?? string.Empty : input.Trim();
        }

        private static string ReadHiddenLine()
        {
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

                if (key.Key == ConsoleKey.Escape)
                {
                    value.Clear();
                    continue;
                }

                if (!char.IsControl(key.KeyChar)) value.Append(key.KeyChar);
            }
        }

        private static bool IsYes(string value)
        {
            return string.Equals(value, "yes", StringComparison.OrdinalIgnoreCase) ||
                   string.Equals(value, "y", StringComparison.OrdinalIgnoreCase) ||
                   string.Equals(value, "true", StringComparison.OrdinalIgnoreCase) ||
                   string.Equals(value, "1", StringComparison.OrdinalIgnoreCase);
        }

        private static bool IsNo(string value)
        {
            return string.Equals(value, "no", StringComparison.OrdinalIgnoreCase) ||
                   string.Equals(value, "n", StringComparison.OrdinalIgnoreCase) ||
                   string.Equals(value, "false", StringComparison.OrdinalIgnoreCase) ||
                   string.Equals(value, "0", StringComparison.OrdinalIgnoreCase);
        }
    }
}
