using System.Text.Json;
using eln.Backend.Application.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace eln.Backend.Application.Services;

/// <summary>
/// Service for exporting measurements as Excel/CSV via the Python microservice
/// </summary>
public class ExportService
{
    private static readonly string[] MetaColumns = { "Mess-ID", "Erstellt von", "Erstellt am" };
    private const int SectionColorCount = 10;
    private const string MetaSectionName = "Allgemein";

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

        var (columns, rows, columnSections) = await GetSeriesData(seriesId);
        var (columnCards, columnFieldLabels) = BuildCardAndLabelMaps(columns);
        var columnSectionColors = BuildColumnSectionColors(columnSections);

        var payload = JsonSerializer.Serialize(new
        {
            data = rows,
            columns = columns,
            column_sections = columnSections,
            column_cards = columnCards,
            column_field_labels = columnFieldLabels,
            column_section_colors = columnSectionColors,
            meta_columns = MetaColumns,
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

        var (columns, rows, columnSections) = await GetSeriesData(seriesId);
        var (columnCards, columnFieldLabels) = BuildCardAndLabelMaps(columns);
        var columnSectionColors = BuildColumnSectionColors(columnSections);

        var payload = JsonSerializer.Serialize(new
        {
            data = rows,
            columns = columns,
            column_sections = columnSections,
            column_cards = columnCards,
            column_field_labels = columnFieldLabels,
            column_section_colors = columnSectionColors,
            meta_columns = MetaColumns,
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

        var (columns, row, columnSections) = FlattenMeasurement(measurement);
        var rows = new List<Dictionary<string, object?>> { row };
        var (columnCards, columnFieldLabels) = BuildCardAndLabelMaps(columns);
        var columnSectionColors = BuildColumnSectionColors(columnSections);

        var templateName = measurement.Template?.Name ?? "Messung";
        var payload = JsonSerializer.Serialize(new
        {
            data = rows,
            columns = columns,
            column_sections = columnSections,
            column_cards = columnCards,
            column_field_labels = columnFieldLabels,
            column_section_colors = columnSectionColors,
            meta_columns = MetaColumns,
            filename = $"{templateName}_Messung_{measurementId}"
        });

        return await CallPythonExport("/export/csv", payload);
    }

    private async Task<(List<string> columns, List<Dictionary<string, object?>> rows, Dictionary<string, string> columnSections)> GetSeriesData(int seriesId)
    {
        var measurements = await _context.Measurements
            .Include(m => m.Template)
            .Include(m => m.Creator)
            .Where(m => m.SeriesId == seriesId)
            .OrderBy(m => m.CreatedAt)
            .ToListAsync();

        if (measurements.Count == 0)
            return (new List<string>(), new List<Dictionary<string, object?>>(), new Dictionary<string, string>());

        // Collect all columns across all measurements + meta columns
        var metaColumns = MetaColumns.ToList();
        var dataColumnSet = new HashSet<string>();
        var flatRows = new List<Dictionary<string, object?>>();
        var allColumnSections = new Dictionary<string, string>
        {
            ["Mess-ID"] = "Allgemein",
            ["Erstellt von"] = "Allgemein",
            ["Erstellt am"] = "Allgemein"
        };

        foreach (var m in measurements)
        {
            var (columns, row, colSections) = FlattenMeasurement(m);
            foreach (var col in columns)
                dataColumnSet.Add(col);
            foreach (var kvp in colSections)
            {
                if (!allColumnSections.ContainsKey(kvp.Key))
                    allColumnSections[kvp.Key] = kvp.Value;
            }
            flatRows.Add(row);
        }

        // Meta columns first, then data columns grouped by section
        var allColumns = new List<string>(metaColumns);
        var sortedDataCols = dataColumnSet.Except(metaColumns)
            .OrderBy(c => allColumnSections.TryGetValue(c, out var s) ? s : "")
            .ThenBy(c => c)
            .ToList();
        allColumns.AddRange(sortedDataCols);

        return (allColumns, flatRows, allColumnSections);
    }

    private static (List<string> columns, Dictionary<string, object?> row, Dictionary<string, string> columnSections) FlattenMeasurement(
        Model.Measurement measurement)
    {
        var row = new Dictionary<string, object?>
        {
            ["Mess-ID"] = measurement.Id,
            ["Erstellt von"] = measurement.Creator?.Username ?? "Unknown",
            ["Erstellt am"] = measurement.CreatedAt.ToString("dd.MM.yyyy HH:mm")
        };

        var columns = new List<string> { "Mess-ID", "Erstellt von", "Erstellt am" };
        var columnSections = new Dictionary<string, string>
        {
            ["Mess-ID"] = "Allgemein",
            ["Erstellt von"] = "Allgemein",
            ["Erstellt am"] = "Allgemein"
        };

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

                        if (!columnSections.ContainsKey(colName))
                            columnSections[colName] = section.Key;

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

        return (columns, row, columnSections);
    }

    /// <summary>
    /// Assigns each non-meta column a colorIndex (0..SectionColorCount-1) based on the
    /// order in which its section first appears. Mirrors the frontend's
    /// getSectionColorMap() in measurement-series-detail.ts so exported Excel files
    /// use the same per-section colors as the on-screen view.
    /// </summary>
    private static Dictionary<string, int> BuildColumnSectionColors(Dictionary<string, string> columnSections)
    {
        var sectionIndex = new Dictionary<string, int>();
        var result = new Dictionary<string, int>();

        // columnSections preserves data-traversal insertion order, so iterating it
        // yields sections in the same first-appearance order the frontend uses.
        foreach (var kvp in columnSections)
        {
            var col = kvp.Key;
            var section = kvp.Value;
            if (MetaColumns.Contains(col)) continue;
            if (section == MetaSectionName) continue;

            if (!sectionIndex.TryGetValue(section, out var idx))
            {
                idx = sectionIndex.Count % SectionColorCount;
                sectionIndex[section] = idx;
            }
            result[col] = idx;
        }

        return result;
    }

    private static (Dictionary<string, string> cards, Dictionary<string, string> fieldLabels) BuildCardAndLabelMaps(List<string> columns)
    {
        var cards = new Dictionary<string, string>();
        var labels = new Dictionary<string, string>();
        const string sep = " - ";

        foreach (var col in columns)
        {
            var idx = col.IndexOf(sep, StringComparison.Ordinal);
            if (idx > -1)
            {
                cards[col] = col[..idx];
                labels[col] = col[(idx + sep.Length)..];
            }
            else
            {
                cards[col] = col;
                labels[col] = col;
            }
        }

        return (cards, labels);
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
