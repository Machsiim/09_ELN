using System.Diagnostics;

namespace eln.Backend.Webapi;

public static class PostgresContainerExtensions
{
    public static async Task<WebApplication> UsePostgresContainer(
        this WebApplication app,
        string containerName,
        string version,
        string? connectionString,
        bool deleteAfterShutdown = false)
    {
        if (string.IsNullOrEmpty(connectionString))
        {
            throw new ArgumentException("Connection string cannot be null or empty");
        }

        // Parse connection string to get database name and password
        var (database, password) = ParseConnectionString(connectionString);
        
        // Check if container already exists
        var existingContainer = await GetContainerIdAsync(containerName);
        if (!string.IsNullOrEmpty(existingContainer))
        {
            app.Logger.LogInformation($"PostgreSQL container '{containerName}' already exists. Removing...");
            await RemoveContainerAsync(containerName);
        }

        // Start new PostgreSQL container
        app.Logger.LogInformation($"Starting PostgreSQL container '{containerName}'...");

        var dockerArgs = $"run -d --name {containerName} " +
                        $"-e POSTGRES_PASSWORD={password} " +
                        $"-e POSTGRES_DB={database} " +
                        $"-p 5432:5432 " +
                        $"postgres:{version}";

        var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = "docker",
                Arguments = dockerArgs,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            }
        };

        process.Start();
        var output = await process.StandardOutput.ReadToEndAsync();
        var error = await process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();

        if (process.ExitCode != 0)
        {
            throw new Exception($"Failed to start PostgreSQL container: {error}");
        }

        app.Logger.LogInformation($"PostgreSQL container '{containerName}' started successfully");

        // Wait for PostgreSQL to be ready
        app.Logger.LogInformation("Waiting for PostgreSQL to be ready...");
        await Task.Delay(10000); // Wait 10 seconds for PostgreSQL to start

        // Register shutdown handler if needed
        if (deleteAfterShutdown)
        {
            var lifetime = app.Services.GetRequiredService<IHostApplicationLifetime>();
            lifetime.ApplicationStopping.Register(async () =>
            {
                app.Logger.LogInformation($"Stopping and removing PostgreSQL container '{containerName}'...");
                await RemoveContainerAsync(containerName);
            });
        }

        return app;
    }

    private static (string database, string password) ParseConnectionString(string connectionString)
    {
        var parts = connectionString.Split(';');
        
        var databasePart = parts.FirstOrDefault(p => 
            p.Trim().StartsWith("Database=", StringComparison.OrdinalIgnoreCase));
        var passwordPart = parts.FirstOrDefault(p => 
            p.Trim().StartsWith("Password=", StringComparison.OrdinalIgnoreCase) ||
            p.Trim().StartsWith("Pwd=", StringComparison.OrdinalIgnoreCase));

        if (databasePart == null || passwordPart == null)
        {
            throw new ArgumentException("Database or Password not found in connection string");
        }

        var database = databasePart.Split('=')[1].Trim();
        var password = passwordPart.Split('=')[1].Trim();

        return (database, password);
    }

    private static async Task<string?> GetContainerIdAsync(string containerName)
    {
        var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = "docker",
                Arguments = $"ps -aq -f name={containerName}",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                CreateNoWindow = true
            }
        };

        process.Start();
        var output = await process.StandardOutput.ReadToEndAsync();
        await process.WaitForExitAsync();

        return string.IsNullOrWhiteSpace(output) ? null : output.Trim();
    }

    private static async Task RemoveContainerAsync(string containerName)
    {
        var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = "docker",
                Arguments = $"rm -f {containerName}",
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            }
        };

        process.Start();
        await process.WaitForExitAsync();
    }
}
