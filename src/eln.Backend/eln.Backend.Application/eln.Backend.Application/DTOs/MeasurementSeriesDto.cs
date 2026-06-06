using System.ComponentModel.DataAnnotations;

namespace eln.Backend.Application.DTOs;

/// <summary>
/// Request to create a new measurement series
/// </summary>
public class CreateMeasurementSeriesDto
{
    [Required(ErrorMessage = "Name is required")]
    [StringLength(200, MinimumLength = 1, ErrorMessage = "Name must be between 1 and 200 characters")]
    public string Name { get; set; } = string.Empty;

    [StringLength(1000, ErrorMessage = "Description cannot exceed 1000 characters")]
    public string? Description { get; set; }
}

/// <summary>
/// Request to update an existing measurement series
/// </summary>
public class UpdateMeasurementSeriesDto
{
    [Required(ErrorMessage = "Name is required")]
    [StringLength(200, MinimumLength = 1, ErrorMessage = "Name must be between 1 and 200 characters")]
    public string Name { get; set; } = string.Empty;

    [StringLength(1000, ErrorMessage = "Description cannot exceed 1000 characters")]
    public string? Description { get; set; }
}

/// <summary>
/// Aggregated overview row for a measurement series.
/// Used by the /measurements grouped overview.
/// </summary>
public class MeasurementSeriesGroupDto
{
    public int SeriesId { get; set; }
    public string SeriesName { get; set; } = string.Empty;
    public int MeasurementCount { get; set; }
    public int LatestMeasurementId { get; set; }
    public string LatestTemplateName { get; set; } = string.Empty;
    public DateTime LatestCreatedAt { get; set; }
    public List<string> TemplateNames { get; set; } = new();
    public List<string> AuthorNames { get; set; } = new();
}

/// <summary>
/// Response for measurement series
/// </summary>
public class MeasurementSeriesResponseDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int CreatedBy { get; set; }
    public string CreatedByUsername { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public int MeasurementCount { get; set; }
    
    // Locking information
    public bool IsLocked { get; set; }
    public int? LockedBy { get; set; }
    public string? LockedByUsername { get; set; }
    public DateTime? LockedAt { get; set; }
}
