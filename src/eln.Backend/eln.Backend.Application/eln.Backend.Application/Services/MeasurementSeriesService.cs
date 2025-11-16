using eln.Backend.Application.DTOs;
using eln.Backend.Application.Infrastructure;
using eln.Backend.Application.Model;
using Microsoft.EntityFrameworkCore;

namespace eln.Backend.Application.Services;

/// <summary>
/// Service for managing measurement series
/// </summary>
public class MeasurementSeriesService
{
    private readonly ElnContext _context;

    public MeasurementSeriesService(ElnContext context)
    {
        _context = context;
    }

    public async Task<MeasurementSeriesResponseDto> CreateSeriesAsync(CreateMeasurementSeriesDto dto, int userId)
    {
        var series = new MeasurementSeries(dto.Name, userId, dto.Description);
        
        _context.MeasurementSeries.Add(series);
        await _context.SaveChangesAsync();

        return await GetSeriesByIdAsync(series.Id);
    }

    public async Task<MeasurementSeriesResponseDto> GetSeriesByIdAsync(int id)
    {
        var series = await _context.MeasurementSeries
            .Include(s => s.Creator)
            .Include(s => s.Measurements)
            .FirstOrDefaultAsync(s => s.Id == id);

        if (series == null)
            throw new Exception($"MeasurementSeries with ID {id} not found");

        return new MeasurementSeriesResponseDto
        {
            Id = series.Id,
            Name = series.Name,
            Description = series.Description,
            CreatedBy = series.CreatedBy,
            CreatedByUsername = series.Creator?.Username ?? "Unknown",
            CreatedAt = series.CreatedAt,
            MeasurementCount = series.Measurements.Count
        };
    }

    public async Task<List<MeasurementSeriesResponseDto>> GetAllSeriesAsync()
    {
        var allSeries = await _context.MeasurementSeries
            .Include(s => s.Creator)
            .Include(s => s.Measurements)
            .OrderByDescending(s => s.CreatedAt)
            .ToListAsync();

        return allSeries.Select(s => new MeasurementSeriesResponseDto
        {
            Id = s.Id,
            Name = s.Name,
            Description = s.Description,
            CreatedBy = s.CreatedBy,
            CreatedByUsername = s.Creator?.Username ?? "Unknown",
            CreatedAt = s.CreatedAt,
            MeasurementCount = s.Measurements.Count
        }).ToList();
    }

    public async Task DeleteSeriesAsync(int id)
    {
        var series = await _context.MeasurementSeries.FindAsync(id);
        if (series == null)
            throw new Exception($"MeasurementSeries with ID {id} not found");

        _context.MeasurementSeries.Remove(series);
        await _context.SaveChangesAsync();
    }
}
