using System.Text.Json;
using eln.Backend.Application.DTOs;
using eln.Backend.Application.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace eln.Backend.Application.Services;

public class VisualizationService
{
    private readonly ElnContext _context;

    public VisualizationService(ElnContext context)
    {
        _context = context;
    }

    public async Task<TimelineDto> GetTimelineAsync(int seriesId)
    {
        var measurements = await _context.Measurements
            .Include(m => m.Template)
            .Where(m => m.SeriesId == seriesId)
            .OrderBy(m => m.CreatedAt)
            .ToListAsync();

        if (measurements.Count == 0)
            throw new NotFoundException($"Keine Messungen in Serie {seriesId} gefunden.");

        var labels = measurements.Select(m => m.CreatedAt.ToString("dd.MM.yyyy HH:mm")).ToList();

        // Collect all numeric fields across measurements
        var allFields = new Dictionary<string, List<double?>>();

        foreach (var m in measurements)
        {
            var flat = FlattenNumericFields(m.Data);
            foreach (var key in flat.Keys)
            {
                if (!allFields.ContainsKey(key))
                    allFields[key] = new List<double?>(new double?[measurements.IndexOf(m)]);
            }
            foreach (var kvp in allFields)
            {
                if (flat.TryGetValue(kvp.Key, out var val))
                    kvp.Value.Add(val);
                else
                    kvp.Value.Add(null);
            }
        }

        var datasets = allFields.Select(kvp => new TimelineDatasetDto
        {
            Field = kvp.Key,
            Section = "",
            Values = kvp.Value
        }).ToList();

        return new TimelineDto
        {
            Labels = labels,
            Datasets = datasets
        };
    }

    public async Task<DistributionDto> GetDistributionAsync(int seriesId, string fieldKey)
    {
        var measurements = await _context.Measurements
            .Where(m => m.SeriesId == seriesId)
            .ToListAsync();

        if (measurements.Count == 0)
            throw new NotFoundException($"Keine Messungen in Serie {seriesId} gefunden.");

        var values = new List<double>();
        foreach (var m in measurements)
        {
            var flat = FlattenNumericFields(m.Data);
            if (flat.TryGetValue(fieldKey, out var val) && val.HasValue)
                values.Add(val.Value);
        }

        if (values.Count == 0)
            throw new NotFoundException($"Keine numerischen Werte für Feld '{fieldKey}' gefunden.");

        // Create histogram buckets
        var buckets = CreateBuckets(values);

        return new DistributionDto
        {
            Field = fieldKey,
            Values = values.OrderBy(v => v).ToList(),
            Buckets = buckets
        };
    }

    public async Task<List<VisualizableFieldDto>> GetFieldsAsync(int seriesId)
    {
        var measurements = await _context.Measurements
            .Include(m => m.Template)
            .Where(m => m.SeriesId == seriesId)
            .Take(10) // Sample first 10 to detect numeric fields
            .ToListAsync();

        if (measurements.Count == 0)
            throw new NotFoundException($"Keine Messungen in Serie {seriesId} gefunden.");

        var fields = new Dictionary<string, VisualizableFieldDto>();

        foreach (var m in measurements)
        {
            try
            {
                var sections = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, JsonElement>>>(
                    m.Data.RootElement.GetRawText());
                if (sections == null) continue;

                foreach (var section in sections)
                {
                    foreach (var field in section.Value)
                    {
                        if (fields.ContainsKey(field.Key)) continue;

                        var isNumeric = field.Value.ValueKind == JsonValueKind.Number
                            || (field.Value.ValueKind == JsonValueKind.String
                                && double.TryParse(field.Value.GetString()?.Replace(",", "."),
                                    System.Globalization.CultureInfo.InvariantCulture, out _));

                        if (isNumeric)
                        {
                            fields[field.Key] = new VisualizableFieldDto
                            {
                                Key = field.Key,
                                Label = field.Key,
                                Type = "number",
                                Section = section.Key
                            };
                        }
                    }
                }
            }
            catch { }
        }

        return fields.Values.ToList();
    }

    private static Dictionary<string, double?> FlattenNumericFields(JsonDocument data)
    {
        var result = new Dictionary<string, double?>();
        try
        {
            var sections = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, JsonElement>>>(
                data.RootElement.GetRawText());
            if (sections == null) return result;

            foreach (var section in sections)
            {
                foreach (var field in section.Value)
                {
                    if (field.Value.ValueKind == JsonValueKind.Number && field.Value.TryGetDouble(out var num))
                    {
                        result[field.Key] = num;
                    }
                    else if (field.Value.ValueKind == JsonValueKind.String
                        && double.TryParse(field.Value.GetString()?.Replace(",", "."),
                            System.Globalization.CultureInfo.InvariantCulture, out var parsed))
                    {
                        result[field.Key] = parsed;
                    }
                }
            }
        }
        catch { }
        return result;
    }

    private static List<BucketDto> CreateBuckets(List<double> values, int bucketCount = 10)
    {
        if (values.Count == 0) return new List<BucketDto>();

        var min = values.Min();
        var max = values.Max();

        if (Math.Abs(max - min) < 0.0001)
        {
            return new List<BucketDto>
            {
                new() { Min = min, Max = max, Count = values.Count }
            };
        }

        var bucketSize = (max - min) / bucketCount;
        var buckets = new List<BucketDto>();

        for (int i = 0; i < bucketCount; i++)
        {
            var bucketMin = min + i * bucketSize;
            var bucketMax = min + (i + 1) * bucketSize;
            var count = values.Count(v => v >= bucketMin && (i == bucketCount - 1 ? v <= bucketMax : v < bucketMax));
            buckets.Add(new BucketDto { Min = bucketMin, Max = bucketMax, Count = count });
        }

        return buckets;
    }
}
