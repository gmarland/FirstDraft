using System.Diagnostics;
using System.Text;
using FirstDraft.Commands;
using FirstDraft.Infrastructure.Logging;

namespace FirstDraft.Infrastructure.Processes
{
  public sealed record ProcessRunRequest(
      string Executable,
      IReadOnlyList<string> Arguments,
      string WorkingDirectory,
      int TimeoutMinutes,
      string TimeoutMessage,
      string FailureMessage,
      Action<CommandLineOutputChunk>? OutputChunkHandler = null,
      bool RedirectOutput = true);

  public sealed record ProcessRunResult(int ExitCode, string StandardOutput, string StandardError)
  {
    public string CombinedOutput => StandardError.Length > 0
        ? StandardOutput + StandardError
        : StandardOutput;
  }

  public interface IProcessRunner
  {
    ProcessRunResult Run(ProcessRunRequest request);
  }

  public sealed class ProcessRunner : IProcessRunner
  {
    private readonly Log _log;

    public ProcessRunner(Log log)
    {
      _log = log;
    }

    public ProcessRunResult Run(ProcessRunRequest request)
    {
      ProcessStartInfo psi = new ProcessStartInfo(request.Executable)
      {
        UseShellExecute = false,
        RedirectStandardOutput = request.RedirectOutput,
        RedirectStandardError = request.RedirectOutput,
        WorkingDirectory = request.WorkingDirectory
      };

      foreach (string argument in request.Arguments)
      {
        psi.ArgumentList.Add(argument);
      }

      StringBuilder output = new StringBuilder();
      StringBuilder error = new StringBuilder();
      long sequence = 0;

      using Process process = new Process { StartInfo = psi, EnableRaisingEvents = true };

      if (request.RedirectOutput)
      {
        process.OutputDataReceived += (_, e) =>
        {
          if (e.Data == null) return;
          lock (output) output.AppendLine(e.Data);
          request.OutputChunkHandler?.Invoke(new CommandLineOutputChunk(
              Interlocked.Increment(ref sequence),
              "stdout",
              e.Data,
              DateTime.UtcNow));
        };

        process.ErrorDataReceived += (_, e) =>
        {
          if (e.Data == null) return;
          lock (error) error.AppendLine(e.Data);
          request.OutputChunkHandler?.Invoke(new CommandLineOutputChunk(
              Interlocked.Increment(ref sequence),
              "stderr",
              e.Data,
              DateTime.UtcNow));
        };
      }

      _log.Debug($"Executing {request.Executable} {FormatArguments(request.Arguments)} in {request.WorkingDirectory}");
      try
      {
        process.Start();
      }
      catch (Exception ex)
      {
        throw new InvalidOperationException($"Unable to start '{request.Executable}'. Ensure it is installed and available on PATH.", ex);
      }

      if (request.RedirectOutput)
      {
        process.BeginOutputReadLine();
        process.BeginErrorReadLine();
      }

      int timeoutMs = request.TimeoutMinutes * 60000;
      if (!process.WaitForExit(timeoutMs))
      {
        KillProcess(process);
        throw new TimeoutException(request.TimeoutMessage);
      }

      if (request.RedirectOutput)
      {
        process.WaitForExit();
      }

      ProcessRunResult result = new ProcessRunResult(process.ExitCode, output.ToString(), error.ToString());
      if (result.ExitCode != 0)
      {
        string errorSuffix = string.IsNullOrWhiteSpace(result.StandardError)
            ? string.Empty
            : $": {result.StandardError}";
        throw new InvalidOperationException($"{request.FailureMessage} {result.ExitCode}{errorSuffix}");
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
