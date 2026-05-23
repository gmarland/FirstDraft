using System.Diagnostics;
using System.Runtime.InteropServices;

namespace FirstDraft.Configuration
{
    public static class WorkerSkillRegistry
    {
        private static readonly Dictionary<string, string> BuiltInExecutables = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["git"] = "git",
            ["npm"] = "npm"
        };

        private static readonly Dictionary<string, string[]> RequiredSkillsByCommandMode = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase)
        {
            ["gitflow"] = new[] { "git" }
        };

        public static string[] KnownSkills => BuiltInExecutables.Keys.OrderBy(skill => skill).ToArray();

        public static string[] NormalizeConfiguredSkills(string[]? configuredSkills)
        {
            if (configuredSkills == null || configuredSkills.Length == 0) return Array.Empty<string>();

            List<string> skills = new List<string>();
            foreach (string configuredSkill in configuredSkills)
            {
                string skill = configuredSkill.Trim().ToLowerInvariant();
                if (string.IsNullOrEmpty(skill)) continue;

                if (!BuiltInExecutables.ContainsKey(skill))
                {
                    throw new InvalidOperationException($"Unsupported worker skill: {configuredSkill}");
                }

                if (!skills.Contains(skill, StringComparer.OrdinalIgnoreCase))
                {
                    skills.Add(skill);
                }
            }

            return skills.ToArray();
        }

        public static string[] ResolveAvailableSkills(string[]? configuredSkills)
        {
            string[] skills = NormalizeConfiguredSkills(configuredSkills);
            foreach (string skill in skills)
            {
                if (!IsAvailable(skill))
                {
                    throw new InvalidOperationException($"Configured worker skill '{skill}' is not available because '{BuiltInExecutables[skill]}' was not found on PATH.");
                }
            }

            return skills;
        }

        public static void ValidateCommandSkills(string commandMode, string[]? configuredSkills)
        {
            if (!RequiredSkillsByCommandMode.TryGetValue(commandMode, out string[]? requiredSkills)) return;

            string[] availableSkills = ResolveAvailableSkills(configuredSkills);
            string[] missingSkills = requiredSkills
                .Where(required => !availableSkills.Contains(required, StringComparer.OrdinalIgnoreCase))
                .ToArray();

            if (missingSkills.Length > 0)
            {
                throw new InvalidOperationException($"Command mode '{commandMode}' requires worker skill(s): {string.Join(", ", missingSkills)}");
            }
        }

        private static bool IsAvailable(string skill)
        {
            if (!BuiltInExecutables.TryGetValue(skill, out string? executable)) return false;

            string lookupCommand = RuntimeInformation.IsOSPlatform(OSPlatform.Windows) ? "where" : "which";
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo(lookupCommand, executable)
                {
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    UseShellExecute = false
                };

                using Process? process = Process.Start(psi);
                if (process == null) return false;
                if (!process.WaitForExit(5000))
                {
                    process.Kill();
                    return false;
                }

                return process?.ExitCode == 0;
            }
            catch
            {
                return false;
            }
        }
    }
}
