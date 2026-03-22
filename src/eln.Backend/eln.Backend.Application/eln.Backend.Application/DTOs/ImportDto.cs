namespace eln.Backend.Application.DTOs;

/// <summary>
/// Response from the import operation
/// </summary>
public class ImportResponseDto
{
    public int TotalRows { get; set; }
    public int SuccessCount { get; set; }
    public int ErrorCount { get; set; }
    public int SeriesId { get; set; }
    public List<ImportRowErrorDto> Errors { get; set; } = new();
    public List<int> CreatedMeasurementIds { get; set; } = new();
}

/// <summary>
/// Error detail for a single row during import
/// </summary>
public class ImportRowErrorDto
{
    public int Row { get; set; }
    public string? Field { get; set; }
    public string Message { get; set; } = string.Empty;
}
