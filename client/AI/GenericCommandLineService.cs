using System.Diagnostics;
using System.Text;
using FirstDraft.Commands;
using FirstDraft.Infrastructure.Logging;

namespace FirstDraft.AI
{
  public static class GenericCommandLineService
  {
    private static readonly object _sessionLock = new object();

    private static Process? _process = null;
    private static string? _sessionKey = null;
    private static readonly StringBuilder _outputBuffer = new StringBuilder();
    private static readonly StringBuilder _errorBuffer = new StringBuilder();
    private static DateTime _lastOutputAt = DateTime.MinValue;
    private static Action<CommandLineOutputChunk>? _outputChunkHandler = null;
    private static long _outputSequence = 0;

    private const int IdleTimeoutMs = 500;

    public static string Execute(
        Log log,
        string sessionKey,
        string executablePath,
        IReadOnlyList<string>? arguments,
        string workingDirectory,
        string input,
        int timeoutMinutes,
        Action<CommandLineOutputChunk>? outputChunkHandler = null,
        bool forceNewSession = false)
    {
      if (forceNewSession)
      {
        return ExecuteIsolated(
            log,
            sessionKey,
            executablePath,
            arguments,
            workingDirectory,
            input,
            timeoutMinutes,
            outputChunkHandler);
      }

      lock (_sessionLock)
      {
        GetOrCreateSession(log, sessionKey, executablePath, arguments, workingDirectory, forceNewSession);

        _outputBuffer.Clear();
        _errorBuffer.Clear();
        _lastOutputAt = DateTime.MinValue;
        _outputSequence = 0;
        _outputChunkHandler = outputChunkHandler;

        try
        {
          _process!.StandardInput.WriteLine(input);
          _process.StandardInput.Flush();

          int timeoutMs = timeoutMinutes * 60000;
          DateTime started = DateTime.UtcNow;

          while ((DateTime.UtcNow - started).TotalMilliseconds < timeoutMs)
          {
            Thread.Sleep(50);

            bool hasOutput = _outputBuffer.Length > 0 || _errorBuffer.Length > 0;
            bool recentlyUpdated = _lastOutputAt != DateTime.MinValue &&
                                   (DateTime.UtcNow - _lastOutputAt).TotalMilliseconds < IdleTimeoutMs;

            if (hasOutput && !recentlyUpdated)
            {
              break;
            }
          }

          if ((DateTime.UtcNow - started).TotalMilliseconds >= timeoutMs)
          {
            KillSession(log);
            throw new TimeoutException($"AI command timed out after {timeoutMinutes} minutes");
          }

          string output = _outputBuffer.ToString();
          if (_errorBuffer.Length > 0)
          {
            output += _errorBuffer.ToString();
          }

          return output;
        }
        finally
        {
          _outputChunkHandler = null;
        }
      }
    }

    public static void ResetSession(Log log)
    {
      lock (_sessionLock)
      {
        KillSession(log);
      }
    }

    private static void GetOrCreateSession(
        Log log,
        string sessionKey,
        string executablePath,
        IReadOnlyList<string>? arguments,
        string workingDirectory,
        bool forceNewSession)
    {
      bool canReuse = !forceNewSession &&
                      _process != null &&
                      !_process.HasExited &&
                      string.Equals(_sessionKey, sessionKey, StringComparison.Ordinal);

      if (canReuse)
      {
        log.Debug($"Reusing command-line session: {sessionKey} ({_process!.Id})");
        return;
      }

      KillSession(log);

      ProcessStartInfo psi = new ProcessStartInfo(executablePath)
      {
        UseShellExecute = false,
        RedirectStandardInput = true,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        WorkingDirectory = workingDirectory
      };

      if (arguments != null)
      {
        foreach (string argument in arguments)
        {
          psi.ArgumentList.Add(argument);
        }
      }

      _process = Process.Start(psi);
      _sessionKey = sessionKey;

      _process!.OutputDataReceived += (_, e) =>
      {
        if (e.Data != null)
        {
          lock (_outputBuffer)
          {
            _outputBuffer.AppendLine(e.Data);
            _lastOutputAt = DateTime.UtcNow;
          }

          EmitOutputChunk("stdout", e.Data);
        }
      };

      _process.ErrorDataReceived += (_, e) =>
      {
        if (e.Data != null)
        {
          lock (_errorBuffer)
          {
            _errorBuffer.AppendLine(e.Data);
            _lastOutputAt = DateTime.UtcNow;
          }

          EmitOutputChunk("stderr", e.Data);
        }
      };

      _process.BeginOutputReadLine();
      _process.BeginErrorReadLine();

      Thread.Sleep(350);

      log.Debug($"Started command-line session: {sessionKey} ({_process.Id})");
    }

    private static void KillSession(Log log)
    {
      if (_process == null)
      {
        _sessionKey = null;
        return;
      }

      try
      {
        if (!_process.HasExited)
        {
          _process.StandardInput.WriteLine("exit");
          _process.StandardInput.Close();
          _process.WaitForExit(2500);

          if (!_process.HasExited)
          {
            _process.Kill();
          }
        }

        _process.Close();
      }
      catch (Exception ex)
      {
        log.Debug($"Error closing command-line session: {ex.Message}");
      }
      finally
      {
        _process = null;
        _sessionKey = null;
        _outputBuffer.Clear();
        _errorBuffer.Clear();
        _lastOutputAt = DateTime.MinValue;
        _outputChunkHandler = null;
        _outputSequence = 0;
      }
    }

    private static string ExecuteIsolated(
        Log log,
        string sessionKey,
        string executablePath,
        IReadOnlyList<string>? arguments,
        string workingDirectory,
        string input,
        int timeoutMinutes,
        Action<CommandLineOutputChunk>? outputChunkHandler)
    {
      ProcessStartInfo psi = new ProcessStartInfo(executablePath)
      {
        UseShellExecute = false,
        RedirectStandardInput = true,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        WorkingDirectory = workingDirectory
      };

      if (arguments != null)
      {
        foreach (string argument in arguments)
        {
          psi.ArgumentList.Add(argument);
        }
      }

      StringBuilder outputBuffer = new StringBuilder();
      StringBuilder errorBuffer = new StringBuilder();
      DateTime lastOutputAt = DateTime.MinValue;
      long outputSequence = 0;

      using Process process = new Process { StartInfo = psi, EnableRaisingEvents = true };

      process.OutputDataReceived += (_, e) =>
      {
        if (e.Data == null) return;

        lock (outputBuffer)
        {
          outputBuffer.AppendLine(e.Data);
          lastOutputAt = DateTime.UtcNow;
        }

        EmitOutputChunk(outputChunkHandler, ref outputSequence, "stdout", e.Data);
      };

      process.ErrorDataReceived += (_, e) =>
      {
        if (e.Data == null) return;

        lock (errorBuffer)
        {
          errorBuffer.AppendLine(e.Data);
          lastOutputAt = DateTime.UtcNow;
        }

        EmitOutputChunk(outputChunkHandler, ref outputSequence, "stderr", e.Data);
      };

      process.Start();
      process.BeginOutputReadLine();
      process.BeginErrorReadLine();
      Thread.Sleep(350);
      log.Debug($"Started isolated command-line session: {sessionKey} ({process.Id})");

      try
      {
        process.StandardInput.WriteLine(input);
        process.StandardInput.Flush();

        int timeoutMs = timeoutMinutes * 60000;
        DateTime started = DateTime.UtcNow;

        while ((DateTime.UtcNow - started).TotalMilliseconds < timeoutMs)
        {
          Thread.Sleep(50);

          bool hasOutput = outputBuffer.Length > 0 || errorBuffer.Length > 0;
          bool recentlyUpdated = lastOutputAt != DateTime.MinValue &&
                                 (DateTime.UtcNow - lastOutputAt).TotalMilliseconds < IdleTimeoutMs;

          if (hasOutput && !recentlyUpdated)
          {
            break;
          }
        }

        if ((DateTime.UtcNow - started).TotalMilliseconds >= timeoutMs)
        {
          KillProcess(log, process);
          throw new TimeoutException($"AI command timed out after {timeoutMinutes} minutes");
        }

        string output = outputBuffer.ToString();
        if (errorBuffer.Length > 0)
        {
          output += errorBuffer.ToString();
        }

        return output;
      }
      finally
      {
        CloseProcess(log, process);
      }
    }

    private static void CloseProcess(Log log, Process process)
    {
      try
      {
        if (!process.HasExited)
        {
          process.StandardInput.WriteLine("exit");
          process.StandardInput.Close();
          process.WaitForExit(2500);

          if (!process.HasExited)
          {
            process.Kill();
          }
        }
      }
      catch (Exception ex)
      {
        log.Debug($"Error closing isolated command-line session: {ex.Message}");
      }
    }

    private static void KillProcess(Log log, Process process)
    {
      try
      {
        if (!process.HasExited)
        {
          process.Kill(entireProcessTree: true);
        }
      }
      catch (Exception ex)
      {
        log.Debug($"Error killing isolated command-line session process tree: {ex.Message}");
        if (!process.HasExited)
        {
          process.Kill();
        }
      }
    }

    private static void EmitOutputChunk(string stream, string text)
    {
      Action<CommandLineOutputChunk>? handler = _outputChunkHandler;
      if (handler == null) return;

      long sequence = Interlocked.Increment(ref _outputSequence);
      handler(new CommandLineOutputChunk(sequence, stream, text, DateTime.UtcNow));
    }

    private static void EmitOutputChunk(
        Action<CommandLineOutputChunk>? outputChunkHandler,
        ref long outputSequence,
        string stream,
        string text)
    {
      if (outputChunkHandler == null) return;

      long sequence = Interlocked.Increment(ref outputSequence);
      outputChunkHandler(new CommandLineOutputChunk(sequence, stream, text, DateTime.UtcNow));
    }
  }
}
