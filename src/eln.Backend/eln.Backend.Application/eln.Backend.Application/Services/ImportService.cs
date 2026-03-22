using System.Net.Http.Headers;
using System.Text.Json;
using eln.Backend.Application.DTOs;
using eln.Backend.Application.Infrastructure;
using eln.Backend.Application.Model;
using Microsoft.EntityFrameworkCore;

namespace eln.Backend.Application.Services;

/// <summary>
/// Service for batch-importing measurements from Excel/CSV files via the Python microservice
/// </summary>
public class ImportService
{
    private readonly ElnContext _context;
    private readonly MeasurementValidationService _validationService;
    private readonly IHttpClientFactory _httpClientFactory;

    public ImportService(
        ElnContext context,
        MeasurementValidationService validationService,
        IHttpClientFactory httpClientFactory)
    {
        _context = context;
        _validationService = validationService;
        _httpClientFactory = httpClientFactory;
    }

    /// <summary>
    /// Import measurements from an Excel file
    /// </summary>
    public async Task<ImportResponseDto> ImportExcelAsync(
        Stream fileStream, string fileName, int templateId, int userId,
        int? seriesId = null, string? seriesName = null, string? seriesDescription = null)
    {
        var parseResult = await ParseFileViaPython(fileStream, fileName, "/parse-excel-full");
        return await ProcessImport(parseResult, templateId, userId, seriesId, seriesName, seriesDescription);
    }

    /// <summary>
    /// Import measurements from a CSV file
    /// </summary>
    public async Task<ImportResponseDto> ImportCsvAsync(
        Stream fileStream, string fileName, int templateId, int userId,
        int? seriesId = null, string? seriesName = null, string? seriesDescription = null)
    {
        var parseResult = await ParseFileViaPython(fileStream, fileName, "/parse-csv-full");
        return await ProcessImport(parseResult, templateId, userId, seriesId, seriesName, seriesDescription);
    }

    /// <summary>
    /// Generate a sample Excel template via the Python service
    /// </summary>
    public async Task<byte[]> GenerateSampleExcelAsync(JsonDocument schema, string templateName)
    {
        var client = _httpClientFactory.CreateClient("PythonService");

        var payload = JsonSerializer.Serialize(new
        {
            schema = JsonSerializer.Deserialize<object>(schema.RootElement.GetRawText()),
            template_name = templateName
        });

        var content = new StringContent(payload, System.Text.Encoding.UTF8, "application/json");
        var response = await client.PostAsync("/generate-sample-excel", content);

        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadAsStringAsync();
            throw new Exception($"Mustervorlage konnte nicht generiert werden: {error}");
        }

        return await response.Content.ReadAsByteArrayAsync();
    }

    private async Task<PythonFullParseResponse> ParseFileViaPython(Stream fileStream, string fileName, string endpoint)
    {
        var client = _httpClientFactory.CreateClient("PythonService");

        using var formContent = new MultipartFormDataContent();
        var streamContent = new StreamContent(fileStream);
        streamContent.Headers.ContentType = new MediaTypeHeaderValue("application/octet-stream");
        formContent.Add(streamContent, "file", fileName);

        var response = await client.PostAsync(endpoint, formContent);

        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadAsStringAsync();
            throw new Exception($"Datei konnte nicht geparst werden: {error}");
        }

        var json = await response.Content.ReadAsStringAsync();
        var result = JsonSerializer.Deserialize<PythonFullParseResponse>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true
        });

        return result ?? throw new Exception("Leere Antwort vom Python-Service.");
    }

    private async Task<ImportResponseDto> ProcessImport(
        PythonFullParseResponse parseResult, int templateId, int userId,
        int? seriesId, string? seriesName, string? seriesDescription)
    {
        // Load template
        var template = await _context.Templates.FindAsync(templateId);
        if (template == null)
            throw new Exception($"Template mit ID {templateId} nicht gefunden.");

        // Build field catalog from template schema
        var catalog = BuildFieldCatalog(template.Schema);
        if (catalog.Count == 0)
            throw new Exception("Template-Schema enthält keine Felder.");

        // Resolve or create series
        MeasurementSeries series;
        if (seriesId.HasValue)
        {
            series = await _context.MeasurementSeries.FindAsync(seriesId.Value)
                ?? throw new Exception($"Messserie mit ID {seriesId.Value} nicht gefunden.");
            if (series.IsLocked)
                throw new Exception("Messserie ist gesperrt. Import nicht möglich.");
        }
        else
        {
            var name = !string.IsNullOrWhiteSpace(seriesName)
                ? seriesName
                : $"Import {DateTime.UtcNow:yyyy-MM-dd HH:mm}";
            series = new MeasurementSeries(name, userId, seriesDescription);
            _context.MeasurementSeries.Add(series);
            await _context.SaveChangesAsync();
        }

        var result = new ImportResponseDto
        {
            SeriesId = series.Id,
            TotalRows = parseResult.Data.Count
        };

        // Auto-map columns to field keys
        var columnToFieldKey = AutoMapColumns(parseResult.Columns, catalog);

        // Process each row in a transaction
        await using var transaction = await _context.Database.BeginTransactionAsync();
        try
        {
            for (int rowIdx = 0; rowIdx < parseResult.Data.Count; rowIdx++)
            {
                var row = parseResult.Data[rowIdx];
                var rowNumber = rowIdx + 2; // +2 because row 1 is header, data starts at row 2

                var buildResult = BuildMeasurementData(row, columnToFieldKey, catalog);
                if (buildResult.Error != null)
                {
                    result.Errors.Add(new ImportRowErrorDto
                    {
                        Row = rowNumber,
                        Field = buildResult.Error.Field,
                        Message = buildResult.Error.Message
                    });
                    result.ErrorCount++;
                    continue;
                }

                // Validate against template schema
                var dataJson = JsonSerializer.Serialize(buildResult.Data);
                var dataDocument = JsonDocument.Parse(dataJson);
                var validation = _validationService.ValidateMeasurementDataStrict(template.Schema, dataDocument);

                if (!validation.IsValid)
                {
                    foreach (var error in validation.Errors)
                    {
                        result.Errors.Add(new ImportRowErrorDto
                        {
                            Row = rowNumber,
                            Field = $"{error.Section}.{error.Field}",
                            Message = error.Error
                        });
                    }
                    result.ErrorCount++;
                    continue;
                }

                var measurement = new Measurement(series.Id, templateId, dataDocument, userId);
                _context.Measurements.Add(measurement);
                await _context.SaveChangesAsync();

                // Create history entry
                var history = new MeasurementHistory(
                    measurementId: measurement.Id,
                    changeType: "Created",
                    dataSnapshot: dataDocument,
                    changedBy: userId,
                    changeDescription: "Importiert via Batch-Import"
                );
                _context.MeasurementHistories.Add(history);

                result.CreatedMeasurementIds.Add(measurement.Id);
                result.SuccessCount++;
            }

            await _context.SaveChangesAsync();
            await transaction.CommitAsync();
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync();
            throw new Exception($"Import fehlgeschlagen: {ex.Message}");
        }

        return result;
    }

    /// <summary>
    /// Build a flat list of field entries from the template schema (supports both UI and backend format)
    /// </summary>
    private static List<FieldCatalogEntry> BuildFieldCatalog(JsonDocument schema)
    {
        var entries = new List<FieldCatalogEntry>();
        JsonElement sectionsElement;

        if (schema.RootElement.ValueKind == JsonValueKind.Array)
        {
            sectionsElement = schema.RootElement;
        }
        else if (schema.RootElement.TryGetProperty("sections", out var prop))
        {
            sectionsElement = prop;
        }
        else
        {
            return entries;
        }

        foreach (var section in sectionsElement.EnumerateArray())
        {
            var sectionTitle = TryGetString(section, "title", "Title", "name", "Name") ?? "Sektion";

            // UI format: cards[].fields[].label
            if (section.TryGetProperty("cards", out var cards))
            {
                foreach (var card in cards.EnumerateArray())
                {
                    var cardTitle = TryGetString(card, "title", "Title") ?? "Bereich";
                    if (card.TryGetProperty("fields", out var fields))
                    {
                        foreach (var field in fields.EnumerateArray())
                        {
                            var label = TryGetString(field, "label", "Label") ?? "Feld";
                            var type = TryGetString(field, "type", "Type") ?? "text";
                            var fieldKey = $"{cardTitle} - {label}";
                            entries.Add(new FieldCatalogEntry(sectionTitle, fieldKey, label, type));
                        }
                    }
                }
                continue;
            }

            // Backend format: Fields[].Name
            if (section.TryGetProperty("Fields", out var backendFields) ||
                section.TryGetProperty("fields", out backendFields))
            {
                foreach (var field in backendFields.EnumerateArray())
                {
                    var name = TryGetString(field, "Name", "name", "label", "Label") ?? "";
                    var type = TryGetString(field, "Type", "type") ?? "string";
                    if (!string.IsNullOrEmpty(name))
                    {
                        entries.Add(new FieldCatalogEntry(sectionTitle, name, name, type));
                    }
                }
            }
        }

        return entries;
    }

    /// <summary>
    /// Auto-map Excel columns to template field keys using normalized matching
    /// </summary>
    private static Dictionary<string, string> AutoMapColumns(
        List<string> columns, List<FieldCatalogEntry> catalog)
    {
        var mapping = new Dictionary<string, string>();

        // Build lookup indexes
        var exactIndex = catalog.ToDictionary(e => e.FieldKey, e => e);
        var normalizedKeyIndex = catalog.ToDictionary(e => NormalizeToken(e.FieldKey), e => e);
        var normalizedLabelIndex = catalog
            .GroupBy(e => NormalizeToken(e.FieldLabel))
            .ToDictionary(g => g.Key, g => g.ToList());

        foreach (var column in columns)
        {
            // Exact match
            if (exactIndex.TryGetValue(column, out var exactMatch))
            {
                mapping[column] = exactMatch.FieldKey;
                continue;
            }

            // Normalized match against full key
            var normalizedCol = NormalizeToken(column);
            if (normalizedKeyIndex.TryGetValue(normalizedCol, out var normalizedMatch))
            {
                mapping[column] = normalizedMatch.FieldKey;
                continue;
            }

            // Normalized match against label only (if unique)
            if (normalizedLabelIndex.TryGetValue(normalizedCol, out var labelMatches) &&
                labelMatches.Count == 1)
            {
                mapping[column] = labelMatches[0].FieldKey;
            }
        }

        return mapping;
    }

    /// <summary>
    /// Build the nested measurement data structure from a flat row
    /// </summary>
    private static BuildDataResult BuildMeasurementData(
        Dictionary<string, JsonElement> row,
        Dictionary<string, string> columnToFieldKey,
        List<FieldCatalogEntry> catalog)
    {
        var data = new Dictionary<string, Dictionary<string, object?>>();

        foreach (var entry in catalog)
        {
            // Find which column maps to this field
            string? sourceColumn = null;
            foreach (var kvp in columnToFieldKey)
            {
                if (kvp.Value == entry.FieldKey)
                {
                    sourceColumn = kvp.Key;
                    break;
                }
            }

            if (sourceColumn == null)
            {
                return new BuildDataResult
                {
                    Error = new FieldError(entry.FieldKey, $"Keine Spalte für Feld '{entry.FieldKey}' zugeordnet.")
                };
            }

            row.TryGetValue(sourceColumn, out var rawValue);
            var parsedValue = ConvertValue(rawValue, entry.FieldType);

            if (parsedValue == null)
            {
                return new BuildDataResult
                {
                    Error = new FieldError(entry.FieldKey,
                        $"Ungültiger oder fehlender Wert für Feld '{entry.FieldKey}' (erwartet: {entry.FieldType}).")
                };
            }

            if (!data.ContainsKey(entry.SectionTitle))
                data[entry.SectionTitle] = new Dictionary<string, object?>();

            data[entry.SectionTitle][entry.FieldKey] = parsedValue;
        }

        return new BuildDataResult { Data = data };
    }

    private static object? ConvertValue(JsonElement element, string fieldType)
    {
        if (element.ValueKind == JsonValueKind.Null || element.ValueKind == JsonValueKind.Undefined)
            return null;

        var type = fieldType.ToLower();

        switch (type)
        {
            case "int":
            case "integer":
                if (element.ValueKind == JsonValueKind.Number)
                {
                    if (element.TryGetInt64(out var intVal)) return intVal;
                    if (element.TryGetDouble(out var dblVal)) return (long)dblVal;
                }
                if (element.ValueKind == JsonValueKind.String &&
                    long.TryParse(element.GetString(), out var parsedInt))
                    return parsedInt;
                return null;

            case "float":
            case "double":
            case "number":
                if (element.ValueKind == JsonValueKind.Number)
                {
                    if (element.TryGetDouble(out var num)) return num;
                }
                if (element.ValueKind == JsonValueKind.String)
                {
                    var str = element.GetString()?.Replace(",", ".");
                    if (double.TryParse(str, System.Globalization.CultureInfo.InvariantCulture, out var parsed))
                        return parsed;
                }
                return null;

            case "bool":
            case "boolean":
                if (element.ValueKind == JsonValueKind.True) return true;
                if (element.ValueKind == JsonValueKind.False) return false;
                if (element.ValueKind == JsonValueKind.Number)
                {
                    if (element.TryGetInt32(out var boolInt))
                        return boolInt == 1 ? true : boolInt == 0 ? false : null;
                }
                if (element.ValueKind == JsonValueKind.String)
                {
                    var s = element.GetString()?.Trim().ToLower();
                    if (s is "true" or "1" or "yes" or "y" or "ja") return true;
                    if (s is "false" or "0" or "no" or "n" or "nein") return false;
                }
                return null;

            case "date":
            case "datetime":
                if (element.ValueKind == JsonValueKind.String)
                {
                    var dateStr = element.GetString()?.Trim();
                    if (!string.IsNullOrEmpty(dateStr))
                    {
                        if (DateTime.TryParse(dateStr, out _))
                            return dateStr;
                    }
                }
                if (element.ValueKind == JsonValueKind.Number)
                {
                    // Excel serial date number
                    if (element.TryGetDouble(out var serial))
                    {
                        try
                        {
                            var dt = DateTime.FromOADate(serial);
                            return dt.ToString("yyyy-MM-dd");
                        }
                        catch { }
                    }
                }
                return null;

            case "string":
            case "text":
            case "multiline":
            case "media":
            case "table":
            default:
                if (element.ValueKind == JsonValueKind.String)
                {
                    var text = element.GetString()?.Trim();
                    return string.IsNullOrEmpty(text) ? null : text;
                }
                // For non-string values, serialize to string
                return element.ToString();
        }
    }

    private static string NormalizeToken(string value)
    {
        return System.Text.RegularExpressions.Regex
            .Replace(value.ToLower().Trim(), @"[^a-z0-9]+", " ")
            .Trim();
    }

    private static string? TryGetString(JsonElement element, params string[] propertyNames)
    {
        foreach (var name in propertyNames)
        {
            if (element.TryGetProperty(name, out var prop) && prop.ValueKind == JsonValueKind.String)
                return prop.GetString();
        }
        return null;
    }

    private record FieldCatalogEntry(string SectionTitle, string FieldKey, string FieldLabel, string FieldType);
    private record FieldError(string Field, string Message);

    private class BuildDataResult
    {
        public Dictionary<string, Dictionary<string, object?>>? Data { get; set; }
        public FieldError? Error { get; set; }
    }

    private class PythonFullParseResponse
    {
        public int Rows { get; set; }
        public List<string> Columns { get; set; } = new();
        public Dictionary<string, string> Dtypes { get; set; } = new();
        public List<Dictionary<string, JsonElement>> Data { get; set; } = new();
        public List<string>? Warnings { get; set; }
    }
}
