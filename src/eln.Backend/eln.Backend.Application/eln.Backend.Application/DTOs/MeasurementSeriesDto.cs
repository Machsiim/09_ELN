namespace eln.Backend.Application.DTOs;

/// <summary>
/// Request to create a new measurement series
/// </summary>
public class CreateMeasurementSeriesDto
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
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
}
