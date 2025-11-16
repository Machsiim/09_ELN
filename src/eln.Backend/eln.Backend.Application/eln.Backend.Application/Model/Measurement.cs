using System;
using System.Text.Json;

namespace eln.Backend.Application.Model;

public class Measurement
{
    #pragma warning disable CS8618
    protected Measurement() { }
    #pragma warning restore CS8618

    public Measurement(int seriesId, int templateId, JsonDocument data, int createdBy)
    {
        SeriesId = seriesId;
        TemplateId = templateId;
        Data = data;
        CreatedBy = createdBy;
        CreatedAt = DateTime.UtcNow;
    }

    public int Id { get; set; }
    public int SeriesId { get; set; }
    public int TemplateId { get; set; }
    public JsonDocument Data { get; set; } // Actual measurement values
    public int CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; }

    // Navigation Properties
    public MeasurementSeries? Series { get; set; }
    public Template? Template { get; set; }
    public User? Creator { get; set; }
}
