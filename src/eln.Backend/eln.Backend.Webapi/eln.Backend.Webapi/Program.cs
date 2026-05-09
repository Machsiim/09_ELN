using eln.Backend.Webapi;
using eln.Backend.Webapi.Middleware;
using eln.Backend.Application.Infrastructure;
using eln.Backend.Application.Auth;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using System.Text.Json;
using Npgsql;

// Load .env file (walk up directory tree to find it)
var envDir = new DirectoryInfo(Directory.GetCurrentDirectory());
while (envDir != null)
{
    var envFile = Path.Combine(envDir.FullName, ".env");
    if (File.Exists(envFile))
    {
        foreach (var line in File.ReadAllLines(envFile))
        {
            if (string.IsNullOrWhiteSpace(line) || line.TrimStart().StartsWith('#')) continue;
            var idx = line.IndexOf('=');
            if (idx < 0) continue;
            var key = line[..idx].Trim();
            var value = line[(idx + 1)..].Trim();
            Environment.SetEnvironmentVariable(key, value);
        }
        break;
    }
    envDir = envDir.Parent;
}

var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.OperationFilter<eln.Backend.Webapi.SwaggerDefaultValuesFilter>();

    c.AddSecurityDefinition("Bearer", new Microsoft.OpenApi.Models.OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = Microsoft.OpenApi.Models.SecuritySchemeType.Http,
        Scheme = "Bearer",
        BearerFormat = "JWT",
        In = Microsoft.OpenApi.Models.ParameterLocation.Header,
        Description = "JWT Authorization header using the Bearer scheme. Example: \"Bearer {token}\""
    });
    
    c.AddSecurityRequirement(new Microsoft.OpenApi.Models.OpenApiSecurityRequirement
    {
        {
            new Microsoft.OpenApi.Models.OpenApiSecurityScheme
            {
                Reference = new Microsoft.OpenApi.Models.OpenApiReference
                {
                    Type = Microsoft.OpenApi.Models.ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

// Register application services
builder.Services.AddScoped<eln.Backend.Application.Services.TemplateService>();
builder.Services.AddScoped<eln.Backend.Application.Services.MeasurementService>();
builder.Services.AddScoped<eln.Backend.Application.Services.MeasurementValidationService>();
builder.Services.AddScoped<eln.Backend.Application.Services.MeasurementSeriesService>();
builder.Services.AddScoped<eln.Backend.Application.Services.ShareLinkService>();
builder.Services.AddScoped<eln.Backend.Application.Services.ImportService>();
builder.Services.AddScoped<eln.Backend.Application.Services.ExportService>();
builder.Services.AddScoped<eln.Backend.Application.Services.MappingProfileService>();
builder.Services.AddScoped<eln.Backend.Application.Services.AggregationService>();
builder.Services.AddScoped<eln.Backend.Application.Services.VisualizationService>();

// HttpClient for Python Excel Microservice
builder.Services.AddHttpClient("PythonService", client =>
{
    client.BaseAddress = new Uri(
        Environment.GetEnvironmentVariable("PYTHON_SERVICE_URL")
        ?? builder.Configuration["PythonService:BaseUrl"]
        ?? "http://localhost:8001");
    client.Timeout = TimeSpan.FromMinutes(5);
});

// Database Context - PostgreSQL (Connection String from Environment Variable or Config)
var connectionString = Environment.GetEnvironmentVariable("ELN_DB_CONNECTION")
    ?? builder.Configuration.GetConnectionString("DefaultConnection")
    ?? builder.Configuration.GetConnectionString("Default");

if (string.IsNullOrEmpty(connectionString))
{
    throw new InvalidOperationException(
        "Database connection string not configured. Set ELN_DB_CONNECTION environment variable or ConnectionStrings:Default in appsettings.json");
}

// Enable dynamic JSON serialization for jsonb (used by AllowedUserEmails)
builder.Services.AddSingleton<NpgsqlDataSource>(_ =>
{
    var dataSourceBuilder = new NpgsqlDataSourceBuilder(connectionString);
    dataSourceBuilder.EnableDynamicJson();
    return dataSourceBuilder.Build();
});

builder.Services.AddDbContext<ElnContext>((serviceProvider, opt) =>
{
    var dataSource = serviceProvider.GetRequiredService<NpgsqlDataSource>();

    opt.UseNpgsql(
        dataSource,
        o => o.UseQuerySplittingBehavior(QuerySplittingBehavior.SingleQuery));
});

// Cookie Policy
builder.Services.Configure<CookiePolicyOptions>(options =>
{
    options.OnAppendCookie = cookieContext =>
    {
        cookieContext.CookieOptions.Secure = true;
        cookieContext.CookieOptions.SameSite = builder.Environment.IsDevelopment() ? SameSiteMode.None : SameSiteMode.Strict;
    };
});

// JwtSettings fuer IOptions<JwtSettings> im AuthController
builder.Services.Configure<JwtSettings>(options =>
{
    builder.Configuration.GetSection("JwtSettings").Bind(options);
    // Override Secret from environment variable if set
    var envSecret = Environment.GetEnvironmentVariable("ELN_JWT_SECRET");
    if (!string.IsNullOrEmpty(envSecret))
        options.Secret = envSecret;
});

// LdapSettings aus appsettings binden
builder.Services.Configure<LdapSettings>(builder.Configuration.GetSection("Ldap"));

// LDAP-Service registrieren
// F�r Entwicklung mit Fake-Usern:
builder.Services.AddScoped<ILdapService, LdapService>();

// Read JWT Settings from Environment Variable or appsettings
var jwtSecret = Environment.GetEnvironmentVariable("ELN_JWT_SECRET")
    ?? builder.Configuration["JwtSettings:Secret"];

if (string.IsNullOrEmpty(jwtSecret))
{
    throw new InvalidOperationException(
        "JWT Secret not configured. Set ELN_JWT_SECRET environment variable or JwtSettings:Secret in appsettings.json");
}

var jwtIssuer = builder.Configuration["JwtSettings:Issuer"] ?? "eln.backend";
var jwtAudience = builder.Configuration["JwtSettings:Audience"] ?? "eln.backend";

// Authentication with JWT
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(JwtBearerDefaults.AuthenticationScheme, options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidateLifetime = true,
        ValidateIssuerSigningKey = true,
        ValidIssuer = jwtIssuer,
        ValidAudience = jwtAudience,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)),
        ClockSkew = TimeSpan.FromMinutes(2)
    };

    options.Events = new Microsoft.AspNetCore.Authentication.JwtBearer.JwtBearerEvents
    {
        OnAuthenticationFailed = context =>
        {
            if (context.Exception is Microsoft.IdentityModel.Tokens.SecurityTokenExpiredException)
            {
                context.Response.Headers.Append("Token-Expired", "true");
            }
            return Task.CompletedTask;
        },
        OnChallenge = context =>
        {
            context.HandleResponse();
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            context.Response.ContentType = "application/json";
            var isExpired = context.Response.Headers.ContainsKey("Token-Expired");
            var payload = JsonSerializer.Serialize(new
            {
                error = isExpired ? "Token expired" : "Unauthorized",
                tokenExpired = isExpired
            });
            return context.Response.WriteAsync(payload);
        }
    };
});

// CORS Policy - Restrictive in Production, Permissive in Development
builder.Services.AddCors(options =>
{
    options.AddPolicy("CorsPolicy", policy =>
    {
        if (builder.Environment.IsDevelopment())
        {
            policy.AllowAnyOrigin()
                  .AllowAnyHeader()
                  .AllowAnyMethod();
        }
        else
        {
            var allowedOrigins = builder.Configuration
                .GetSection("Cors:AllowedOrigins")
                .Get<string[]>() ?? Array.Empty<string>();

            if (allowedOrigins.Length > 0)
            {
                policy.WithOrigins(allowedOrigins)
                      .AllowAnyHeader()
                      .AllowAnyMethod()
                      .AllowCredentials();
            }
            else
            {
                // Fallback: No CORS allowed in production without explicit configuration
                policy.WithOrigins("https://example.com")
                      .AllowAnyHeader()
                      .AllowAnyMethod();
            }
        }
    });
});

// Health Checks
builder.Services.AddHealthChecks()
    .AddNpgSql(connectionString, name: "database", tags: new[] { "db", "sql", "postgres" });

var app = builder.Build();

// Apply CORS policy FIRST
app.UseCors("CorsPolicy");

// Global exception handler - catches unhandled exceptions
app.UseGlobalExceptionHandler();

// Swagger only in Development
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// PostgreSQL Container Setup (only when running locally in Development, not in Docker)
var runningInDocker = Environment.GetEnvironmentVariable("DOTNET_RUNNING_IN_CONTAINER") == "true";

if (app.Environment.IsDevelopment() && !runningInDocker)
{
    try
    {
        await app.UsePostgresContainer(
            containerName: "eln_postgres",
            version: "latest",
            connectionString: connectionString,
            deleteAfterShutdown: false); // Keep data after shutdown

        // Initialize Database AFTER container is ready
        using (var scope = app.Services.CreateScope())
        {
            using (var db = scope.ServiceProvider.GetRequiredService<ElnContext>())
            {
                db.CreateDatabase(isDevelopment: true);

                // Seed test data only if no users exist
                if (!db.Users.Any())
                {
                    var dummyUser = new eln.Backend.Application.Model.User("testuser", "Staff");
                    db.Users.Add(dummyUser);
                    db.SaveChanges();

                    // Template: Chemie-Labor Messvorlage
                    var templateSchema = System.Text.Json.JsonDocument.Parse(@"{
                        ""sections"": [
                            {
                                ""name"": ""Messwerte"",
                                ""fields"": [
                                    { ""key"": ""temperatur"", ""label"": ""Temperatur (°C)"", ""type"": ""number"" },
                                    { ""key"": ""ph_wert"", ""label"": ""pH-Wert"", ""type"": ""number"" },
                                    { ""key"": ""druck"", ""label"": ""Druck (hPa)"", ""type"": ""number"" }
                                ]
                            },
                            {
                                ""name"": ""Metadaten"",
                                ""fields"": [
                                    { ""key"": ""standort"", ""label"": ""Standort"", ""type"": ""text"" },
                                    { ""key"": ""pruefer"", ""label"": ""Prüfer"", ""type"": ""text"" }
                                ]
                            }
                        ]
                    }");
                    var template = new eln.Backend.Application.Model.Template("Chemie-Labor Messvorlage", templateSchema, dummyUser.Id);
                    db.Templates.Add(template);
                    db.SaveChanges();

                    // Messserie
                    var series = new eln.Backend.Application.Model.MeasurementSeries("Wasserqualität Frühling 2026", dummyUser.Id, "Messreihe zur Wasserqualität an verschiedenen Standorten");
                    db.MeasurementSeries.Add(series);
                    db.SaveChanges();

                    // 15 Messungen mit realistischen Werten
                    var random = new Random(42);
                    var standorte = new[] { "Labor A", "Labor B", "Außenstelle" };
                    var pruefer = new[] { "Müller", "Schmidt", "Weber" };
                    var baseDate = new DateTime(2026, 3, 1, 8, 0, 0, DateTimeKind.Utc);

                    for (int i = 0; i < 15; i++)
                    {
                        var standort = standorte[i % 3];
                        var temp = Math.Round(18.0 + random.NextDouble() * 8.0, 1);   // 18-26°C
                        var ph = Math.Round(6.5 + random.NextDouble() * 1.5, 2);       // 6.5-8.0
                        var pressure = Math.Round(1010 + random.NextDouble() * 20, 1); // 1010-1030 hPa

                        var data = System.Text.Json.JsonDocument.Parse($@"{{
                            ""Messwerte"": {{
                                ""temperatur"": {temp.ToString(System.Globalization.CultureInfo.InvariantCulture)},
                                ""ph_wert"": {ph.ToString(System.Globalization.CultureInfo.InvariantCulture)},
                                ""druck"": {pressure.ToString(System.Globalization.CultureInfo.InvariantCulture)}
                            }},
                            ""Metadaten"": {{
                                ""standort"": ""{standort}"",
                                ""pruefer"": ""{pruefer[i % 3]}""
                            }}
                        }}");

                        var measurement = new eln.Backend.Application.Model.Measurement(series.Id, template.Id, data, dummyUser.Id);
                        measurement.CreatedAt = baseDate.AddDays(i * 2);
                        db.Measurements.Add(measurement);
                    }
                    db.SaveChanges();
                }
            }
        }
    }
    catch (Exception e)
    {
        app.Logger.LogError(e, "Failed to setup PostgreSQL container or initialize database");
        return;
    }
}
else
{
    // Running in Docker or Production - initialize database
    using (var scope = app.Services.CreateScope())
    {
        using (var db = scope.ServiceProvider.GetRequiredService<ElnContext>())
        {
            var isDevelopment = app.Environment.IsDevelopment();
            db.CreateDatabase(isDevelopment: isDevelopment);

            // Seed dummy user only in Development
            if (isDevelopment && !db.Users.Any())
            {
                var dummyUser = new eln.Backend.Application.Model.User("testuser", "Staff");
                db.Users.Add(dummyUser);
                db.SaveChanges();
            }
        }
    }
}

app.UseHttpsRedirection();
app.UseCookiePolicy();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// Health Check Endpoint
app.MapHealthChecks("/health", new HealthCheckOptions
{
    ResponseWriter = async (context, report) =>
    {
        context.Response.ContentType = "application/json";
        var result = JsonSerializer.Serialize(new
        {
            status = report.Status.ToString(),
            checks = report.Entries.Select(e => new
            {
                name = e.Key,
                status = e.Value.Status.ToString(),
                description = e.Value.Description,
                duration = e.Value.Duration.TotalMilliseconds
            }),
            totalDuration = report.TotalDuration.TotalMilliseconds
        });
        await context.Response.WriteAsync(result);
    }
});

app.Run();
