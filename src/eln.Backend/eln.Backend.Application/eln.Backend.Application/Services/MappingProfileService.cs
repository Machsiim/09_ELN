using System.Text.Json;
using eln.Backend.Application.DTOs;
using eln.Backend.Application.Infrastructure;
using eln.Backend.Application.Model;
using Microsoft.EntityFrameworkCore;

namespace eln.Backend.Application.Services;

public class MappingProfileService
{
    private readonly ElnContext _context;

    public MappingProfileService(ElnContext context)
    {
        _context = context;
    }

    public async Task<PagedResultDto<MappingProfileResponseDto>> GetByTemplateAsync(
        int templateId, int userId, PaginationParams pagination)
    {
        var query = _context.MappingProfiles
            .Where(p => p.TemplateId == templateId && p.CreatedBy == userId)
            .OrderByDescending(p => p.CreatedAt);

        var total = await query.CountAsync();

        var profiles = await query
            .Skip((pagination.Page - 1) * pagination.PageSize)
            .Take(pagination.PageSize)
            .ToListAsync();

        var items = profiles.Select(p => new MappingProfileResponseDto
        {
            Id = p.Id,
            Name = p.Name,
            TemplateId = p.TemplateId,
            Mapping = JsonSerializer.Deserialize<Dictionary<string, string>>(
                p.Mapping.RootElement.GetRawText()) ?? new(),
            CreatedAt = p.CreatedAt
        }).ToList();

        return new PagedResultDto<MappingProfileResponseDto>
        {
            Items = items,
            Total = total,
            Page = pagination.Page,
            PageSize = pagination.PageSize
        };
    }

    public async Task<MappingProfileResponseDto?> GetByIdAsync(int id)
    {
        var p = await _context.MappingProfiles.FindAsync(id);
        if (p == null) return null;

        return new MappingProfileResponseDto
        {
            Id = p.Id,
            Name = p.Name,
            TemplateId = p.TemplateId,
            Mapping = JsonSerializer.Deserialize<Dictionary<string, string>>(
                p.Mapping.RootElement.GetRawText()) ?? new(),
            CreatedAt = p.CreatedAt
        };
    }

    public async Task<MappingProfileResponseDto> CreateAsync(CreateMappingProfileDto dto, int userId)
    {
        var mappingJson = JsonSerializer.Serialize(dto.Mapping);
        var mappingDoc = JsonDocument.Parse(mappingJson);

        var profile = new MappingProfile(dto.Name, dto.TemplateId, mappingDoc, userId);
        _context.MappingProfiles.Add(profile);
        await _context.SaveChangesAsync();

        return new MappingProfileResponseDto
        {
            Id = profile.Id,
            Name = profile.Name,
            TemplateId = profile.TemplateId,
            Mapping = dto.Mapping,
            CreatedAt = profile.CreatedAt
        };
    }

    public async Task<bool> DeleteAsync(int id, int userId)
    {
        var profile = await _context.MappingProfiles.FindAsync(id);
        if (profile == null || profile.CreatedBy != userId) return false;

        _context.MappingProfiles.Remove(profile);
        await _context.SaveChangesAsync();
        return true;
    }
}
