using System.Text.Json;
using eln.Backend.Application.DTOs;
using eln.Backend.Application.Infrastructure;
using eln.Backend.Application.Model;
using Microsoft.EntityFrameworkCore;

namespace eln.Backend.Application.Services;

/// <summary>
/// Service for managing measurements
/// </summary>
public class MeasurementService
{
    private readonly ElnContext _context;
    private readonly MeasurementValidationService _validationService;

    public MeasurementService(ElnContext context, MeasurementValidationService validationService)
    {
        _context = context;
        _validationService = validationService;
    }

    public async Task<MeasurementResponseDto> CreateMeasurementAsync(CreateMeasurementDto dto, int userId)
    {
        // Get template
        var template = await _context.Templates.FindAsync(dto.TemplateId);
        if (template == null)
            throw new Exception($"Template with ID {dto.TemplateId} not found");

        // Get series
        var series = await _context.MeasurementSeries.FindAsync(dto.SeriesId);
        if (series == null)
            throw new Exception($"MeasurementSeries with ID {dto.SeriesId} not found");

        // Parse template schema
        var schemaJson = template.Schema.RootElement.GetProperty("sections").GetRawText();
        var sections = JsonSerializer.Deserialize<List<TemplateSectionDto>>(schemaJson) ?? new();

        // Validate measurement data
        var validationResult = _validationService.ValidateMeasurementData(sections, dto.Data);
        if (!validationResult.IsValid)
        {
            var errorMessages = string.Join(", ", validationResult.Errors.Select(e => 
                $"{e.Section}.{e.Field}: {e.Error}"));
            throw new Exception($"Validation failed: {errorMessages}");
        }

        // Convert data to JSON
        var dataJson = JsonSerializer.Serialize(dto.Data);
        var jsonDocument = JsonDocument.Parse(dataJson);

        var measurement = new Measurement(dto.SeriesId, dto.TemplateId, jsonDocument, userId);
        
        _context.Measurements.Add(measurement);
        await _context.SaveChangesAsync();

        return await GetMeasurementByIdAsync(measurement.Id);
    }

    public async Task<MeasurementResponseDto> GetMeasurementByIdAsync(int id)
    {
        var measurement = await _context.Measurements
            .Include(m => m.Series)
            .Include(m => m.Template)
            .Include(m => m.Creator)
            .FirstOrDefaultAsync(m => m.Id == id);

        if (measurement == null)
            throw new Exception($"Measurement with ID {id} not found");

        var dataJson = measurement.Data.RootElement.GetRawText();
        var data = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, object?>>>(dataJson) 
                   ?? new();

        return new MeasurementResponseDto
        {
            Id = measurement.Id,
            SeriesId = measurement.SeriesId,
            SeriesName = measurement.Series?.Name ?? "Unknown",
            TemplateId = measurement.TemplateId,
            TemplateName = measurement.Template?.Name ?? "Unknown",
            Data = data,
            CreatedBy = measurement.CreatedBy,
            CreatedByUsername = measurement.Creator?.Username ?? "Unknown",
            CreatedAt = measurement.CreatedAt
        };
    }

    public async Task<List<MeasurementListDto>> GetMeasurementsBySeriesAsync(int seriesId)
    {
        var measurements = await _context.Measurements
            .Include(m => m.Series)
            .Include(m => m.Template)
            .Include(m => m.Creator)
            .Where(m => m.SeriesId == seriesId)
            .OrderByDescending(m => m.CreatedAt)
            .ToListAsync();

        return measurements.Select(m => new MeasurementListDto
        {
            Id = m.Id,
            SeriesId = m.SeriesId,
            SeriesName = m.Series?.Name ?? "Unknown",
            TemplateName = m.Template?.Name ?? "Unknown",
            CreatedByUsername = m.Creator?.Username ?? "Unknown",
            CreatedAt = m.CreatedAt
        }).ToList();
    }

    public async Task DeleteMeasurementAsync(int id)
    {
        var measurement = await _context.Measurements.FindAsync(id);
        if (measurement == null)
            throw new Exception($"Measurement with ID {id} not found");

        _context.Measurements.Remove(measurement);
        await _context.SaveChangesAsync();
    }
}
