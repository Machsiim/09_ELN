using System.Text.Json;
using eln.Backend.Application.DTOs;
using eln.Backend.Application.Infrastructure;
using eln.Backend.Application.Model;
using Microsoft.EntityFrameworkCore;

namespace eln.Backend.Application.Services;

/// <summary>
/// Service for managing templates
/// </summary>
public class TemplateService
{
    private readonly ElnContext _context;

    public TemplateService(ElnContext context)
    {
        _context = context;
    }

    public async Task<TemplateResponseDto> CreateTemplateAsync(CreateTemplateDto dto, int userId)
    {
        // Convert DTO to JSON
        var schemaJson = JsonSerializer.Serialize(new { sections = dto.Sections });
        var jsonDocument = JsonDocument.Parse(schemaJson);

        var template = new Template(dto.Name, jsonDocument, userId);
        
        _context.Templates.Add(template);
        await _context.SaveChangesAsync();

        return await GetTemplateByIdAsync(template.Id);
    }

    public async Task<TemplateResponseDto> GetTemplateByIdAsync(int id)
    {
        var template = await _context.Templates
            .Include(t => t.Creator)
            .FirstOrDefaultAsync(t => t.Id == id);

        if (template == null)
            throw new Exception($"Template with ID {id} not found");

        var schemaJson = template.Schema.RootElement.GetProperty("sections").GetRawText();
        var sections = JsonSerializer.Deserialize<List<TemplateSectionDto>>(schemaJson) ?? new();

        return new TemplateResponseDto
        {
            Id = template.Id,
            Name = template.Name,
            Sections = sections,
            CreatedBy = template.CreatedBy,
            CreatedByUsername = template.Creator?.Username ?? "Unknown",
            CreatedAt = template.CreatedAt
        };
    }

    public async Task<List<TemplateListDto>> GetAllTemplatesAsync()
    {
        var templates = await _context.Templates
            .Include(t => t.Creator)
            .OrderByDescending(t => t.CreatedAt)
            .ToListAsync();

        return templates.Select(t =>
        {
            var schemaJson = t.Schema.RootElement.GetProperty("sections").GetRawText();
            var sections = JsonSerializer.Deserialize<List<TemplateSectionDto>>(schemaJson) ?? new();
            
            return new TemplateListDto
            {
                Id = t.Id,
                Name = t.Name,
                SectionCount = sections.Count,
                FieldCount = sections.Sum(s => s.Fields.Count),
                CreatedByUsername = t.Creator?.Username ?? "Unknown",
                CreatedAt = t.CreatedAt
            };
        }).ToList();
    }

    public async Task DeleteTemplateAsync(int id)
    {
        var template = await _context.Templates.FindAsync(id);
        if (template == null)
            throw new Exception($"Template with ID {id} not found");

        _context.Templates.Remove(template);
        await _context.SaveChangesAsync();
    }
}
