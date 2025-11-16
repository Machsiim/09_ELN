namespace eln.Backend.Application.DTOs;

/// <summary>
/// Response when retrieving a template
/// </summary>
public class TemplateResponseDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public List<TemplateSectionDto> Sections { get; set; } = new();
    public int CreatedBy { get; set; }
    public string CreatedByUsername { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}

/// <summary>
/// Lightweight template info for lists
/// </summary>
public class TemplateListDto
{
    public int Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public int SectionCount { get; set; }
    public int FieldCount { get; set; }
    public string CreatedByUsername { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
}
