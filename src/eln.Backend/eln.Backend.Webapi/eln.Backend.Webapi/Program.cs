using eln.Backend.Webapi;
using eln.Backend.Application.Infrastructure;
using eln.Backend.Application.Auth;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

// FORCE Development Mode by default (unless explicitly set to Production)
if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")))
{
    builder.Environment.EnvironmentName = "Development";
}

// Add services to the container
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Register application services
builder.Services.AddScoped<eln.Backend.Application.Services.TemplateService>();

// Database Context - PostgreSQL
builder.Services.AddDbContext<ElnContext>(opt =>
{
    opt.UseNpgsql(
        builder.Configuration.GetConnectionString("Default"),
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

// JwtSettings für IOptions<JwtSettings> im AuthController (falls du die Klasse nutzt)
builder.Services.Configure<JwtSettings>(builder.Configuration.GetSection("JwtSettings"));

// LdapSettings aus appsettings binden
builder.Services.Configure<LdapSettings>(builder.Configuration.GetSection("Ldap"));

// LDAP-Service registrieren
// Für Entwicklung mit Fake-Usern:
builder.Services.AddScoped<ILdapService, LdapService>();

// Read JWT Settings from appsettings
var jwtSecret = builder.Configuration["JwtSettings:Secret"] 
    ?? throw new InvalidOperationException("JWT Secret not configured");
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

// CORS Policy
builder.Services.AddCors(options =>
{
    options.AddPolicy("CorsPolicy", builder =>
    {
        builder.AllowAnyOrigin()
               .AllowAnyHeader()
               .AllowAnyMethod();
    });
});

var app = builder.Build();

// Apply CORS policy FIRST
app.UseCors("CorsPolicy");

// ALWAYS show Swagger (because we're always in Development by default)
app.UseSwagger();
app.UseSwaggerUI();

// PostgreSQL Container Setup (runs in Development mode)
if (app.Environment.IsDevelopment())
{
    try
    {
        await app.UsePostgresContainer(
            containerName: "eln_postgres",
            version: "latest",
            connectionString: app.Configuration.GetConnectionString("Default"),
            deleteAfterShutdown: true);
        
        // Initialize Database AFTER container is ready
        using (var scope = app.Services.CreateScope())
        {
            using (var db = scope.ServiceProvider.GetRequiredService<ElnContext>())
            {
                db.CreateDatabase(isDevelopment: true);
                
                // Seed dummy user for testing (since we don't have auth yet)
                var dummyUser = new eln.Backend.Application.Model.User("testuser", "admin");
                db.Users.Add(dummyUser);
                db.SaveChanges();
            }
        }
    }
    catch (Exception e)
    {
        app.Logger.LogError(e, "Failed to setup PostgreSQL container or initialize database");
        return;
    }
}

app.UseHttpsRedirection();
app.UseCookiePolicy();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
