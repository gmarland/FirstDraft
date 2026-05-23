namespace FirstDraft.Gitflow
{
  public sealed record GitflowCommandPayload(
      string RepositoryUrl,
      string SourceBranch,
      string TicketNumber,
      string? Description = null,
      string? Title = null,
      string? Action = null,
      string? WorkingBranch = null,
      string? PrUrl = null,
      string? LatestCommit = null,
      string? FollowUpInstructions = null,
      string? PreviousContext = null,
      string? TicketUrl = null,
      string? TargetBranch = null,
      IReadOnlyList<GitflowAttachmentPayload>? Attachments = null);

  public sealed record GitflowAttachmentPayload(
      string Id,
      string Filename,
      string MimeType,
      long? Size = null,
      string? DownloadUrl = null);

  internal sealed record LocalGitflowAttachment(
      string Id,
      string Filename,
      string MimeType,
      string Path);
}
