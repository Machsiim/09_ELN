using System;

namespace eln.Backend.Application.Model;

public class File
{
    #pragma warning disable CS8618
    protected File() { }
    #pragma warning restore CS8618

    public File(string filename, string uri, int ownerId)
    {
        Filename = filename;
        Uri = uri;
        OwnerId = ownerId;
        CreatedAt = DateTime.UtcNow;
    }

    public int Id { get; set; }
    public string Filename { get; set; }
    public string Uri { get; set; }
    public int OwnerId { get; set; }
    public DateTime CreatedAt { get; set; }

    // Navigation Properties
    public User? Owner { get; set; }
    public List<MeasurementSeries> MeasurementSeries { get; set; } = new();
}
