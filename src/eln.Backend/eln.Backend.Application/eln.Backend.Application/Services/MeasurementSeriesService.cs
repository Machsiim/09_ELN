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
            throw new NotFoundException($"MeasurementSeries with ID {id} not found");

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

    public async Task<PagedResultDto<MeasurementSeriesResponseDto>> GetAllSeriesAsync(
        PaginationParams pagination,
        int? userId = null,
        string? userRole = null)
    {
        var query = _context.MeasurementSeries
            .Include(s => s.Creator)
            .Include(s => s.Locker)
            .Include(s => s.Measurements)
            .AsQueryable();

        if (IsStudent(userRole) && userId.HasValue)
            query = query.Where(s => s.CreatedBy == userId.Value);

        var total = await query.CountAsync();

        var allSeries = await query
            .OrderByDescending(s => s.CreatedAt)
            .Skip((pagination.Page - 1) * pagination.PageSize)
            .Take(pagination.PageSize)
            .ToListAsync();

        var items = allSeries.Select(s => new MeasurementSeriesResponseDto
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

        return new PagedResultDto<MeasurementSeriesResponseDto>
        {
            Items = items,
            Total = total,
            Page = pagination.Page,
            PageSize = pagination.PageSize
        };
    }

    private static bool IsStudent(string? userRole) =>
        string.Equals(userRole, "Student", StringComparison.OrdinalIgnoreCase);

    /// <summary>
    /// Returns paginated, aggregated series groups for the /messungen overview.
    /// Filters work on the measurement level, pagination is on the series level.
    /// </summary>
    public async Task<PagedResultDto<MeasurementSeriesGroupDto>> GetSeriesGroupsAsync(
        PaginationParams pagination,
        int? userId,
        string? userRole,
        int? templateId,
        DateTime? dateFrom,
        DateTime? dateTo,
        string? searchText)
    {
        var measurementsQuery = _context.Measurements
            .Include(m => m.Series)
            .Include(m => m.Template)
            .Include(m => m.Creator)
            .AsQueryable();

        if (IsStudent(userRole) && userId.HasValue)
            measurementsQuery = measurementsQuery.Where(m => m.CreatedBy == userId.Value);

        if (templateId.HasValue)
            measurementsQuery = measurementsQuery.Where(m => m.TemplateId == templateId.Value);

        if (dateFrom.HasValue)
            measurementsQuery = measurementsQuery.Where(m => m.CreatedAt >= dateFrom.Value);

        if (dateTo.HasValue)
        {
            var dateToExclusive = dateTo.Value.Date.AddDays(1);
            measurementsQuery = measurementsQuery.Where(m => m.CreatedAt < dateToExclusive);
        }

        if (!string.IsNullOrWhiteSpace(searchText))
        {
            var searchLower = searchText.ToLower();
            measurementsQuery = measurementsQuery.Where(m =>
                (m.Series != null && m.Series.Name.ToLower().Contains(searchLower)) ||
                (m.Template != null && m.Template.Name.ToLower().Contains(searchLower)) ||
                (m.Creator != null && m.Creator.Username.ToLower().Contains(searchLower))
            );
        }

        // Reduce to (seriesId, latestCreatedAt) and paginate over series.
        var seriesAggregates = measurementsQuery
            .GroupBy(m => m.SeriesId)
            .Select(g => new
            {
                SeriesId = g.Key,
                LatestCreatedAt = g.Max(m => m.CreatedAt),
                MeasurementCount = g.Count()
            });

        var total = await seriesAggregates.CountAsync();

        var pageKeys = await seriesAggregates
            .OrderByDescending(x => x.LatestCreatedAt)
            .Skip((pagination.Page - 1) * pagination.PageSize)
            .Take(pagination.PageSize)
            .ToListAsync();

        if (pageKeys.Count == 0)
        {
            return new PagedResultDto<MeasurementSeriesGroupDto>
            {
                Items = new List<MeasurementSeriesGroupDto>(),
                Total = total,
                Page = pagination.Page,
                PageSize = pagination.PageSize
            };
        }

        var seriesIds = pageKeys.Select(x => x.SeriesId).ToList();

        // Second query: load all (filtered) measurements for these series IDs only,
        // so we can build the aggregates (templates, authors, latest measurement).
        var detailMeasurements = await measurementsQuery
            .Where(m => seriesIds.Contains(m.SeriesId))
            .Select(m => new
            {
                m.Id,
                m.SeriesId,
                SeriesName = m.Series != null ? m.Series.Name : "Unknown",
                TemplateName = m.Template != null ? m.Template.Name : "Unknown",
                AuthorName = m.Creator != null ? m.Creator.Username : "Unknown",
                m.CreatedAt
            })
            .ToListAsync();

        var keyByID = pageKeys.ToDictionary(x => x.SeriesId);

        var items = detailMeasurements
            .GroupBy(m => m.SeriesId)
            .Select(g =>
            {
                var latest = g.OrderByDescending(m => m.CreatedAt).First();
                return new MeasurementSeriesGroupDto
                {
                    SeriesId = g.Key,
                    SeriesName = latest.SeriesName,
                    MeasurementCount = keyByID[g.Key].MeasurementCount,
                    LatestMeasurementId = latest.Id,
                    LatestTemplateName = latest.TemplateName,
                    LatestCreatedAt = keyByID[g.Key].LatestCreatedAt,
                    TemplateNames = g.Select(m => m.TemplateName).Distinct().OrderBy(n => n).ToList(),
                    AuthorNames = g.Select(m => m.AuthorName).Distinct().OrderBy(n => n).ToList()
                };
            })
            .OrderByDescending(s => s.LatestCreatedAt)
            .ToList();

        return new PagedResultDto<MeasurementSeriesGroupDto>
        {
            Items = items,
            Total = total,
            Page = pagination.Page,
            PageSize = pagination.PageSize
        };
    }

    public async Task DeleteSeriesAsync(int id)
    {
        var series = await _context.MeasurementSeries.FindAsync(id);
        if (series == null)
            throw new NotFoundException($"MeasurementSeries with ID {id} not found");

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
            throw new NotFoundException($"MeasurementSeries with ID {id} not found");

        // Check if series is locked
        if (series.IsLocked)
            throw new ValidationException("Cannot update locked series. Please unlock it first.");

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
            throw new NotFoundException($"MeasurementSeries with ID {id} not found");

        if (series.IsLocked)
            throw new ValidationException("Series is already locked");

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
            throw new NotFoundException($"MeasurementSeries with ID {id} not found");

        if (!series.IsLocked)
            throw new ValidationException("Series is not locked");

        series.IsLocked = false;
        series.LockedBy = null;
        series.LockedAt = null;

        await _context.SaveChangesAsync();

        return await GetSeriesByIdAsync(id);
    }
}
