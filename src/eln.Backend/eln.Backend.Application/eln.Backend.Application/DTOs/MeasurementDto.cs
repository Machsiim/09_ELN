using System;

namespace eln.Backend.Application.DTOs;

/// <summary>
/// Request to create a new measurement
/// </summary>
public class CreateMeasurementDto
{
    public int SeriesId { get; set; }
    public int TemplateId { get; set; }
    public Dictionary<string, Dictionary<string, object?>> Data { get; set; } = new();
    // Data structure: { "SectionName": { "FieldName": value } }
}

/// <summary>
/// Response when retrieving a measurement
/// </summary>
public class MeasurementResponseDto
{
    public int Id { get; set; }
    public int SeriesId { get; set; }
    public string SeriesName { get; set; } = string.Empty;
    public int TemplateId { get; set; }
    public string TemplateName { get; set; } = string.Empty;
    public Dictionary<string, Dictionary<string, object?>> Data { get; set; } = new();
    public int CreatedBy { get; set; }
    public string CreatedByUsername { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

/// <summary>
/// Lightweight measurement info for lists
/// </summary>
public class MeasurementListDto
{
    public int Id { get; set; }
    public int SeriesId { get; set; }
    public string SeriesName { get; set; } = string.Empty;
    public string TemplateName { get; set; } = string.Empty;
    public string CreatedByUsername { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}


/// <summary>
/// Filter parameters for searching measurements
/// </summary>
public class MeasurementFilterDto
{
    /// <summary>
    /// Filter by template ID (optional)
    /// </summary>
    public int? TemplateId { get; set; }

    /// <summary>
    /// Filter by series ID (optional)
    /// </summary>
    public int? SeriesId { get; set; }

    /// <summary>
    /// Filter measurements created from this date (optional)
    /// </summary>
    public DateTime? DateFrom { get; set; }

    /// <summary>
    /// Filter measurements created until this date (optional)
    /// </summary>
    public DateTime? DateTo { get; set; }

    /// <summary>
    /// Search text in series name, template name, or creator username (optional)
    /// </summary>
    public string? SearchText { get; set; }
}

/// <summary>
/// Request to update an existing measurement
/// </summary>
public class UpdateMeasurementDto
{
    public Dictionary<string, Dictionary<string, object?>> Data { get; set; } = new();
    // Data structure: { "SectionName": { "FieldName": value } }
}

/// <summary>
/// Response for measurement history entry
/// </summary>
public class MeasurementHistoryDto
{
    public int Id { get; set; }
    public int MeasurementId { get; set; }
    public string ChangeType { get; set; } = string.Empty;
    public Dictionary<string, Dictionary<string, object?>> DataSnapshot { get; set; } = new();
    public int ChangedBy { get; set; }
    public string ChangedByUsername { get; set; } = string.Empty;
    public DateTime ChangedAt { get; set; }
    public string? ChangeDescription { get; set; }
}
