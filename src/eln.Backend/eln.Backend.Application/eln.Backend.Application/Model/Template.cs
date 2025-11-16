using System;
using System.Text.Json;

namespace eln.Backend.Application.Model;

public class Template
{
    #pragma warning disable CS8618
    protected Template() { }
    #pragma warning restore CS8618

    public Template(string name, JsonDocument schema, int createdBy)
    {
        Name = name;
        Schema = schema;
        CreatedBy = createdBy;
        CreatedAt = DateTime.UtcNow;
    }

    public int Id { get; set; }
    public string Name { get; set; }
    public JsonDocument Schema { get; set; } // Template Definition (Sections + Fields)
    public int CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; }

    // Navigation Properties
    public User? Creator { get; set; }
    public List<Measurement> Measurements { get; set; } = new();
}
