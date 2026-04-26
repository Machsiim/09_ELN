using System.Text.Json;
using eln.Backend.Application.DTOs;
using eln.Backend.Application.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace eln.Backend.Application.Services;

public class AggregationService
{
    private readonly ElnContext _context;

    public AggregationService(ElnContext context)
    {
        _context = context;
    }

    public async Task<SeriesSummaryDto> GetSeriesSummaryAsync(int seriesId)
    {
        var series = await _context.MeasurementSeries.FindAsync(seriesId)
            ?? throw new NotFoundException($"Messserie mit ID {seriesId} nicht gefunden.");

        var measurements = await _context.Measurements
            .Where(m => m.SeriesId == seriesId)
            .ToListAsync();

        var numericFields = ExtractNumericFields(measurements);

        var fieldStats = numericFields.Select(kvp =>
        {
            var values = kvp.Value;
            return new FieldStatisticsDto
            {
                Key = kvp.Key,
                Label = kvp.Key,
                Section = "",
                Count = values.Count,
                Min = values.Count > 0 ? values.Min() : 0,
                Max = values.Count > 0 ? values.Max() : 0,
                Avg = values.Count > 0 ? values.Average() : 0,
                Median = values.Count > 0 ? CalculateMedian(values) : 0,
                StdDev = values.Count > 0 ? CalculateStdDev(values) : 0
            };
        }).ToList();

        return new SeriesSummaryDto
        {
            SeriesId = seriesId,
            SeriesName = series.Name,
            MeasurementCount = measurements.Count,
            Fields = fieldStats
        };
    }

    public async Task<GroupedAggregationDto> GetGroupedAggregationAsync(int seriesId, string groupBy)
    {
        var measurements = await _context.Measurements
            .Where(m => m.SeriesId == seriesId)
            .ToListAsync();

        if (measurements.Count == 0)
            throw new NotFoundException($"Keine Messungen in Serie {seriesId} gefunden.");

        var rows = measurements.Select(m => FlattenData(m.Data)).ToList();

        var groups = rows
            .GroupBy(r => r.TryGetValue(groupBy, out var v) ? v?.ToString() ?? "(leer)" : "(leer)")
            .Select(g =>
            {
                var numericFields = new Dictionary<string, List<double>>();
                foreach (var row in g)
                {
                    foreach (var kvp in row)
                    {
                        if (kvp.Key == groupBy) continue;
                        if (TryGetNumeric(kvp.Value, out var num))
                        {
                            if (!numericFields.ContainsKey(kvp.Key))
                                numericFields[kvp.Key] = new List<double>();
                            numericFields[kvp.Key].Add(num);
                        }
                    }
                }

                return new AggregationGroupDto
                {
                    Value = g.Key,
                    Count = g.Count(),
                    Aggregations = numericFields.ToDictionary(
                        kvp => kvp.Key,
                        kvp => new FieldAggregateDto
                        {
                            Avg = kvp.Value.Average(),
                            Min = kvp.Value.Min(),
                            Max = kvp.Value.Max()
                        })
                };
            }).ToList();

        return new GroupedAggregationDto
        {
            GroupField = groupBy,
            Groups = groups
        };
    }

    private static Dictionary<string, List<double>> ExtractNumericFields(List<Model.Measurement> measurements)
    {
        var result = new Dictionary<string, List<double>>();

        foreach (var m in measurements)
        {
            var flat = FlattenData(m.Data);
            foreach (var kvp in flat)
            {
                if (TryGetNumeric(kvp.Value, out var num))
                {
                    if (!result.ContainsKey(kvp.Key))
                        result[kvp.Key] = new List<double>();
                    result[kvp.Key].Add(num);
                }
            }
        }

        return result;
    }

    private static Dictionary<string, object?> FlattenData(JsonDocument data)
    {
        var result = new Dictionary<string, object?>();
        try
        {
            var sections = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, JsonElement>>>(
                data.RootElement.GetRawText());
            if (sections != null)
            {
                foreach (var section in sections)
                {
                    foreach (var field in section.Value)
                    {
                        result[field.Key] = field.Value;
                    }
                }
            }
        }
        catch { }
        return result;
    }

    private static bool TryGetNumeric(object? value, out double result)
    {
        result = 0;
        if (value is JsonElement je)
        {
            if (je.ValueKind == JsonValueKind.Number && je.TryGetDouble(out result))
                return true;
            if (je.ValueKind == JsonValueKind.String && double.TryParse(je.GetString()?.Replace(",", "."),
                System.Globalization.CultureInfo.InvariantCulture, out result))
                return true;
        }
        if (value is double d) { result = d; return true; }
        if (value is int i) { result = i; return true; }
        if (value is long l) { result = l; return true; }
        return false;
    }

    private static double CalculateMedian(List<double> values)
    {
        var sorted = values.OrderBy(v => v).ToList();
        int mid = sorted.Count / 2;
        return sorted.Count % 2 == 0
            ? (sorted[mid - 1] + sorted[mid]) / 2.0
            : sorted[mid];
    }

    private static double CalculateStdDev(List<double> values)
    {
        var avg = values.Average();
        var sumOfSquares = values.Sum(v => (v - avg) * (v - avg));
        return Math.Sqrt(sumOfSquares / values.Count);
    }
}
