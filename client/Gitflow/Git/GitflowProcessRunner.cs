using System.Diagnostics;
using System.Text;
using FirstDraft.Infrastructure.Logging;

namespace FirstDraft.Gitflow
{
  public static partial class GitflowCommandService
  {
    private static string RunGit(
        Log log,
        string workingDirectory,
        IReadOnlyList<string> arguments,
        int timeoutMinutes,
        Action<string, string> emit)
    {
      return RunProcess(log, workingDirectory, "git", arguments, timeoutMinutes, emit);
    }

    private static int RunProcessForExitCode(
        Log log,
        string workingDirectory,
        string executable,
        IReadOnlyList<string> arguments,
        int timeoutMinutes)
    {
      ProcessStartInfo psi = new ProcessStartInfo(executable)
      {
        UseShellExecute = false,
        RedirectStandardOutput = false,
        RedirectStandardError = false,
        WorkingDirectory = workingDirectory
      };

      foreach (string argument in arguments)
      {
        psi.ArgumentList.Add(argument);
      }

      using Process process = new Process { StartInfo = psi, EnableRaisingEvents = true };

      log.Debug($"Executing {executable} {FormatArguments(arguments)} in {workingDirectory}");
      try
      {
        process.Start();
      }
      catch (Exception ex)
      {
        throw new InvalidOperationException($"Unable to start '{executable}'. Ensure it is installed and available on PATH.", ex);
      }

      int timeoutMs = timeoutMinutes * 60000;
      if (!process.WaitForExit(timeoutMs))
      {
        KillProcess(process);
        throw new TimeoutException($"{executable} command timed out after {timeoutMinutes} minutes");
      }

      return process.ExitCode;
    }

    private static string RunProcess(
        Log log,
        string workingDirectory,
        string executable,
        IReadOnlyList<string> arguments,
        int timeoutMinutes,
        Action<string, string> emit)
    {
      ProcessStartInfo psi = new ProcessStartInfo(executable)
      {
        UseShellExecute = false,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        WorkingDirectory = workingDirectory
      };

      foreach (string argument in arguments)
      {
        psi.ArgumentList.Add(argument);
      }

      StringBuilder output = new StringBuilder();
      StringBuilder error = new StringBuilder();

      using Process process = new Process { StartInfo = psi, EnableRaisingEvents = true };

      process.OutputDataReceived += (_, e) =>
      {
        if (e.Data == null) return;
        lock (output) output.AppendLine(e.Data);
        emit("stdout", e.Data);
      };

      process.ErrorDataReceived += (_, e) =>
      {
        if (e.Data == null) return;
        lock (error) error.AppendLine(e.Data);
        emit("stderr", e.Data);
      };

      log.Debug($"Executing {executable} {FormatArguments(arguments)} in {workingDirectory}");
      try
      {
        process.Start();
      }
      catch (Exception ex)
      {
        throw new InvalidOperationException($"Unable to start '{executable}'. Ensure it is installed and available on PATH.", ex);
      }

      process.BeginOutputReadLine();
      process.BeginErrorReadLine();

      int timeoutMs = timeoutMinutes * 60000;
      if (!process.WaitForExit(timeoutMs))
      {
        KillProcess(process);
        throw new TimeoutException($"{executable} command timed out after {timeoutMinutes} minutes");
      }

      process.WaitForExit();

      string result = output.ToString();
      if (process.ExitCode != 0)
      {
        string errorText = error.ToString();
        throw new InvalidOperationException($"{executable} exited with code {process.ExitCode}: {errorText}");
      }

      return result;
    }

    private static void KillProcess(Process process)
    {
      try
      {
        process.Kill(entireProcessTree: true);
      }
      catch
      {
        process.Kill();
      }
    }

    private static string FormatArguments(IReadOnlyList<string> arguments)
    {
      return string.Join(" ", arguments.Select(QuoteArgument));
    }

    private static string QuoteArgument(string argument)
    {
      if (argument.Length == 0) return "\"\"";
      if (!argument.Any(char.IsWhiteSpace) && !argument.Contains('"')) return argument;
      return $"\"{argument.Replace("\"", "\\\"")}\"";
    }
  }
}
