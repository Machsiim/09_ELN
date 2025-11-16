using System;
using System.Text.Json;

namespace eln.Backend.Application.Model;

public class MeasurementSeries
{
    #pragma warning disable CS8618
    protected MeasurementSeries() { }
    #pragma warning restore CS8618

    public MeasurementSeries(string name, int createdBy, string? description = null)
    {
        Name = name;
        Description = description;
        CreatedBy = createdBy;
        CreatedAt = DateTime.UtcNow;
    }

    public int Id { get; set; }
    public string Name { get; set; }
    public string? Description { get; set; }
    public int CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; }

    // Navigation Properties
    public User? Creator { get; set; }
    public List<Measurement> Measurements { get; set; } = new();
}
