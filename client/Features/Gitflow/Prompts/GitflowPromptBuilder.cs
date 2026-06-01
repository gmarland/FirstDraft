using System.Text;

namespace FirstDraft.Features.Gitflow
{
  public static partial class GitflowCommandService
  {
    private static string FormatAttachmentPrompt(IReadOnlyList<LocalGitflowAttachment> attachments)
    {
      if (attachments.Count == 0) return "No Jira image attachments were included.";
      StringBuilder builder = new StringBuilder();
      foreach (LocalGitflowAttachment attachment in attachments)
      {
        builder.AppendLine($"- {attachment.Filename} ({attachment.MimeType}): {attachment.Path}");
      }
      return builder.ToString().TrimEnd();
    }

    private static string BuildImplementationPrompt(
        GitflowCommandPayload payload,
        IReadOnlyList<LocalGitflowAttachment> attachments)
    {
      return $"""
      Implement the following ticket in this repository.

      Ticket: {payload.TicketNumber}
      Ticket URL: {payload.TicketUrl ?? "not provided"}

      Title:
      {payload.Title ?? "not provided"}

      Description:
      {payload.Description ?? "not provided"}

      Jira image attachments:
      {FormatAttachmentPrompt(attachments)}

      Make the required code changes in this working tree. You may inspect files and run relevant local tests.
      Use the Jira image attachments as visual context when they are relevant to the requested change.
      Do not create commits, push branches, change remotes, or open a pull request.
      Keep command execution logs, command output, and raw tool output out of the final response.
      Do not include token usage, token counts, or model usage accounting in the final response.
      End your final response with these exact markdown sections:
      PR Summary:
      - Concisely describe the reviewer-facing changes.

      Tests:
      - List each test or build command you ran, or say "Not run" with the reason.
      """;
    }

    private static string BuildContinuationPrompt(GitflowCommandPayload payload)
    {
      return $"""
      Continue work on an existing draft pull request in this repository.

      Ticket: {payload.TicketNumber}
      Ticket URL: {payload.TicketUrl ?? "not provided"}
      Pull request: {payload.PrUrl ?? "not recorded"}
      Latest recorded commit: {payload.LatestCommit ?? "not recorded"}

      Original title:
      {payload.Title ?? "not provided"}

      Original description:
      {payload.Description ?? "not provided"}

      Previous task context:
      {payload.PreviousContext ?? "No previous context was provided."}

      New follow-up instruction:
      {payload.FollowUpInstructions}

      Make only the required follow-up code changes in this working tree. You may inspect files and run relevant local tests.
      Do not create commits, push branches, change remotes, or open a pull request.
      Keep command execution logs, command output, and raw tool output out of the final response.
      Do not include token usage, token counts, or model usage accounting in the final response.
      End your final response with these exact markdown sections:
      PR Summary:
      - Concisely describe the reviewer-facing changes.

      Tests:
      - List each test or build command you ran, or say "Not run" with the reason.
      """;
    }
  }
}
