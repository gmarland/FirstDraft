using System.Text;

namespace FirstDraft.Gitflow
{
  public static partial class GitflowCommandService
  {
    private static string BuildPullRequestBody(string aiResult, string ticketNumber, string? ticketUrl)
    {
      StringBuilder body = new StringBuilder();
      body.Append(BuildPullRequestBodyPrefix(ticketNumber, ticketUrl));

      body.AppendLine("Summary:");
      body.AppendLine(ExtractChangeSummary(aiResult));

      return TrimPullRequestBody(body.ToString());
    }

    private static string BuildCleanAiSummary(string aiResult)
    {
      return ExtractChangeSummary(aiResult);
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
      string finalResult = ExtractFinalExecutionOutput(aiResult);
      List<string> lines = new List<string>();
      foreach (string rawLine in finalResult.Replace("\r\n", "\n").Split('\n'))
      {
        string line = rawLine.Trim();
        if (string.Equals(NormalizeHeading(line), "Tests", StringComparison.OrdinalIgnoreCase)) break;
        if (string.Equals(NormalizeHeading(line), "Testing", StringComparison.OrdinalIgnoreCase)) break;
        if (string.IsNullOrWhiteSpace(line)) continue;
        if (line.StartsWith("```", StringComparison.Ordinal)) continue;
        lines.Add(line);
        if (lines.Count >= 6) break;
      }

      if (lines.Count == 0) return "- See FirstDraft command output for implementation details.";

      string summary = string.Join('\n', lines);
      if (summary.Length <= 800) return summary;
      return summary.Substring(0, 800).TrimEnd() + "...";
    }

    private static string ExtractChangeSummary(string aiResult)
    {
      string summary = ExtractMarkdownSectionFromLastHeading(aiResult, new[] { "PR Summary", "Summary" });
      if (string.IsNullOrWhiteSpace(summary))
      {
        summary = BuildFallbackSummary(aiResult);
      }

      return NormalizeBodySection(summary);
    }

    private static string ExtractFinalExecutionOutput(string aiResult)
    {
      const string delimiter = "----- Execution -----";
      int delimiterIndex = aiResult.LastIndexOf(delimiter, StringComparison.Ordinal);
      if (delimiterIndex < 0) return aiResult;
      return aiResult.Substring(delimiterIndex + delimiter.Length);
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
