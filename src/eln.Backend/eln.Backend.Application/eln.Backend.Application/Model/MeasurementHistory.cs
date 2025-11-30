using System;
using System.Text.Json;

namespace eln.Backend.Application.Model;

public class MeasurementHistory
{
    #pragma warning disable CS8618
    protected MeasurementHistory() { }
    #pragma warning restore CS8618

    public MeasurementHistory(
        int measurementId, 
        string changeType, 
        JsonDocument dataSnapshot, 
        int changedBy,
        string? changeDescription = null)
    {
        MeasurementId = measurementId;
        ChangeType = changeType;
        DataSnapshot = dataSnapshot;
        ChangedBy = changedBy;
        ChangedAt = DateTime.UtcNow;
        ChangeDescription = changeDescription;
    }

    public int Id { get; set; }
    public int MeasurementId { get; set; }
    public string ChangeType { get; set; } // "Created", "Updated", "Deleted"
    public JsonDocument DataSnapshot { get; set; } // Snapshot of data at this point
    public int ChangedBy { get; set; }
    public DateTime ChangedAt { get; set; }
    public string? ChangeDescription { get; set; }

    // Navigation Properties
    public Measurement? Measurement { get; set; }
    public User? Changer { get; set; }
}
