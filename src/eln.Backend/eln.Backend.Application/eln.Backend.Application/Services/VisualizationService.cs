using System.Globalization;
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

        var labels = measurements
            .Select(m => m.CreatedAt.ToString("o", CultureInfo.InvariantCulture))
            .ToList();
        var templates = measurements
            .Select(m => m.Template?.Name ?? string.Empty)
            .ToList();

        // Composite key (Section, Field) -> per-measurement value list aligned to labels
        var allFields = new Dictionary<(string Section, string Field), List<double?>>();

        for (var i = 0; i < measurements.Count; i++)
        {
            var flat = FlattenNumericFields(measurements[i].Data);

            foreach (var key in flat.Keys)
            {
                if (!allFields.ContainsKey(key))
                {
                    var padded = new List<double?>(i);
                    for (var p = 0; p < i; p++) padded.Add(null);
                    allFields[key] = padded;
                }
            }

            foreach (var kvp in allFields)
            {
                kvp.Value.Add(flat.TryGetValue(kvp.Key, out var val) ? val : null);
            }
        }

        var datasets = allFields.Select(kvp => new TimelineDatasetDto
        {
            Field = kvp.Key.Field,
            Section = kvp.Key.Section,
            Values = kvp.Value
        }).ToList();

        return new TimelineDto
        {
            Labels = labels,
            Templates = templates,
            Datasets = datasets
        };
    }

    public async Task<DistributionDto> GetDistributionAsync(int seriesId, string section, string field, int bins = 10)
    {
        section ??= string.Empty;
        field ??= string.Empty;

        var measurements = await _context.Measurements
            .Where(m => m.SeriesId == seriesId)
            .ToListAsync();

        if (measurements.Count == 0)
            throw new NotFoundException($"Keine Messungen in Serie {seriesId} gefunden.");

        var lookupKey = (section, field);
        var values = new List<double>();
        foreach (var m in measurements)
        {
            var flat = FlattenNumericFields(m.Data);
            if (flat.TryGetValue(lookupKey, out var val) && val.HasValue)
                values.Add(val.Value);
        }

        if (values.Count == 0)
            throw new NotFoundException($"Keine numerischen Werte für Feld '{field}' in Sektion '{section}' gefunden.");

        bins = Math.Clamp(bins, 2, 100);
        var buckets = CreateBuckets(values, bins);

        return new DistributionDto
        {
            Field = field,
            Section = section,
            Values = values.OrderBy(v => v).ToList(),
            Buckets = buckets
        };
    }

    public async Task<List<VisualizableFieldDto>> GetFieldsAsync(int seriesId)
    {
        var measurements = await _context.Measurements
            .Include(m => m.Template)
            .Where(m => m.SeriesId == seriesId)
            .ToListAsync();

        if (measurements.Count == 0)
            throw new NotFoundException($"Keine Messungen in Serie {seriesId} gefunden.");

        var fields = new Dictionary<(string Section, string Field), VisualizableFieldDto>();

        foreach (var m in measurements)
        {
            var templateName = m.Template?.Name ?? string.Empty;
            try
            {
                var sections = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, JsonElement>>>(
                    m.Data.RootElement.GetRawText());
                if (sections == null) continue;

                foreach (var section in sections)
                {
                    foreach (var field in section.Value)
                    {
                        var compositeKey = (section.Key, field.Key);
                        if (fields.ContainsKey(compositeKey)) continue;

                        if (IsNumeric(field.Value))
                        {
                            fields[compositeKey] = new VisualizableFieldDto
                            {
                                Key = field.Key,
                                Label = field.Key,
                                Type = "number",
                                Section = section.Key,
                                TemplateName = templateName
                            };
                        }
                    }
                }
            }
            catch { }
        }

        return fields.Values.ToList();
    }

    private static bool IsNumeric(JsonElement value)
    {
        if (value.ValueKind == JsonValueKind.Number)
            return value.TryGetDouble(out var d) && !double.IsNaN(d) && !double.IsInfinity(d);

        if (value.ValueKind == JsonValueKind.String)
        {
            var s = value.GetString();
            if (string.IsNullOrWhiteSpace(s)) return false;
            return double.TryParse(s.Replace(",", "."),
                NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed)
                && !double.IsNaN(parsed) && !double.IsInfinity(parsed);
        }

        return false;
    }

    private static Dictionary<(string Section, string Field), double?> FlattenNumericFields(JsonDocument data)
    {
        var result = new Dictionary<(string, string), double?>();
        try
        {
            var sections = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, JsonElement>>>(
                data.RootElement.GetRawText());
            if (sections == null) return result;

            foreach (var section in sections)
            {
                foreach (var field in section.Value)
                {
                    var key = (section.Key, field.Key);

                    if (field.Value.ValueKind == JsonValueKind.Number
                        && field.Value.TryGetDouble(out var num)
                        && !double.IsNaN(num) && !double.IsInfinity(num))
                    {
                        result[key] = num;
                    }
                    else if (field.Value.ValueKind == JsonValueKind.String)
                    {
                        var s = field.Value.GetString();
                        if (!string.IsNullOrWhiteSpace(s)
                            && double.TryParse(s.Replace(",", "."),
                                NumberStyles.Float, CultureInfo.InvariantCulture, out var parsed)
                            && !double.IsNaN(parsed) && !double.IsInfinity(parsed))
                        {
                            result[key] = parsed;
                        }
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
