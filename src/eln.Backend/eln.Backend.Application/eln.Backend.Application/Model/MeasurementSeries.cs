using System;

namespace eln.Backend.Application.Model;

public class MeasurementSeries
{
    #pragma warning disable CS8618
    protected MeasurementSeries() { }
    #pragma warning restore CS8618

    public MeasurementSeries(int lungId, string name, int createdBy, string? importedFrom = null, int? fileId = null)
    {
        LungId = lungId;
        Name = name;
        CreatedBy = createdBy;
        ImportedFrom = importedFrom;
        FileId = fileId;
        CreatedAt = DateTime.UtcNow;
    }

    public int Id { get; set; }
    public int LungId { get; set; }
    public string Name { get; set; }
    public string? ImportedFrom { get; set; }
    public int CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; }
    public int? FileId { get; set; }

    // Navigation Properties
    public Lung? Lung { get; set; }
    public User? Creator { get; set; }
    public File? File { get; set; }
    public List<Measurement> Measurements { get; set; } = new();
}
