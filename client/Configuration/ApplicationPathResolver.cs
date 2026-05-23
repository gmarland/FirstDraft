namespace FirstDraft.Configuration
{
    public static class ApplicationPathResolver
    {
        public static string EnsureDirectory(string configuredPath)
        {
            string resolvedPath;

            try
            {
                Path.GetFullPath(configuredPath);
                resolvedPath = configuredPath;
            }
            catch (Exception)
            {
                resolvedPath = Path.Join(Directory.GetCurrentDirectory(), configuredPath);
            }

            if (!Directory.Exists(resolvedPath)) Directory.CreateDirectory(resolvedPath);

            return resolvedPath;
        }
    }
}
