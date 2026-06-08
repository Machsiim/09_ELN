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

        // Collect all columns across all measurements + meta columns.
        // The on-screen table (getTemplateGroups in measurement-series-detail.ts)
        // renders sections/cards/fields in their stored definition order, so we
        // mirror that here: data columns are grouped by section in the order each
        // section first appears, and within a section in the order each column
        // first appears. This keeps export and view consistent.
        var metaColumns = MetaColumns.ToList();
        var metaSet = new HashSet<string>(metaColumns);
        var flatRows = new List<Dictionary<string, object?>>();
        var allColumnSections = new Dictionary<string, string>
        {
            ["Mess-ID"] = "Allgemein",
            ["Erstellt von"] = "Allgemein",
            ["Erstellt am"] = "Allgemein"
        };

        var sectionOrder = new List<string>();
        var columnsBySection = new Dictionary<string, List<string>>();
        var seenColumns = new HashSet<string>();

        foreach (var m in measurements)
        {
            var (columns, row, colSections) = FlattenMeasurement(m);
            foreach (var col in columns)
            {
                if (metaSet.Contains(col)) continue;

                if (!allColumnSections.ContainsKey(col))
                    allColumnSections[col] = colSections.TryGetValue(col, out var s) ? s : "";

                var section = allColumnSections[col];
                if (!columnsBySection.TryGetValue(section, out var bucket))
                {
                    bucket = new List<string>();
                    columnsBySection[section] = bucket;
                    sectionOrder.Add(section);
                }

                if (seenColumns.Add(col))
                    bucket.Add(col);
            }
            flatRows.Add(row);
        }

        // Meta columns first, then data columns grouped by section in first-appearance order
        var allColumns = new List<string>(metaColumns);
        foreach (var section in sectionOrder)
            allColumns.AddRange(columnsBySection[section]);

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
            // Iterate the raw JSON in document order (sections, then fields within a
            // section) so the exported column order matches the on-screen table.
            // A Dictionary<,> would not guarantee insertion order.
            var root = measurement.Data.RootElement;
            if (root.ValueKind == JsonValueKind.Object)
            {
                foreach (var section in root.EnumerateObject())
                {
                    if (section.Value.ValueKind != JsonValueKind.Object)
                        continue;

                    foreach (var field in section.Value.EnumerateObject())
                    {
                        var colName = field.Name;
                        if (!columns.Contains(colName))
                            columns.Add(colName);

                        if (!columnSections.ContainsKey(colName))
                            columnSections[colName] = section.Name;

                        // Convert JsonElement to native types
                        var je = field.Value;
                        row[colName] = je.ValueKind switch
                        {
                            JsonValueKind.String => je.GetString(),
                            JsonValueKind.Number => je.TryGetInt64(out var l) ? l : je.GetDouble(),
                            JsonValueKind.True => true,
                            JsonValueKind.False => false,
                            JsonValueKind.Null => null,
                            _ => je.ToString()
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
