using System;

namespace eln.Backend.Application.Model;

public class User
{
    #pragma warning disable CS8618
    protected User() { }
    #pragma warning restore CS8618

    public User(string username, string role)
    {
        Username = username;
        Role = role;
        CreatedAt = DateTime.UtcNow;
    }

    public int Id { get; set; }
    public string Username { get; set; }
    public string Role { get; set; }
    public DateTime CreatedAt { get; set; }

    // Navigation Properties
    public List<Template> Templates { get; set; } = new();
    public List<MeasurementSeries> MeasurementSeries { get; set; } = new();
    public List<Measurement> Measurements { get; set; } = new();
}
