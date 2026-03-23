namespace eln.Backend.Application.DTOs;

public class CreateMappingProfileDto
{
    public string Name { get; set; } = "";
    public int TemplateId { get; set; }
    public Dictionary<string, string> Mapping { get; set; } = new();
}

public class MappingProfileResponseDto
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public int TemplateId { get; set; }
    public Dictionary<string, string> Mapping { get; set; } = new();
    public DateTime CreatedAt { get; set; }
}
