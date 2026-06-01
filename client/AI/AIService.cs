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

      string executablePath = ResolveBinaryPath(applicationData.AIProvider);
      string fullWorkingDirectory = Path.GetFullPath(workingDirectory);
      List<string> grantedFolders = GetGrantedFolders(applicationData, fullWorkingDirectory);
      string planningPrompt = BuildPlanningPrompt(message);
      Action<CommandLineOutputChunk>? sequencedOutputChunkHandler = CreateSequencedOutputChunkHandler(outputChunkHandler);

      log.Debug($"AI executable resolved to: {executablePath}");
      log.Debug($"AI granted folders: {FormatArguments(grantedFolders)}");
      log.Debug($"AI planning prompt length: {planningPrompt.Length}");
      log.Debug($"AI planning prompt preview: {Preview(planningPrompt)}");

      return CreateProviderRunner(applicationData.AIProvider).Execute(new AIExecutionRequest(
          log,
          applicationData.AIProvider,
          applicationData.PlanningEnabled,
          message,
          planningPrompt,
          executablePath,
          fullWorkingDirectory,
          grantedFolders,
          timeoutMinutes,
          stopwatch,
          sequencedOutputChunkHandler));
    }

    private static string BuildPlanningPrompt(string message)
    {
      return $"""
      You are in planning mode. Do not edit files, write files, apply patches, or make any repository changes.

      Inspect enough context to understand the requested command. Produce a concise, decision-complete implementation plan that can be handed to a coding agent. Include the important files or subsystems, expected behavior, and tests to run. If the request is unsafe or impossible, explain that instead of planning edits.

      Command:
      {message}
      """;
    }

    private static string BuildExecutionPrompt(string message, string plan)
    {
      return $"""
      Implement the requested command using the approved plan below.

      Follow the plan unless the repository state proves a specific step is wrong; if that happens, adapt minimally and explain the difference in the final response. Keep the final response concise and include what changed and any tests run.

      Original command:
      {message}

      Approved plan:
      {plan}
      """;
    }

    private static string BuildDirectExecutionPrompt(string message)
    {
      return $"""
      Implement the requested command.

      Keep the final response concise and include what changed and any tests run.

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

    private static IReadOnlyList<string> BuildCodexArguments(string workingDirectory, IReadOnlyList<string> grantedFolders, string sandboxMode)
    {
      List<string> arguments = new List<string>
      {
        "exec",
        "--config",
        "sandbox_workspace_write.network_access=true",
        "--config",
        "sandbox_permissions=[]",
        "--sandbox",
        sandboxMode,
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

    private static IReadOnlyList<string> BuildClaudePlanningArguments()
    {
      return new[]
      {
        "--permission-mode",
        "plan"
      };
    }

    private static Action<CommandLineOutputChunk>? CreateSequencedOutputChunkHandler(Action<CommandLineOutputChunk>? outputChunkHandler)
    {
      if (outputChunkHandler == null) return null;

      long sequence = 0;
      return chunk => outputChunkHandler(new CommandLineOutputChunk(
          Interlocked.Increment(ref sequence),
          chunk.Stream,
          chunk.Text,
          chunk.EmittedAt));
    }

    private static void EmitPhaseDelimiter(Action<CommandLineOutputChunk>? outputChunkHandler)
    {
      outputChunkHandler?.Invoke(new CommandLineOutputChunk(
          0,
          "stdout",
          string.Empty,
          DateTime.UtcNow));
      outputChunkHandler?.Invoke(new CommandLineOutputChunk(
          0,
          "stdout",
          "----- Execution -----",
          DateTime.UtcNow));
    }

    private static string CombinePhaseOutputs(string plan, string executionResult)
    {
      StringBuilder result = new StringBuilder();
      result.Append(plan.TrimEnd());
      result.AppendLine();
      result.AppendLine();
      result.AppendLine("----- Execution -----");
      result.Append(executionResult);
      return result.ToString();
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

    private static IAIProviderRunner CreateProviderRunner(AIProvider provider)
    {
      return provider switch
      {
        AIProvider.Codex => new CodexAIProviderRunner(),
        AIProvider.Claude => new SessionAIProviderRunner(),
        _ => throw new ArgumentException($"Unsupported AI provider: {provider}")
      };
    }

    private interface IAIProviderRunner
    {
      string Execute(AIExecutionRequest request);
    }

    private sealed record AIExecutionRequest(
        Log Log,
        AIProvider Provider,
        bool PlanningEnabled,
        string Message,
        string PlanningPrompt,
        string ExecutablePath,
        string WorkingDirectory,
        IReadOnlyList<string> GrantedFolders,
        int TimeoutMinutes,
        Stopwatch Stopwatch,
        Action<CommandLineOutputChunk>? OutputChunkHandler);

    private sealed class CodexAIProviderRunner : IAIProviderRunner
    {
      public string Execute(AIExecutionRequest request)
      {
        if (!request.PlanningEnabled)
        {
          string directExecutionPrompt = BuildDirectExecutionPrompt(request.Message);
          IReadOnlyList<string> directExecutionArguments = BuildCodexArguments(request.WorkingDirectory, request.GrantedFolders, "workspace-write");

          request.Log.Info("Starting Codex non-interactive execution without planning pass");
          string directResult = ExecuteOneShot(
              request.Log,
              request.ExecutablePath,
              new List<string>(directExecutionArguments) { directExecutionPrompt },
              request.WorkingDirectory,
              request.TimeoutMinutes,
              request.OutputChunkHandler);
          request.Log.Info($"Codex execution completed in {request.Stopwatch.ElapsedMilliseconds}ms with {directResult.Length} output characters");
          return directResult;
        }

        IReadOnlyList<string> planningArguments = BuildCodexArguments(request.WorkingDirectory, request.GrantedFolders, "read-only");

        request.Log.Info("Starting Codex planning pass");
        string plan = ExecuteOneShot(
            request.Log,
            request.ExecutablePath,
            new List<string>(planningArguments) { request.PlanningPrompt },
            request.WorkingDirectory,
            request.TimeoutMinutes,
            request.OutputChunkHandler);

        EmitPhaseDelimiter(request.OutputChunkHandler);

        string executionPrompt = BuildExecutionPrompt(request.Message, plan);
        IReadOnlyList<string> executionArguments = BuildCodexArguments(request.WorkingDirectory, request.GrantedFolders, "workspace-write");

        request.Log.Info("Starting Codex non-interactive execution");
        string executionResult = ExecuteOneShot(
            request.Log,
            request.ExecutablePath,
            new List<string>(executionArguments) { executionPrompt },
            request.WorkingDirectory,
            request.TimeoutMinutes,
            request.OutputChunkHandler);

        string result = CombinePhaseOutputs(plan, executionResult);
        request.Log.Info($"Codex planning and execution completed in {request.Stopwatch.ElapsedMilliseconds}ms with {result.Length} output characters");
        return result;
      }
    }

    private sealed class SessionAIProviderRunner : IAIProviderRunner
    {
      public string Execute(AIExecutionRequest request)
      {
        if (!request.PlanningEnabled)
        {
          string directExecutionMessage = BuildDirectExecutionPrompt(request.Message);
          string directExecutionSessionKey = $"ai:{request.Provider}:execution:{request.WorkingDirectory}";
          request.Log.Info($"Starting AI session execution without planning pass. SessionKey={directExecutionSessionKey}");
          string result = GenericCommandLineService.Execute(
              request.Log,
              directExecutionSessionKey,
              request.ExecutablePath,
              Array.Empty<string>(),
              request.WorkingDirectory,
              directExecutionMessage,
              request.TimeoutMinutes,
              request.OutputChunkHandler,
              forceNewSession: true);
          request.Log.Info($"{request.Provider} execution completed in {request.Stopwatch.ElapsedMilliseconds}ms with {result.Length} output characters");
          return result;
        }

        IReadOnlyList<string> claudePlanningArguments = BuildClaudePlanningArguments();
        string planningSessionKey = $"ai:{request.Provider}:planning:{request.WorkingDirectory}";
        request.Log.Info($"Starting Claude planning pass. SessionKey={planningSessionKey}");
        string claudePlan = GenericCommandLineService.Execute(
            request.Log,
            planningSessionKey,
            request.ExecutablePath,
            claudePlanningArguments,
            request.WorkingDirectory,
            request.PlanningPrompt,
            request.TimeoutMinutes,
            request.OutputChunkHandler,
            forceNewSession: true);

        EmitPhaseDelimiter(request.OutputChunkHandler);

        string executionMessage = BuildExecutionPrompt(request.Message, claudePlan);
        string executionSessionKey = $"ai:{request.Provider}:execution:{request.WorkingDirectory}";
        request.Log.Info($"Starting AI session execution. SessionKey={executionSessionKey}");
        string sessionResult = GenericCommandLineService.Execute(
            request.Log,
            executionSessionKey,
            request.ExecutablePath,
            Array.Empty<string>(),
            request.WorkingDirectory,
            executionMessage,
            request.TimeoutMinutes,
            request.OutputChunkHandler,
            forceNewSession: true);
        string combinedResult = CombinePhaseOutputs(claudePlan, sessionResult);
        request.Log.Info($"{request.Provider} planning and execution completed in {request.Stopwatch.ElapsedMilliseconds}ms with {combinedResult.Length} output characters");
        return combinedResult;
      }
    }
  }
}
