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
            .Include(s => s.Locker)
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
            MeasurementCount = series.Measurements.Count,
            IsLocked = series.IsLocked,
            LockedBy = series.LockedBy,
            LockedByUsername = series.Locker?.Username,
            LockedAt = series.LockedAt
        };
    }

    public async Task<List<MeasurementSeriesResponseDto>> GetAllSeriesAsync()
    {
        var allSeries = await _context.MeasurementSeries
            .Include(s => s.Creator)
            .Include(s => s.Locker)
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
            MeasurementCount = s.Measurements.Count,
            IsLocked = s.IsLocked,
            LockedBy = s.LockedBy,
            LockedByUsername = s.Locker?.Username,
            LockedAt = s.LockedAt
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


    /// <summary>
    /// Update an existing measurement series
    /// </summary>
    public async Task<MeasurementSeriesResponseDto> UpdateSeriesAsync(int id, UpdateMeasurementSeriesDto dto)
    {
        var series = await _context.MeasurementSeries.FindAsync(id);
        if (series == null)
            throw new Exception($"MeasurementSeries with ID {id} not found");

        // Check if series is locked
        if (series.IsLocked)
            throw new Exception("Cannot update locked series. Please unlock it first.");

        // Update properties
        series.Name = dto.Name;
        series.Description = dto.Description;

        await _context.SaveChangesAsync();

        return await GetSeriesByIdAsync(id);
    }

    /// <summary>
    /// Lock a measurement series (Staff only)
    /// </summary>
    public async Task<MeasurementSeriesResponseDto> LockSeriesAsync(int id, int userId)
    {
        var series = await _context.MeasurementSeries.FindAsync(id);
        if (series == null)
            throw new Exception($"MeasurementSeries with ID {id} not found");

        if (series.IsLocked)
            throw new Exception("Series is already locked");

        series.IsLocked = true;
        series.LockedBy = userId;
        series.LockedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync();

        return await GetSeriesByIdAsync(id);
    }

    /// <summary>
    /// Unlock a measurement series (Staff only)
    /// </summary>
    public async Task<MeasurementSeriesResponseDto> UnlockSeriesAsync(int id)
    {
        var series = await _context.MeasurementSeries.FindAsync(id);
        if (series == null)
            throw new Exception($"MeasurementSeries with ID {id} not found");

        if (!series.IsLocked)
            throw new Exception("Series is not locked");

        series.IsLocked = false;
        series.LockedBy = null;
        series.LockedAt = null;

        await _context.SaveChangesAsync();

        return await GetSeriesByIdAsync(id);
    }
}