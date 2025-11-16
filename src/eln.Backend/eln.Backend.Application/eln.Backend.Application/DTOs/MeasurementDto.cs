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
