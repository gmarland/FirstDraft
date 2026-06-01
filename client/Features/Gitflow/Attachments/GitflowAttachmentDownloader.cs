using System.Text.RegularExpressions;
using FirstDraft.Infrastructure.Logging;

namespace FirstDraft.Features.Gitflow
{
  public static partial class GitflowCommandService
  {
    private const int MaxAttachmentDownloadBytes = 10 * 1024 * 1024;
    private static readonly HttpClient AttachmentHttpClient = new HttpClient();

    private static IReadOnlyList<LocalGitflowAttachment> DownloadAttachments(
        Log log,
        GitflowCommandPayload payload,
        string apiBaseUrl,
        string workerAccessToken,
        string worktreePath,
        int timeoutMinutes,
        Action<string, string> emit)
    {
      IReadOnlyList<GitflowAttachmentPayload> attachments = payload.Attachments ?? Array.Empty<GitflowAttachmentPayload>();
      if (attachments.Count == 0) return Array.Empty<LocalGitflowAttachment>();
      if (string.IsNullOrWhiteSpace(apiBaseUrl)) throw new InvalidOperationException("API base URL is required to download Jira attachments.");
      if (string.IsNullOrWhiteSpace(workerAccessToken)) throw new InvalidOperationException("Worker access token is required to download Jira attachments.");

      string attachmentDirectory = ResolveAttachmentDirectory(worktreePath);
      Directory.CreateDirectory(attachmentDirectory);

      List<LocalGitflowAttachment> localAttachments = new List<LocalGitflowAttachment>();
      foreach (GitflowAttachmentPayload attachment in attachments.Take(5))
      {
        if (string.IsNullOrWhiteSpace(attachment.DownloadUrl)) continue;

        Uri uri = ResolveAttachmentUri(apiBaseUrl, attachment.DownloadUrl);
        string filename = BuildAttachmentFilename(attachment, localAttachments.Count + 1);
        string filePath = Path.Combine(attachmentDirectory, filename);

        emit("stdout", $"Downloading Jira image attachment: {attachment.Filename}");
        using HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Get, uri);
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", workerAccessToken);

        using CancellationTokenSource timeout = new CancellationTokenSource(TimeSpan.FromMinutes(Math.Max(1, timeoutMinutes)));
        using HttpResponseMessage response = AttachmentHttpClient.Send(request, timeout.Token);
        response.EnsureSuccessStatusCode();

        byte[] body = response.Content.ReadAsByteArrayAsync(timeout.Token).GetAwaiter().GetResult();
        if (body.Length > MaxAttachmentDownloadBytes)
        {
          throw new InvalidOperationException($"Jira attachment {attachment.Filename} is too large to include.");
        }

        File.WriteAllBytes(filePath, body);
        localAttachments.Add(new LocalGitflowAttachment(
            attachment.Id,
            attachment.Filename,
            string.IsNullOrWhiteSpace(attachment.MimeType) ? response.Content.Headers.ContentType?.MediaType ?? "image" : attachment.MimeType,
            filePath));
      }

      return localAttachments;
    }

    private static Uri ResolveAttachmentUri(string apiBaseUrl, string downloadUrl)
    {
      if (Uri.TryCreate(downloadUrl, UriKind.Absolute, out Uri? absolute)) return absolute;
      return new Uri(new Uri(apiBaseUrl.TrimEnd('/') + "/"), downloadUrl.TrimStart('/'));
    }

    private static string ResolveAttachmentDirectory(string worktreePath)
    {
      return Path.Combine(worktreePath, ".firstdraft-ticket-assets");
    }

    private static string BuildAttachmentFilename(GitflowAttachmentPayload attachment, int index)
    {
      string original = string.IsNullOrWhiteSpace(attachment.Filename) ? $"jira-image-{index}" : attachment.Filename;
      string name = Path.GetFileName(original);
      if (string.IsNullOrWhiteSpace(name)) name = $"jira-image-{index}";

      string sanitized = Regex.Replace(name, @"[^A-Za-z0-9._-]+", "_").Trim('_', '.', '-');
      if (string.IsNullOrWhiteSpace(sanitized)) sanitized = $"jira-image-{index}";
      return $"{index:00}-{sanitized}";
    }

    private static void RemoveAttachmentDirectory(
        Log log,
        string worktreePath,
        int timeoutMinutes,
        Action<string, string> emit)
    {
      string attachmentDirectory = ResolveAttachmentDirectory(worktreePath);
      if (!Directory.Exists(attachmentDirectory)) return;

      try
      {
        Directory.Delete(attachmentDirectory, recursive: true);
        emit("stdout", "Removed temporary Jira image attachments.");
      }
      catch (Exception ex)
      {
        log.Error($"Failed to remove temporary Jira attachment directory {attachmentDirectory}", ex);
        throw new InvalidOperationException("Failed to remove temporary Jira image attachments before committing.", ex);
      }
    }
  }
}
