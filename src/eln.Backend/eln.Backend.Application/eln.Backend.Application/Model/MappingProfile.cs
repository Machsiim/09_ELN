using System.Text.Json;

namespace eln.Backend.Application.Model;

public class MappingProfile
{
    #pragma warning disable CS8618
    protected MappingProfile() { }
    #pragma warning restore CS8618

    public MappingProfile(string name, int templateId, JsonDocument mapping, int createdBy)
    {
        Name = name;
        TemplateId = templateId;
        Mapping = mapping;
        CreatedBy = createdBy;
        CreatedAt = DateTime.UtcNow;
    }

    public int Id { get; set; }
    public string Name { get; set; }
    public int TemplateId { get; set; }
    public JsonDocument Mapping { get; set; }
    public int CreatedBy { get; set; }
    public DateTime CreatedAt { get; set; }

    // Navigation Properties
    public Template? Template { get; set; }
    public User? Creator { get; set; }
}
