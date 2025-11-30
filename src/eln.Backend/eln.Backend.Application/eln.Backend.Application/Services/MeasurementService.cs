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

        // Create initial history entry for "Created"
        var historyEntry = new MeasurementHistory(
            measurementId: measurement.Id,
            changeType: "Created",
            dataSnapshot: jsonDocument,
            changedBy: userId,
            changeDescription: "Measurement created"
        );
        _context.MeasurementHistories.Add(historyEntry);
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

    /// <summary>
    /// Get filtered measurements based on search criteria
    /// </summary>
    public async Task<List<MeasurementListDto>> GetFilteredMeasurementsAsync(MeasurementFilterDto filter)
    {
        var query = _context.Measurements
            .Include(m => m.Series)
            .Include(m => m.Template)
            .Include(m => m.Creator)
            .AsQueryable();

        // Filter by Template ID
        if (filter.TemplateId.HasValue)
        {
            query = query.Where(m => m.TemplateId == filter.TemplateId.Value);
        }

        // Filter by Series ID
        if (filter.SeriesId.HasValue)
        {
            query = query.Where(m => m.SeriesId == filter.SeriesId.Value);
        }

        // Filter by Date Range - From
        if (filter.DateFrom.HasValue)
        {
            query = query.Where(m => m.CreatedAt >= filter.DateFrom.Value);
        }

        // Filter by Date Range - To
        if (filter.DateTo.HasValue)
        {
            // Include the entire day of DateTo
            var dateTo = filter.DateTo.Value.Date.AddDays(1);
            query = query.Where(m => m.CreatedAt < dateTo);
        }

        // Search Text in Series Name, Template Name, or Creator Username
        if (!string.IsNullOrWhiteSpace(filter.SearchText))
        {
            var searchLower = filter.SearchText.ToLower();
            query = query.Where(m => 
                (m.Series != null && m.Series.Name.ToLower().Contains(searchLower)) ||
                (m.Template != null && m.Template.Name.ToLower().Contains(searchLower)) ||
                (m.Creator != null && m.Creator.Username.ToLower().Contains(searchLower))
            );
        }

        // Execute query and order by date descending
        var measurements = await query
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

    /// <summary>
    /// Update an existing measurement and track history
    /// </summary>
    public async Task<MeasurementResponseDto> UpdateMeasurementAsync(int id, UpdateMeasurementDto dto, int userId)
    {
        var measurement = await _context.Measurements
            .Include(m => m.Template)
            .FirstOrDefaultAsync(m => m.Id == id);
        
        if (measurement == null)
            throw new Exception($"Measurement with ID {id} not found");

        // Get template for validation
        var template = measurement.Template;
        if (template == null)
            throw new Exception($"Template for measurement {id} not found");

        // Parse template schema
        var schemaJson = template.Schema.RootElement.GetProperty("sections").GetRawText();
        var sections = JsonSerializer.Deserialize<List<TemplateSectionDto>>(schemaJson) ?? new();

        // Validate new measurement data
        var validationResult = _validationService.ValidateMeasurementData(sections, dto.Data);
        if (!validationResult.IsValid)
        {
            var errorMessages = string.Join(", ", validationResult.Errors.Select(e => 
                $"{e.Section}.{e.Field}: {e.Error}"));
            throw new Exception($"Validation failed: {errorMessages}");
        }

        // Create history entry with OLD data before updating
        var oldDataSnapshot = measurement.Data;
        var historyEntry = new MeasurementHistory(
            measurementId: measurement.Id,
            changeType: "Updated",
            dataSnapshot: oldDataSnapshot,
            changedBy: userId,
            changeDescription: "Measurement data updated"
        );
        _context.MeasurementHistories.Add(historyEntry);

        // Update measurement with new data
        var newDataJson = JsonSerializer.Serialize(dto.Data);
        measurement.Data = JsonDocument.Parse(newDataJson);

        await _context.SaveChangesAsync();

        return await GetMeasurementByIdAsync(id);
    }

    /// <summary>
    /// Get history for a specific measurement
    /// </summary>
    public async Task<List<MeasurementHistoryDto>> GetMeasurementHistoryAsync(int measurementId)
    {
        var history = await _context.MeasurementHistories
            .Include(mh => mh.Changer)
            .Where(mh => mh.MeasurementId == measurementId)
            .OrderByDescending(mh => mh.ChangedAt)
            .ToListAsync();

        return history.Select(h =>
        {
            var dataJson = h.DataSnapshot.RootElement.GetRawText();
            var data = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, object?>>>(dataJson) 
                       ?? new();

            return new MeasurementHistoryDto
            {
                Id = h.Id,
                MeasurementId = h.MeasurementId,
                ChangeType = h.ChangeType,
                DataSnapshot = data,
                ChangedBy = h.ChangedBy,
                ChangedByUsername = h.Changer?.Username ?? "Unknown",
                ChangedAt = h.ChangedAt,
                ChangeDescription = h.ChangeDescription
            };
        }).ToList();
    }
}
