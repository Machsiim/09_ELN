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

        // Check if series is locked
        if (series.IsLocked)
            throw new Exception("Cannot create measurement in locked series. Series must be unlocked first.");

        // Convert data to JSON first
        var dataJson = JsonSerializer.Serialize(dto.Data);
        var jsonDocument = JsonDocument.Parse(dataJson);

        // STRICT VALIDATION: All fields must be filled and types must match
        var validationResult = _validationService.ValidateMeasurementDataStrict(template.Schema, jsonDocument);
        if (!validationResult.IsValid)
        {
            var errorMessages = string.Join("; ", validationResult.Errors.Select(e => 
                $"{e.Section}.{e.Field}: {e.Error}"));
            throw new Exception($"Validation failed: {errorMessages}");
        }

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
    /// Role-based access: Students only see their own, Staff see all
    /// </summary>
    public async Task<List<MeasurementListDto>> GetFilteredMeasurementsAsync(
        MeasurementFilterDto filter, 
        int userId, 
        string userRole)
    {
        var query = _context.Measurements
            .Include(m => m.Series)
            .Include(m => m.Template)
            .Include(m => m.Creator)
            .AsQueryable();

        // RBAC: Students can see ALL measurements (no filter on viewing)
        // They can only EDIT/DELETE their own (enforced in controller)

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

        // Convert new data to JSON
        var newDataJson = JsonSerializer.Serialize(dto.Data);
        var newJsonDocument = JsonDocument.Parse(newDataJson);

        // STRICT VALIDATION: All fields must be filled and types must match
        var validationResult = _validationService.ValidateMeasurementDataStrict(template.Schema, newJsonDocument);
        if (!validationResult.IsValid)
        {
            var errorMessages = string.Join("; ", validationResult.Errors.Select(e => 
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
        measurement.Data = newJsonDocument;

        await _context.SaveChangesAsync();

        return await GetMeasurementByIdAsync(id);
    }

    /// <summary>
    /// Get history for a specific measurement
    /// </summary>
    public async Task<List<MeasurementHistoryDto>> GetMeasurementHistoryAsync(int measurementId)
    {
        // Get current measurement data
        var currentMeasurement = await _context.Measurements
            .FirstOrDefaultAsync(m => m.Id == measurementId);
        
        if (currentMeasurement == null)
            throw new Exception($"Measurement with ID {measurementId} not found");

        var currentDataJson = currentMeasurement.Data.RootElement.GetRawText();
        var currentData = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, object?>>>(currentDataJson) 
                          ?? new();

        // Get history ordered by time (oldest first for processing)
        var history = await _context.MeasurementHistories
            .Include(mh => mh.Changer)
            .Where(mh => mh.MeasurementId == measurementId)
            .OrderBy(mh => mh.ChangedAt) // Oldest first
            .ToListAsync();

        var result = new List<MeasurementHistoryDto>();
        Dictionary<string, Dictionary<string, object?>>? previousData = null;

        for (int i = 0; i < history.Count; i++)
        {
            var h = history[i];
            var dataJson = h.DataSnapshot.RootElement.GetRawText();
            var data = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, object?>>>(dataJson) 
                       ?? new();

            // Determine what data to compare against
            Dictionary<string, Dictionary<string, object?>>? nextData = null;
            if (i < history.Count - 1)
            {
                // Compare with next history entry
                var nextHistoryJson = history[i + 1].DataSnapshot.RootElement.GetRawText();
                nextData = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, object?>>>(nextHistoryJson);
            }
            else
            {
                // Last history entry - compare with current data
                nextData = currentData;
            }

            // Calculate changes
            var changes = CalculateChanges(data, nextData);

            result.Add(new MeasurementHistoryDto
            {
                Id = h.Id,
                MeasurementId = h.MeasurementId,
                ChangeType = h.ChangeType,
                DataSnapshot = data,
                Changes = changes,
                ChangedBy = h.ChangedBy,
                ChangedByUsername = h.Changer?.Username ?? "Unknown",
                ChangedAt = h.ChangedAt,
                ChangeDescription = h.ChangeDescription
            });
        }

        // Return in reverse order (newest first)
        result.Reverse();
        return result;
    }

    /// <summary>
    /// Calculate field-level changes between two data snapshots
    /// </summary>
    private List<FieldChangeDto> CalculateChanges(
        Dictionary<string, Dictionary<string, object?>> oldData,
        Dictionary<string, Dictionary<string, object?>> newData)
    {
        var changes = new List<FieldChangeDto>();

        // Check all sections in new data
        foreach (var section in newData)
        {
            var sectionName = section.Key;
            var newFields = section.Value;

            // Get old fields for this section (if exists)
            oldData.TryGetValue(sectionName, out var oldFields);
            oldFields ??= new Dictionary<string, object?>();

            // Check each field in the section
            foreach (var field in newFields)
            {
                var fieldName = field.Key;
                var newValue = field.Value?.ToString();

                oldFields.TryGetValue(fieldName, out var oldValueObj);
                var oldValue = oldValueObj?.ToString();

                // Only add to changes if values are different
                if (oldValue != newValue)
                {
                    changes.Add(new FieldChangeDto
                    {
                        Section = sectionName,
                        Field = fieldName,
                        OldValue = oldValue,
                        NewValue = newValue
                    });
                }
            }
        }

        // Check for removed fields (existed in old but not in new)
        foreach (var section in oldData)
        {
            var sectionName = section.Key;
            var oldFields = section.Value;

            newData.TryGetValue(sectionName, out var newFields);
            newFields ??= new Dictionary<string, object?>();

            foreach (var field in oldFields)
            {
                var fieldName = field.Key;
                
                if (!newFields.ContainsKey(fieldName))
                {
                    changes.Add(new FieldChangeDto
                    {
                        Section = sectionName,
                        Field = fieldName,
                        OldValue = field.Value?.ToString(),
                        NewValue = null // Field was removed
                    });
                }
            }
        }

        return changes;
    }
}
