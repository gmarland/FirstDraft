namespace FirstDraft.Cli.Common
{
    public static class CliOutput
    {
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

        public static void PrintTable(string[] headers, IEnumerable<string[]> rows)
        {
            string[][] materializedRows = rows.ToArray();
            int[] widths = headers
                .Select((header, index) => Math.Max(
                    header.Length,
                    materializedRows.Length == 0 ? 0 : materializedRows.Max(row => GetCell(row, index).Length)))
                .ToArray();

            PrintTableRow(headers, widths);
            foreach (string[] row in materializedRows)
            {
                PrintTableRow(row, widths);
            }
        }

        private static void PrintTableRow(string[] row, int[] widths)
        {
            for (int index = 0; index < widths.Length; index++)
            {
                string cell = GetCell(row, index);
                Console.Write(index == widths.Length - 1 ? cell : cell.PadRight(widths[index]) + "  ");
            }

            Console.WriteLine();
        }

        private static string GetCell(string[] row, int index)
        {
            if (index >= row.Length) return string.Empty;
            return row[index] ?? string.Empty;
        }
    }
}
