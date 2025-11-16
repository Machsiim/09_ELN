namespace eln.Backend.Application.DTOs;

/// <summary>
/// Validation error for a specific field
/// </summary>
public class ValidationErrorDto
{
    public string Section { get; set; } = string.Empty;
    public string Field { get; set; } = string.Empty;
    public string Error { get; set; } = string.Empty;
}

/// <summary>
/// Result of measurement data validation
/// </summary>
public class ValidationResultDto
{
    public bool IsValid { get; set; }
    public List<ValidationErrorDto> Errors { get; set; } = new();
}
