using System.Net.Http.Headers;
using System.Text;
using System.Text.RegularExpressions;
using FirstDraft.Cli.Jira;
using FirstDraft.Configuration;
using FirstDraft.Infrastructure.Logging;

namespace FirstDraft.Features.Gitflow
{
  public static partial class GitflowCommandService
  {
    private const int MaxAttachmentDownloadBytes = 10 * 1024 * 1024;
    private static readonly HttpClient AttachmentHttpClient = new HttpClient();

    private static IReadOnlyList<LocalGitflowAttachment> DownloadAttachments(
        Log log,
        ApplicationData applicationData,
        GitflowCommandPayload payload,
        string worktreePath,
        int timeoutMinutes,
        Action<string, string> emit)
    {
      IReadOnlyList<GitflowAttachmentPayload> attachments = payload.Attachments ?? Array.Empty<GitflowAttachmentPayload>();
      if (attachments.Count == 0) return Array.Empty<LocalGitflowAttachment>();

      string attachmentDirectory = ResolveAttachmentDirectory(worktreePath);
      Directory.CreateDirectory(attachmentDirectory);

      List<LocalGitflowAttachment> localAttachments = new List<LocalGitflowAttachment>();
      foreach (GitflowAttachmentPayload attachment in attachments.Take(5))
      {
        if (string.IsNullOrWhiteSpace(attachment.IntegrationId) || string.IsNullOrWhiteSpace(attachment.ContentUrl))
          throw new InvalidOperationException($"Jira attachment {attachment.Filename} is missing direct Jira download metadata.");

        JiraIntegrationConfig integration = ResolveJiraIntegration(applicationData, attachment.IntegrationId);
        Uri uri = ResolveJiraAttachmentUri(integration, attachment.ContentUrl);
        string filename = BuildAttachmentFilename(attachment, localAttachments.Count + 1);
        string filePath = Path.Combine(attachmentDirectory, filename);

        emit("stdout", $"Downloading Jira image attachment: {attachment.Filename}");
        using HttpRequestMessage request = new HttpRequestMessage(HttpMethod.Get, uri);
        request.Headers.Authorization = BuildJiraAuthorization(applicationData, integration);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("*/*"));

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

    private static JiraIntegrationConfig ResolveJiraIntegration(ApplicationData applicationData, string integrationId)
    {
      JiraIntegrationConfig? integration = JiraIntegrationConfigService
          .NormalizeIntegrations(applicationData.JiraIntegrations)
          .FirstOrDefault(candidate =>
              string.Equals(candidate.IntegrationId, integrationId, StringComparison.OrdinalIgnoreCase));

      if (integration == null)
        throw new InvalidOperationException($"Jira integration {integrationId} is not configured for this worker.");
      if (string.IsNullOrWhiteSpace(integration.GetApiToken(applicationData)))
        throw new InvalidOperationException($"Jira integration {integrationId} does not have a readable API token.");

      return integration;
    }

    private static AuthenticationHeaderValue BuildJiraAuthorization(ApplicationData applicationData, JiraIntegrationConfig integration)
    {
      string credentials = Convert.ToBase64String(Encoding.UTF8.GetBytes($"{integration.Email}:{integration.GetApiToken(applicationData)}"));
      return new AuthenticationHeaderValue("Basic", credentials);
    }

    private static Uri ResolveJiraAttachmentUri(JiraIntegrationConfig integration, string contentUrl)
    {
      if (!Uri.TryCreate(contentUrl, UriKind.Absolute, out Uri? attachmentUri))
        throw new InvalidOperationException("Jira attachment URL must be absolute.");

      Uri siteUri = new Uri($"{JiraIntegrationConfigService.CleanSiteUrl(integration.SiteUrl)}/");
      if (!string.Equals(attachmentUri.Scheme, siteUri.Scheme, StringComparison.OrdinalIgnoreCase) ||
          !string.Equals(attachmentUri.Host, siteUri.Host, StringComparison.OrdinalIgnoreCase) ||
          attachmentUri.Port != siteUri.Port)
      {
        throw new InvalidOperationException("Jira attachment URL does not belong to the configured Jira site.");
      }

      return attachmentUri;
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
