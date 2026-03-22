using System.Text.Json;
using eln.Backend.Application.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace eln.Backend.Application.Services;

/// <summary>
/// Service for exporting measurements as Excel/CSV via the Python microservice
/// </summary>
public class ExportService
{
    private readonly ElnContext _context;
    private readonly IHttpClientFactory _httpClientFactory;

    public ExportService(ElnContext context, IHttpClientFactory httpClientFactory)
    {
        _context = context;
        _httpClientFactory = httpClientFactory;
    }

    /// <summary>
    /// Export all measurements in a series as Excel
    /// </summary>
    public async Task<byte[]> ExportSeriesAsExcelAsync(int seriesId)
    {
        var series = await _context.MeasurementSeries.FindAsync(seriesId);
        if (series == null)
            throw new Exception($"Messserie mit ID {seriesId} nicht gefunden.");

        var (columns, rows) = await GetSeriesData(seriesId);

        var payload = JsonSerializer.Serialize(new
        {
            data = rows,
            columns = columns,
            filename = series.Name,
            sheet_name = series.Name.Length > 31 ? series.Name[..31] : series.Name
        });

        return await CallPythonExport("/export/excel", payload);
    }

    /// <summary>
    /// Export all measurements in a series as CSV
    /// </summary>
    public async Task<byte[]> ExportSeriesAsCsvAsync(int seriesId)
    {
        var series = await _context.MeasurementSeries.FindAsync(seriesId);
        if (series == null)
            throw new Exception($"Messserie mit ID {seriesId} nicht gefunden.");

        var (columns, rows) = await GetSeriesData(seriesId);

        var payload = JsonSerializer.Serialize(new
        {
            data = rows,
            columns = columns,
            filename = series.Name
        });

        return await CallPythonExport("/export/csv", payload);
    }

    /// <summary>
    /// Export a single measurement as CSV
    /// </summary>
    public async Task<byte[]> ExportMeasurementAsCsvAsync(int measurementId)
    {
        var measurement = await _context.Measurements
            .Include(m => m.Template)
            .Include(m => m.Creator)
            .FirstOrDefaultAsync(m => m.Id == measurementId);

        if (measurement == null)
            throw new Exception($"Messung mit ID {measurementId} nicht gefunden.");

        var (columns, row) = FlattenMeasurement(measurement);
        var rows = new List<Dictionary<string, object?>> { row };

        var templateName = measurement.Template?.Name ?? "Messung";
        var payload = JsonSerializer.Serialize(new
        {
            data = rows,
            columns = columns,
            filename = $"{templateName}_Messung_{measurementId}"
        });

        return await CallPythonExport("/export/csv", payload);
    }

    private async Task<(List<string> columns, List<Dictionary<string, object?>> rows)> GetSeriesData(int seriesId)
    {
        var measurements = await _context.Measurements
            .Include(m => m.Template)
            .Include(m => m.Creator)
            .Where(m => m.SeriesId == seriesId)
            .OrderBy(m => m.CreatedAt)
            .ToListAsync();

        if (measurements.Count == 0)
            return (new List<string>(), new List<Dictionary<string, object?>>());

        // Collect all columns across all measurements + meta columns
        var metaColumns = new List<string> { "ID", "Erstellt von", "Erstellt am" };
        var dataColumnSet = new HashSet<string>();
        var flatRows = new List<Dictionary<string, object?>>();

        foreach (var m in measurements)
        {
            var (columns, row) = FlattenMeasurement(m);
            foreach (var col in columns)
                dataColumnSet.Add(col);
            flatRows.Add(row);
        }

        // Meta columns first, then data columns in stable order
        var allColumns = new List<string>(metaColumns);
        var sortedDataCols = dataColumnSet.Except(metaColumns).OrderBy(c => c).ToList();
        allColumns.AddRange(sortedDataCols);

        return (allColumns, flatRows);
    }

    private static (List<string> columns, Dictionary<string, object?> row) FlattenMeasurement(
        Model.Measurement measurement)
    {
        var row = new Dictionary<string, object?>
        {
            ["ID"] = measurement.Id,
            ["Erstellt von"] = measurement.Creator?.Username ?? "Unknown",
            ["Erstellt am"] = measurement.CreatedAt.ToString("dd.MM.yyyy HH:mm")
        };

        var columns = new List<string> { "ID", "Erstellt von", "Erstellt am" };

        try
        {
            var dataJson = measurement.Data.RootElement.GetRawText();
            var data = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, object?>>>(dataJson);
            if (data != null)
            {
                foreach (var section in data)
                {
                    foreach (var field in section.Value)
                    {
                        var colName = field.Key;
                        if (!columns.Contains(colName))
                            columns.Add(colName);

                        // Convert JsonElement to native types
                        row[colName] = field.Value switch
                        {
                            JsonElement je => je.ValueKind switch
                            {
                                JsonValueKind.String => je.GetString(),
                                JsonValueKind.Number => je.TryGetInt64(out var l) ? l : je.GetDouble(),
                                JsonValueKind.True => true,
                                JsonValueKind.False => false,
                                JsonValueKind.Null => null,
                                _ => je.ToString()
                            },
                            _ => field.Value
                        };
                    }
                }
            }
        }
        catch { }

        return (columns, row);
    }

    private async Task<byte[]> CallPythonExport(string endpoint, string jsonPayload)
    {
        var client = _httpClientFactory.CreateClient("PythonService");
        var content = new StringContent(jsonPayload, System.Text.Encoding.UTF8, "application/json");
        var response = await client.PostAsync(endpoint, content);

        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadAsStringAsync();
            throw new Exception($"Export fehlgeschlagen: {error}");
        }

        return await response.Content.ReadAsByteArrayAsync();
    }
}
