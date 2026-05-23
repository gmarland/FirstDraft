namespace FirstDraft.Gitflow
{
  public static partial class GitflowCommandService
  {
    private static IReadOnlyList<string> ParseChangedFiles(string porcelainStatus)
    {
      List<string> files = new List<string>();
      foreach (string rawLine in porcelainStatus.Split('\n', StringSplitOptions.RemoveEmptyEntries))
      {
        string line = rawLine.TrimEnd();
        if (line.Length <= 3) continue;

        string path = line.Substring(3).Trim();
        int renameIndex = path.IndexOf(" -> ", StringComparison.Ordinal);
        if (renameIndex >= 0) path = path.Substring(renameIndex + 4).Trim();
        if (!string.IsNullOrWhiteSpace(path)) files.Add(path);
      }

      return files.Distinct(StringComparer.Ordinal).OrderBy(file => file, StringComparer.Ordinal).ToArray();
    }
  }
}
