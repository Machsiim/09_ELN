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
    
    // Locking mechanism (for Staff to lock series)
    public bool IsLocked { get; set; } = false;
    public int? LockedBy { get; set; }
    public DateTime? LockedAt { get; set; }

    // Navigation Properties
    public User? Creator { get; set; }
    public User? Locker { get; set; } // User who locked the series
    public List<Measurement> Measurements { get; set; } = new();
}
