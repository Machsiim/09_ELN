namespace eln.Backend.Application;

/// <summary>
/// Thrown when a requested resource does not exist. Maps to HTTP 404.
/// </summary>
public class NotFoundException : Exception
{
    public NotFoundException(string message) : base(message) { }
}

/// <summary>
/// Thrown when the caller is not allowed to perform an action. Maps to HTTP 403.
/// </summary>
public class ForbiddenException : Exception
{
    public ForbiddenException(string message) : base(message) { }
}

/// <summary>
/// Thrown for invalid input / business rule violations. Maps to HTTP 400.
/// </summary>
public class ValidationException : Exception
{
    public ValidationException(string message) : base(message) { }
}
