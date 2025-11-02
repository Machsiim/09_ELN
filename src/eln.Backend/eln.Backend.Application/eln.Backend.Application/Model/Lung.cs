using System;

namespace eln.Backend.Application.Model;

public class Lung
{
    #pragma warning disable CS8618
    protected Lung() { }
    #pragma warning restore CS8618

    public Lung(int animalId, string side, float? weight = null, string? notes = null)
    {
        AnimalId = animalId;
        Side = side;
        Weight = weight;
        Notes = notes;
        CreatedAt = DateTime.UtcNow;
    }

    public int Id { get; set; }
    public int AnimalId { get; set; }
    public string Side { get; set; }
    public float? Weight { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedAt { get; set; }

    // Navigation Properties
    public Animal? Animal { get; set; }
    public List<MeasurementSeries> MeasurementSeries { get; set; } = new();
}
