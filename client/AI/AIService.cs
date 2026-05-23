using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using FirstDraft.Commands;
using FirstDraft.Configuration;
using FirstDraft.Infrastructure.Logging;

namespace FirstDraft.AI
{
  public static class AIService
  {
    public static string SendMessage(
        Log log,
        ApplicationData applicationData,
        string message,
        int timeoutMinutes,
        Action<CommandLineOutputChunk>? outputChunkHandler = null,
        string? workingDirectoryOverride = null)
    {
      Stopwatch stopwatch = Stopwatch.StartNew();
      string workingDirectory = !string.IsNullOrEmpty(workingDirectoryOverride)
          ? workingDirectoryOverride
          : (!string.IsNullOrEmpty(applicationData.AIWorkingDirectory)
              ? applicationData.AIWorkingDirectory
              : Directory.GetCurrentDirectory());

      log.Info($"AI execution requested. Provider={applicationData.AIProvider}, timeout={timeoutMinutes}m");
      log.Debug($"AI working directory resolved to: {workingDirectory}");
      string executionMessage = AddPlanningStep(message);

      log.Debug($"AI message length: {executionMessage.Length}");
      log.Debug($"AI message preview: {Preview(executionMessage)}");

      string executablePath = ResolveBinaryPath(applicationData.AIProvider);
      IReadOnlyList<string> arguments = BuildProviderArguments(applicationData, workingDirectory);

      log.Debug($"AI executable resolved to: {executablePath}");
      log.Debug($"AI base arguments: {FormatArguments(arguments)}");

      if (applicationData.AIProvider == AIProvider.Codex)
      {
        List<string> codexArguments = new List<string>(arguments) { executionMessage };

        log.Info("Starting Codex non-interactive execution");
        string result = ExecuteOneShot(
            log,
            executablePath,
            codexArguments,
            workingDirectory,
            timeoutMinutes,
            outputChunkHandler);
        log.Info($"Codex execution completed in {stopwatch.ElapsedMilliseconds}ms with {result.Length} output characters");
        return result;
      }

      string sessionKey = $"ai:{applicationData.AIProvider}:{workingDirectory}";
      log.Info($"Starting AI session execution. SessionKey={sessionKey}");
      string sessionResult = GenericCommandLineService.Execute(
          log,
          sessionKey,
          executablePath,
          arguments,
          workingDirectory,
          executionMessage,
          timeoutMinutes,
          outputChunkHandler,
          forceNewSession: true);
      log.Info($"{applicationData.AIProvider} session execution completed in {stopwatch.ElapsedMilliseconds}ms with {sessionResult.Length} output characters");
      return sessionResult;
    }

    private static string AddPlanningStep(string message)
    {
      return $"""
      Before implementing the requested command, create a concise plan.

      Required workflow:
      1. Inspect enough context to understand the task.
      2. Write a short implementation plan in the command output.
      3. Implement the command after the plan.
      4. Keep the final response concise and include what changed and any tests run.

      Command:
      {message}
      """;
    }

    public static void ResetSession(Log log)
    {
      log.Debug("Resetting AI session - forcing new CLI instance");
      GenericCommandLineService.ResetSession(log);
    }

    public static void CloseSession(Log log)
    {
      log.Debug("Closing AI session");
      GenericCommandLineService.ResetSession(log);
    }

    private static string ResolveBinaryPath(AIProvider provider)
    {
      string binaryName = provider switch
      {
        AIProvider.Codex => "codex",
        AIProvider.Claude => "claude",
        _ => throw new ArgumentException($"Unsupported AI provider: {provider}")
      };

      string whichCommand = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "where" : "which";

      try
      {
        ProcessStartInfo psi = new ProcessStartInfo(whichCommand, binaryName)
        {
          RedirectStandardOutput = true,
          UseShellExecute = false
        };

        using Process? p = Process.Start(psi);
        string? path = p?.StandardOutput.ReadLine()?.Trim();
        p?.WaitForExit();

        if (!string.IsNullOrEmpty(path) && File.Exists(path))
          return path;
      }
      catch { }

      throw new FileNotFoundException(
          $"{provider} CLI binary '{binaryName}' not found. " +
          $"Ensure it is installed and available on your PATH.");
    }

    private static IReadOnlyList<string> BuildProviderArguments(ApplicationData applicationData, string workingDirectory)
    {
      string fullWorkingDirectory = Path.GetFullPath(workingDirectory);
      List<string> grantedFolders = GetGrantedFolders(applicationData, fullWorkingDirectory);

      return applicationData.AIProvider switch
      {
        AIProvider.Codex => BuildCodexArguments(fullWorkingDirectory, grantedFolders),
        AIProvider.Claude => Array.Empty<string>(),
        _ => Array.Empty<string>()
      };
    }

    private static IReadOnlyList<string> BuildCodexArguments(string workingDirectory, IReadOnlyList<string> grantedFolders)
    {
      List<string> arguments = new List<string>
      {
        "exec",
        "--config",
        "sandbox_workspace_write.network_access=true",
        "--config",
        "sandbox_permissions=[]",
        "--sandbox",
        "workspace-write",
        "--skip-git-repo-check",
        "--cd",
        workingDirectory
      };

      foreach (string folder in grantedFolders)
      {
        if (string.Equals(folder, workingDirectory, PathComparison)) continue;

        arguments.Add("--add-dir");
        arguments.Add(folder);
      }

      return arguments;
    }

    private static string ExecuteOneShot(
        Log log,
        string executablePath,
        IReadOnlyList<string> arguments,
        string workingDirectory,
        int timeoutMinutes,
        Action<CommandLineOutputChunk>? outputChunkHandler)
    {
      Stopwatch stopwatch = Stopwatch.StartNew();
      ProcessStartInfo psi = new ProcessStartInfo(executablePath)
      {
        UseShellExecute = false,
        RedirectStandardInput = false,
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
      long sequence = 0;
      long stdoutLines = 0;
      long stderrLines = 0;

      using Process process = new Process { StartInfo = psi, EnableRaisingEvents = true };

      process.OutputDataReceived += (_, e) =>
      {
        if (e.Data == null) return;
        long lineNumber = Interlocked.Increment(ref stdoutLines);

        lock (output)
        {
          output.AppendLine(e.Data);
        }

        log.Debug($"AI stdout[{lineNumber}]: {Preview(e.Data)}");

        outputChunkHandler?.Invoke(new CommandLineOutputChunk(
            Interlocked.Increment(ref sequence),
            "stdout",
            e.Data,
            DateTime.UtcNow));
      };

      process.ErrorDataReceived += (_, e) =>
      {
        if (e.Data == null) return;
        long lineNumber = Interlocked.Increment(ref stderrLines);

        lock (error)
        {
          error.AppendLine(e.Data);
        }

        log.Debug($"AI stderr[{lineNumber}]: {Preview(e.Data)}");

        outputChunkHandler?.Invoke(new CommandLineOutputChunk(
            Interlocked.Increment(ref sequence),
            "stderr",
            e.Data,
            DateTime.UtcNow));
      };

      log.Info($"Starting AI process. Executable={executablePath}, workingDirectory={workingDirectory}, timeout={timeoutMinutes}m");
      log.Debug($"AI process arguments: {FormatArguments(arguments)}");

      process.Start();
      log.Info($"AI process started. Pid={process.Id}");
      process.BeginOutputReadLine();
      process.BeginErrorReadLine();

      int timeoutMs = timeoutMinutes * 60000;
      if (!process.WaitForExit(timeoutMs))
      {
        log.Error($"AI process timed out after {timeoutMinutes} minutes. Pid={process.Id}");
        try
        {
          process.Kill(entireProcessTree: true);
          log.Info($"AI process kill requested for process tree. Pid={process.Id}");
        }
        catch (Exception ex)
        {
          log.Error($"Failed to kill AI process tree. Pid={process.Id}", ex);
          process.Kill();
          log.Info($"AI process kill requested for single process. Pid={process.Id}");
        }

        throw new TimeoutException($"AI command timed out after {timeoutMinutes} minutes");
      }

      process.WaitForExit();
      log.Info($"AI process exited. Pid={process.Id}, exitCode={process.ExitCode}, elapsed={stopwatch.ElapsedMilliseconds}ms, stdoutLines={stdoutLines}, stderrLines={stderrLines}");

      string result = output.ToString();
      if (error.Length > 0)
      {
        result += error.ToString();
      }

      if (process.ExitCode != 0)
      {
        log.Error($"AI process failed. ExitCode={process.ExitCode}, outputLength={output.Length}, errorLength={error.Length}");
        throw new InvalidOperationException($"AI command exited with code {process.ExitCode}");
      }

      log.Debug($"AI process output length: stdout={output.Length}, stderr={error.Length}, combined={result.Length}");
      return result;
    }

    private static List<string> GetGrantedFolders(ApplicationData applicationData, string workingDirectory)
    {
      List<string> grantedFolders = new List<string> { workingDirectory };

      if (applicationData.ApplicationPaths == null) return grantedFolders;

      foreach (string configuredPath in applicationData.ApplicationPaths)
      {
        if (string.IsNullOrWhiteSpace(configuredPath)) continue;

        string fullPath = Path.GetFullPath(configuredPath, workingDirectory);
        if (!Directory.Exists(fullPath)) continue;

        if (!grantedFolders.Any(path => string.Equals(path, fullPath, PathComparison)))
        {
          grantedFolders.Add(fullPath);
        }
      }

      return grantedFolders;
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

    private static string Preview(string value)
    {
      string normalized = value.Replace("\r", "\\r").Replace("\n", "\\n");
      return normalized.Length <= 300 ? normalized : $"{normalized.Substring(0, 300)}...";
    }

    private static StringComparison PathComparison =>
        RuntimeInformation.IsOSPlatform(OSPlatform.Windows)
            ? StringComparison.OrdinalIgnoreCase
            : StringComparison.Ordinal;
  }
}
