using eln.Backend.Application.DTOs;
using eln.Backend.Application.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace eln.Backend.Application.Services;

public class ActivityService
{
    private readonly ElnContext _context;

    public ActivityService(ElnContext context)
    {
        _context = context;
    }

    public async Task<PagedResultDto<ActivityDto>> GetRecentActivitiesAsync(
        PaginationParams pagination, string? type = null, int? userId = null)
    {
        var all = await CollectActivitiesAsync(userId);

        if (!string.IsNullOrEmpty(type))
            all = all.Where(a => a.Type == type).ToList();

        var ordered = all.OrderByDescending(a => a.Timestamp).ToList();
        var total = ordered.Count;

        var items = ordered
            .Skip((pagination.Page - 1) * pagination.PageSize)
            .Take(pagination.PageSize)
            .ToList();

        return new PagedResultDto<ActivityDto>
        {
            Items = items,
            Total = total,
            Page = pagination.Page,
            PageSize = pagination.PageSize
        };
    }

    public async Task<List<ActivityDto>> GetRecentActivitiesSimpleAsync(int limit = 10)
    {
        var all = await CollectActivitiesAsync(null);
        return all.OrderByDescending(a => a.Timestamp).Take(limit).ToList();
    }

    private async Task<List<ActivityDto>> CollectActivitiesAsync(int? userId)
    {
        var activities = new List<ActivityDto>();

        var historyQuery = _context.MeasurementHistories
            .Include(h => h.Changer)
            .Include(h => h.Measurement!)
                .ThenInclude(m => m.Series)
            .AsQueryable();

        if (userId.HasValue)
            historyQuery = historyQuery.Where(h => h.ChangedBy == userId.Value);

        var histories = await historyQuery.ToListAsync();

        foreach (var h in histories)
        {
            var changeType = $"Measurement{h.ChangeType}";
            var seriesName = h.Measurement?.Series?.Name ?? "?";
            var description = h.ChangeType switch
            {
                "Created" => $"Messung in '{seriesName}' erstellt",
                "Updated" => $"Messung in '{seriesName}' aktualisiert",
                "Deleted" => $"Messung in '{seriesName}' gelöscht",
                _ => $"Messung in '{seriesName}' geändert"
            };

            activities.Add(new ActivityDto
            {
                Type = changeType,
                Description = description,
                Timestamp = h.ChangedAt,
                Username = h.Changer?.Username ?? "Unknown",
                UserId = h.ChangedBy,
                EntityId = h.MeasurementId,
                EntityType = "Measurement",
                SeriesId = h.Measurement?.SeriesId,
                SeriesName = h.Measurement?.Series?.Name
            });
        }

        var seriesQuery = _context.MeasurementSeries.Include(s => s.Creator).AsQueryable();
        if (userId.HasValue)
            seriesQuery = seriesQuery.Where(s => s.CreatedBy == userId.Value);

        var seriesList = await seriesQuery.ToListAsync();
        foreach (var s in seriesList)
        {
            activities.Add(new ActivityDto
            {
                Type = "SeriesCreated",
                Description = $"Messserie '{s.Name}' erstellt",
                Timestamp = s.CreatedAt,
                Username = s.Creator?.Username ?? "Unknown",
                UserId = s.CreatedBy,
                EntityId = s.Id,
                EntityType = "Series",
                SeriesId = s.Id,
                SeriesName = s.Name
            });
        }

        var templateQuery = _context.Templates.Include(t => t.Creator).AsQueryable();
        if (userId.HasValue)
            templateQuery = templateQuery.Where(t => t.CreatedBy == userId.Value);

        var templates = await templateQuery.ToListAsync();
        foreach (var t in templates)
        {
            activities.Add(new ActivityDto
            {
                Type = "TemplateCreated",
                Description = $"Template '{t.Name}' erstellt",
                Timestamp = t.CreatedAt,
                Username = t.Creator?.Username ?? "Unknown",
                UserId = t.CreatedBy,
                EntityId = t.Id,
                EntityType = "Template"
            });
        }

        return activities;
    }
}
