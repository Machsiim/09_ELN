using System.ComponentModel.DataAnnotations;

namespace eln.Backend.Application.DTOs;

/// <summary>
/// Request to create a share link for a measurement series
/// </summary>
public class CreateShareLinkDto
{
    [Required]
    [Range(1, 365, ErrorMessage = "Expiration must be between 1 and 365 days")]
    public int ExpiresInDays { get; set; }

    [Required]
    public bool IsPublic { get; set; }

    /// <summary>
    /// List of user emails that have access (only used when IsPublic = false)
    /// </summary>
    public List<string>? AllowedUserEmails { get; set; }
}

/// <summary>
/// Response after creating a share link
/// </summary>
public class ShareLinkResponseDto
{
    public int Id { get; set; }
    public string Token { get; set; } = string.Empty;
    public string ShareUrl { get; set; } = string.Empty;
    public bool IsPublic { get; set; }
    public List<string> AllowedUserEmails { get; set; } = new();
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public bool IsActive { get; set; }
    public int CreatedBy { get; set; }
    public string CreatedByUsername { get; set; } = string.Empty;
}

/// <summary>
/// Response for shared series (public endpoint, read-only)
/// </summary>
public class SharedSeriesDto
{
    public int SeriesId { get; set; }
    public string SeriesName { get; set; } = string.Empty;
    public string? SeriesDescription { get; set; }
    public DateTime SeriesCreatedAt { get; set; }
    public string CreatedByUsername { get; set; } = string.Empty;
    public DateTime ExpiresAt { get; set; }
    
    // Read-only measurements
    public List<SharedMeasurementDto> Measurements { get; set; } = new();
}

/// <summary>
/// Measurement data for shared series (read-only)
/// </summary>
public class SharedMeasurementDto
{
    public int Id { get; set; }
    public string TemplateName { get; set; } = string.Empty;
    public Dictionary<string, Dictionary<string, object?>> Data { get; set; } = new();
    public DateTime CreatedAt { get; set; }
    public string CreatedByUsername { get; set; } = string.Empty;
}
