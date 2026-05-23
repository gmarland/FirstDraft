using System.Text;

namespace FirstDraft.Gitflow
{
  public static partial class GitflowCommandService
  {
    private static string BuildPullRequestBody(string aiResult, string ticketNumber, string? ticketUrl, IReadOnlyList<string> changedFiles)
    {
      StringBuilder body = new StringBuilder();
      body.Append(BuildPullRequestBodyPrefix(ticketNumber, ticketUrl));

      string summary = ExtractMarkdownSection(aiResult, new[] { "PR Summary", "Summary" });
      if (string.IsNullOrWhiteSpace(summary))
      {
        summary = BuildFallbackSummary(aiResult);
      }

      body.AppendLine("Summary:");
      body.AppendLine(NormalizeBodySection(summary));
      body.AppendLine();

      body.AppendLine("Changed files:");
      if (changedFiles.Count == 0)
      {
        body.AppendLine("- No changed files were recorded.");
      }
      else
      {
        foreach (string file in changedFiles.Take(30))
        {
          body.AppendLine($"- `{file}`");
        }
        if (changedFiles.Count > 30)
        {
          body.AppendLine($"- ...and {changedFiles.Count - 30} more");
        }
      }
      body.AppendLine();

      string tests = ExtractMarkdownSection(aiResult, new[] { "Tests", "Testing" });
      body.AppendLine("Tests:");
      body.AppendLine(string.IsNullOrWhiteSpace(tests)
          ? "- See FirstDraft command output for test details."
          : NormalizeBodySection(tests));

      return TrimPullRequestBody(body.ToString());
    }

    private static string BuildCleanAiSummary(string aiResult)
    {
      string summary = ExtractMarkdownSectionFromLastHeading(aiResult, new[] { "PR Summary", "Summary" });
      string tests = ExtractMarkdownSectionFromLastHeading(aiResult, new[] { "Tests", "Testing" });

      if (string.IsNullOrWhiteSpace(summary) && string.IsNullOrWhiteSpace(tests))
      {
        return """
        PR Summary:
        - Implementation completed. See FirstDraft command output for details.

        Tests:
        - See FirstDraft command output for test details.
        """;
      }

      StringBuilder clean = new StringBuilder();
      clean.AppendLine("PR Summary:");
      clean.AppendLine(string.IsNullOrWhiteSpace(summary)
          ? "- Implementation completed. See FirstDraft command output for details."
          : NormalizeBodySection(summary));
      clean.AppendLine();
      clean.AppendLine("Tests:");
      clean.AppendLine(string.IsNullOrWhiteSpace(tests)
          ? "- See FirstDraft command output for test details."
          : NormalizeBodySection(tests));
      return clean.ToString().TrimEnd();
    }

    private static string BuildPullRequestBodyPrefix(string ticketNumber, string? ticketUrl)
    {
      StringBuilder prefix = new StringBuilder();
      prefix.AppendLine($"Ticket: {ticketNumber}");
      if (!string.IsNullOrWhiteSpace(ticketUrl))
      {
        prefix.AppendLine($"Jira: {ticketUrl}");
      }
      prefix.AppendLine();
      return prefix.ToString();
    }

    private static string ExtractMarkdownSection(string text, IReadOnlyList<string> headings)
    {
      string[] lines = text.Replace("\r\n", "\n").Split('\n');
      int start = -1;
      for (int i = 0; i < lines.Length; i++)
      {
        if (IsHeading(lines[i], headings))
        {
          start = i + 1;
          break;
        }
      }
      if (start < 0) return "";

      int end = lines.Length;
      for (int i = start; i < lines.Length; i++)
      {
        if (IsAnyHeading(lines[i]))
        {
          end = i;
          break;
        }
      }

      return string.Join('\n', lines.Skip(start).Take(end - start)).Trim();
    }

    private static string ExtractMarkdownSectionFromLastHeading(string text, IReadOnlyList<string> headings)
    {
      string[] lines = text.Replace("\r\n", "\n").Split('\n');
      int start = -1;
      for (int i = lines.Length - 1; i >= 0; i--)
      {
        if (IsHeading(lines[i], headings))
        {
          start = i + 1;
          break;
        }
      }
      if (start < 0) return "";

      int end = lines.Length;
      for (int i = start; i < lines.Length; i++)
      {
        if (IsAnyHeading(lines[i]))
        {
          end = i;
          break;
        }
      }

      return string.Join('\n', lines.Skip(start).Take(end - start)).Trim();
    }

    private static bool IsHeading(string line, IReadOnlyList<string> headings)
    {
      string normalized = NormalizeHeading(line);
      return headings.Any(heading => string.Equals(normalized, heading, StringComparison.OrdinalIgnoreCase));
    }

    private static bool IsAnyHeading(string line)
    {
      string normalized = NormalizeHeading(line);
      return normalized.Length > 0 && normalized.Length <= 80 && !normalized.Contains('.') && !normalized.Contains(',');
    }

    private static string NormalizeHeading(string line)
    {
      string normalized = line.Trim().TrimStart('#').Trim().Trim('*').Trim();
      if (!normalized.EndsWith(":", StringComparison.Ordinal)) return "";
      return normalized.Substring(0, normalized.Length - 1).Trim();
    }

    private static string BuildFallbackSummary(string aiResult)
    {
      string[] lines = aiResult.Replace("\r\n", "\n").Split('\n')
          .Select(line => line.Trim())
          .Where(line => !string.IsNullOrWhiteSpace(line))
          .Where(line => !line.StartsWith("```", StringComparison.Ordinal))
          .Take(8)
          .ToArray();

      if (lines.Length == 0) return "- See FirstDraft command output for implementation details.";

      string summary = string.Join('\n', lines);
      if (summary.Length <= 1200) return summary;
      return summary.Substring(0, 1200).TrimEnd() + "...";
    }

    private static string NormalizeBodySection(string value)
    {
      string normalized = value.Trim();
      if (string.IsNullOrWhiteSpace(normalized)) return "- Not recorded.";
      if (normalized.StartsWith("- ", StringComparison.Ordinal) || normalized.StartsWith("* ", StringComparison.Ordinal))
      {
        return normalized;
      }
      return "- " + normalized.Replace("\n", "\n- ");
    }

    private static string TrimPullRequestBody(string body)
    {
      if (body.Length <= MaxPullRequestBodyCharacters) return body.TrimEnd();

      string truncationNotice = "\n\n[FirstDraft truncated this pull request body because GitHub pull request bodies are limited to 65,536 characters.]";
      int availableCharacters = MaxPullRequestBodyCharacters - truncationNotice.Length;
      if (availableCharacters <= 0) return truncationNotice.Trim();
      return body.Substring(0, availableCharacters).TrimEnd() + truncationNotice;
    }
  }
}
