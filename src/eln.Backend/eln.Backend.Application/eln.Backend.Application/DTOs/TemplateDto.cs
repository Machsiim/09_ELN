namespace eln.Backend.Application.DTOs;

/// <summary>
/// Defines a field in a template section
/// </summary>
public class TemplateFieldDto
{
    public string Name { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty; // "int", "float", "string", "date", "bool"
    public bool Required { get; set; }
    public string? Description { get; set; }
    public object? DefaultValue { get; set; }
}

/// <summary>
/// Defines a section in a template
/// </summary>
public class TemplateSectionDto
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public List<TemplateFieldDto> Fields { get; set; } = new();
}

/// <summary>
/// Request to create a new template
/// </summary>
public class CreateTemplateDto
{
    public string Name { get; set; } = string.Empty;
    public List<TemplateSectionDto> Sections { get; set; } = new();
}
