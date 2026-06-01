using System.Runtime.InteropServices;
using FirstDraft.Commands;
using FirstDraft.Configuration;
using FirstDraft.Infrastructure.Logging;
using FirstDraft.Infrastructure.Processes;

namespace FirstDraft.Features.Shell
{
  public static class ShellCommandService
  {
    public static string Execute(
        Log log,
        ApplicationData applicationData,
        string command,
        int timeoutMinutes,
        Action<CommandLineOutputChunk>? outputChunkHandler = null)
    {
      string workingDirectory = !string.IsNullOrEmpty(applicationData.AIWorkingDirectory)
          ? applicationData.AIWorkingDirectory
          : Directory.GetCurrentDirectory();

      ProcessCommand processCommand = BuildProcessCommand(command);
      ProcessRunResult result = new ProcessRunner(log).Run(new ProcessRunRequest(
          processCommand.Executable,
          processCommand.Arguments,
          workingDirectory,
          timeoutMinutes,
          $"Shell command timed out after {timeoutMinutes} minutes",
          "Shell command exited with code",
          outputChunkHandler));

      return result.CombinedOutput;
    }

    private static ProcessCommand BuildProcessCommand(string command)
    {
      if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
      {
        return new ProcessCommand("cmd.exe", new[] { "/c", command });
      }

      return new ProcessCommand("/bin/sh", new[] { "-lc", command });
    }

    private sealed record ProcessCommand(string Executable, IReadOnlyList<string> Arguments);
  }
}
