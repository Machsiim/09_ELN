using System;

namespace eln.Backend.Application.Model;

public class Measurement
{
    #pragma warning disable CS8618
    protected Measurement() { }
    #pragma warning restore CS8618

    public Measurement(int seriesId, int createdBy, string? data = null, int? templateId = null)
    {
        SeriesId = seriesId;
        CreatedBy = createdBy;
        Data = data;
        TemplateId = templateId;
        CreatedAt = DateTime.UtcNow;
    }

    public int Id { get; set; }
    public int SeriesId { get; set; }
    public int? TemplateId { get; set; }
    public string? Data { get; set; } // JSONB wird im Context konfiguriert
    public int CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; }

    // Navigation Properties
    public MeasurementSeries? Series { get; set; }
    public Template? Template { get; set; }
    public User? Creator { get; set; }
}
