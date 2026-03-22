using System.Net;
using System.Text.Json;
using eln.Backend.Application;

namespace eln.Backend.Webapi.Middleware;

/// <summary>
/// Global exception handler middleware that catches unhandled exceptions
/// and returns a consistent error response.
/// </summary>
public class ExceptionHandlerMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<ExceptionHandlerMiddleware> _logger;
    private readonly IHostEnvironment _environment;

    public ExceptionHandlerMiddleware(
        RequestDelegate next,
        ILogger<ExceptionHandlerMiddleware> logger,
        IHostEnvironment environment)
    {
        _next = next;
        _logger = logger;
        _environment = environment;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (Exception ex)
        {
            await HandleExceptionAsync(context, ex);
        }
    }

    private async Task HandleExceptionAsync(HttpContext context, Exception exception)
    {
        _logger.LogError(exception, "An unhandled exception occurred: {Message}", exception.Message);

        context.Response.ContentType = "application/json";

        // Map known exception types to appropriate HTTP status codes
        context.Response.StatusCode = exception switch
        {
            NotFoundException  => (int)HttpStatusCode.NotFound,
            ForbiddenException => (int)HttpStatusCode.Forbidden,
            ValidationException => (int)HttpStatusCode.BadRequest,
            _                  => (int)HttpStatusCode.InternalServerError
        };

        var response = new ErrorResponse
        {
            Error = exception switch
            {
                NotFoundException   => "Not found",
                ForbiddenException  => "Forbidden",
                ValidationException => "Validation error",
                _                   => "An unexpected error occurred"
            },
            StatusCode = context.Response.StatusCode
        };

        // Only include details in Development
        if (_environment.IsDevelopment())
        {
            response.Details = exception.Message;
            response.StackTrace = exception.StackTrace;
        }
        else
        {
            // In production, safe to expose message for known/expected exceptions
            if (exception is NotFoundException or ForbiddenException or ValidationException)
                response.Details = exception.Message;
        }

        var jsonOptions = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase
        };

        await context.Response.WriteAsJsonAsync(response, jsonOptions);
    }

    private class ErrorResponse
    {
        public string Error { get; set; } = string.Empty;
        public int StatusCode { get; set; }
        public string? Details { get; set; }
        public string? StackTrace { get; set; }
    }
}

/// <summary>
/// Extension method to easily add the middleware to the pipeline.
/// </summary>
public static class ExceptionHandlerMiddlewareExtensions
{
    public static IApplicationBuilder UseGlobalExceptionHandler(this IApplicationBuilder app)
    {
        return app.UseMiddleware<ExceptionHandlerMiddleware>();
    }
}
