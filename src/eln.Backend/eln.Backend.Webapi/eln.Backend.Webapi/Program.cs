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

var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
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

// Database Context - PostgreSQL (Connection String from Environment Variable or Config)
var connectionString = Environment.GetEnvironmentVariable("ELN_DB_CONNECTION")
    ?? builder.Configuration.GetConnectionString("DefaultConnection")
    ?? builder.Configuration.GetConnectionString("Default");

if (string.IsNullOrEmpty(connectionString))
{
    throw new InvalidOperationException(
        "Database connection string not configured. Set ELN_DB_CONNECTION environment variable or ConnectionStrings:Default in appsettings.json");
}

builder.Services.AddDbContext<ElnContext>(opt =>
{
    opt.UseNpgsql(
        connectionString,
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

// JwtSettings f�r IOptions<JwtSettings> im AuthController (falls du die Klasse nutzt)
builder.Services.Configure<JwtSettings>(builder.Configuration.GetSection("JwtSettings"));

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
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret))
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

                // Seed dummy user for testing only if no users exist
                if (!db.Users.Any())
                {
                    var dummyUser = new eln.Backend.Application.Model.User("testuser", "admin");
                    db.Users.Add(dummyUser);
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
                var dummyUser = new eln.Backend.Application.Model.User("testuser", "admin");
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
