using eln.Backend.Application.DTOs;
using System.Text.Json;

namespace eln.Backend.Application.Services;

/// <summary>
/// Service for validating measurement data against template schemas
/// </summary>
public class MeasurementValidationService
{
    /// <summary>
    /// Validates measurement data against a template schema
    /// </summary>
    public ValidationResultDto ValidateMeasurementData(
        List<TemplateSectionDto> templateSchema,
        Dictionary<string, Dictionary<string, object?>> measurementData)
    {
        var result = new ValidationResultDto { IsValid = true };
        var errors = new List<ValidationErrorDto>();

        foreach (var section in templateSchema)
        {
            // Check if section exists in measurement data
            if (!measurementData.ContainsKey(section.Name))
            {
                // Check if section has any required fields
                if (section.Fields.Any(f => f.Required))
                {
                    errors.Add(new ValidationErrorDto
                    {
                        Section = section.Name,
                        Field = "",
                        Error = $"Missing section '{section.Name}' with required fields"
                    });
                }
                continue;
            }

            var sectionData = measurementData[section.Name];

            foreach (var field in section.Fields)
            {
                // Check if required field exists
                if (field.Required && !sectionData.ContainsKey(field.Name))
                {
                    errors.Add(new ValidationErrorDto
                    {
                        Section = section.Name,
                        Field = field.Name,
                        Error = $"Required field '{field.Name}' is missing"
                    });
                    continue;
                }

                // Skip validation if field is not present and not required
                if (!sectionData.ContainsKey(field.Name))
                    continue;

                var value = sectionData[field.Name];

                // Validate null values
                if (value == null)
                {
                    if (field.Required)
                    {
                        errors.Add(new ValidationErrorDto
                        {
                            Section = section.Name,
                            Field = field.Name,
                            Error = $"Required field '{field.Name}' cannot be null"
                        });
                    }
                    continue;
                }

                // Validate data type
                var typeError = ValidateFieldType(field.Type, value);
                if (typeError != null)
                {
                    errors.Add(new ValidationErrorDto
                    {
                        Section = section.Name,
                        Field = field.Name,
                        Error = typeError
                    });
                }
            }
        }

        result.Errors = errors;
        result.IsValid = errors.Count == 0;
        return result;
    }

    private string? ValidateFieldType(string expectedType, object value)
    {
        try
        {
            switch (expectedType.ToLower())
            {
                case "int":
                    if (value is not int && !int.TryParse(value.ToString(), out _))
                        return $"Expected type 'int', got '{value.GetType().Name}'";
                    break;

                case "float":
                case "double":
                    if (value is not float and not double && !double.TryParse(value.ToString(), out _))
                        return $"Expected type 'float', got '{value.GetType().Name}'";
                    break;

                case "string":
                    if (value is not string)
                        return $"Expected type 'string', got '{value.GetType().Name}'";
                    break;

                case "bool":
                case "boolean":
                    if (value is not bool && !bool.TryParse(value.ToString(), out _))
                        return $"Expected type 'bool', got '{value.GetType().Name}'";
                    break;

                case "date":
                case "datetime":
                    if (value is not DateTime && !DateTime.TryParse(value.ToString(), out _))
                        return $"Expected type 'date', got '{value.GetType().Name}'";
                    break;

                default:
                    return $"Unknown field type '{expectedType}'";
            }

            return null;
        }
        catch (Exception ex)
        {
            return $"Type validation failed: {ex.Message}";
        }
    }

    /// <summary>
    /// Validates measurement data (as JsonDocument) against template schema
    /// Handles the actual schema format: sections[].title, sections[].cards[].fields[].label
    /// </summary>
    public ValidationResultDto ValidateMeasurementDataStrict(
        JsonDocument templateSchema,
        JsonDocument measurementData)
    {
        var result = new ValidationResultDto { IsValid = true };
        var errors = new List<ValidationErrorDto>();

        try
        {
            // Parse template schema - handles actual format with title/cards/label
            var sectionsElement = templateSchema.RootElement.GetProperty("sections");
            var measurementRoot = measurementData.RootElement;

            foreach (var section in sectionsElement.EnumerateArray())
            {
                // Get section name from "title" (actual schema format)
                var sectionName = section.TryGetProperty("title", out var titleProp)
                    ? titleProp.GetString() ?? ""
                    : section.TryGetProperty("name", out var nameProp)
                        ? nameProp.GetString() ?? ""
                        : "";

                if (string.IsNullOrEmpty(sectionName))
                    continue;

                // Check if section exists in measurement data
                if (!measurementRoot.TryGetProperty(sectionName, out var sectionDataElement))
                {
                    errors.Add(new ValidationErrorDto
                    {
                        Section = sectionName,
                        Field = "",
                        Error = $"Missing section '{sectionName}'"
                    });
                    continue;
                }

                // Get fields - either from cards[].fields[] or direct fields[]
                var fields = new List<(string label, string type)>();

                if (section.TryGetProperty("cards", out var cardsElement))
                {
                    // Schema format: sections[].cards[].fields[]
                    // Frontend builds key as: "${cardTitle} - ${fieldLabel}"
                    foreach (var card in cardsElement.EnumerateArray())
                    {
                        var cardTitle = card.TryGetProperty("title", out var cardTitleProp)
                            ? cardTitleProp.GetString() ?? ""
                            : "";

                        if (card.TryGetProperty("fields", out var cardFields))
                        {
                            foreach (var field in cardFields.EnumerateArray())
                            {
                                var fieldLabel = field.TryGetProperty("label", out var labelProp)
                                    ? labelProp.GetString() ?? ""
                                    : field.TryGetProperty("name", out var fnProp)
                                        ? fnProp.GetString() ?? ""
                                        : "";
                                var type = field.TryGetProperty("type", out var typeProp)
                                    ? typeProp.GetString() ?? "string"
                                    : "string";

                                if (!string.IsNullOrEmpty(fieldLabel))
                                {
                                    // Build composite key like frontend does: "cardTitle - fieldLabel"
                                    var compositeKey = !string.IsNullOrEmpty(cardTitle)
                                        ? $"{cardTitle} - {fieldLabel}"
                                        : fieldLabel;
                                    fields.Add((compositeKey, type));
                                }
                            }
                        }
                    }
                }
                else if (section.TryGetProperty("fields", out var directFields))
                {
                    // Schema format: sections[].fields[] (simpler format)
                    foreach (var field in directFields.EnumerateArray())
                    {
                        var label = field.TryGetProperty("name", out var fnProp)
                            ? fnProp.GetString() ?? ""
                            : field.TryGetProperty("label", out var labelProp)
                                ? labelProp.GetString() ?? ""
                                : "";
                        var type = field.TryGetProperty("type", out var typeProp)
                            ? typeProp.GetString() ?? "string"
                            : "string";

                        if (!string.IsNullOrEmpty(label))
                            fields.Add((label, type));
                    }
                }

                // Validate each field
                foreach (var (fieldLabel, fieldType) in fields)
                {
                    // Check if field exists in measurement data
                    if (!sectionDataElement.TryGetProperty(fieldLabel, out var fieldElement))
                    {
                        errors.Add(new ValidationErrorDto
                        {
                            Section = sectionName,
                            Field = fieldLabel,
                            Error = $"Field '{fieldLabel}' is missing"
                        });
                        continue;
                    }

                    // Check for null or undefined
                    if (fieldElement.ValueKind == JsonValueKind.Null ||
                        fieldElement.ValueKind == JsonValueKind.Undefined)
                    {
                        errors.Add(new ValidationErrorDto
                        {
                            Section = sectionName,
                            Field = fieldLabel,
                            Error = $"Field '{fieldLabel}' cannot be null or empty"
                        });
                        continue;
                    }

                    // Validate data type
                    var typeError = ValidateJsonFieldType(fieldType, fieldElement);
                    if (typeError != null)
                    {
                        errors.Add(new ValidationErrorDto
                        {
                            Section = sectionName,
                            Field = fieldLabel,
                            Error = typeError
                        });
                    }
                }
            }
        }
        catch (Exception ex)
        {
            errors.Add(new ValidationErrorDto
            {
                Section = "",
                Field = "",
                Error = $"Validation error: {ex.Message}"
            });
        }

        result.Errors = errors;
        result.IsValid = errors.Count == 0;
        return result;
    }

    /// <summary>
    /// Validates JSON field type against expected template type
    /// </summary>
    private string? ValidateJsonFieldType(string expectedType, JsonElement value)
    {
        try
        {
            switch (expectedType.ToLower())
            {
                case "int":
                case "integer":
                    if (value.ValueKind != JsonValueKind.Number)
                        return $"Expected type 'number' for int field, got '{value.ValueKind}'";
                    
                    // Check if it's actually an integer (no decimal part)
                    if (!value.TryGetInt32(out _) && !value.TryGetInt64(out _))
                        return $"Expected integer value, got decimal";
                    break;

                case "float":
                case "double":
                case "number":
                    if (value.ValueKind != JsonValueKind.Number)
                        return $"Expected type 'number', got '{value.ValueKind}'";
                    break;

                case "string":
                case "text":
                case "multiline":
                case "media":
                    if (value.ValueKind != JsonValueKind.String)
                        return $"Expected type 'string', got '{value.ValueKind}'";

                    // Check for empty strings
                    var strValue = value.GetString();
                    if (string.IsNullOrWhiteSpace(strValue))
                        return "String value cannot be empty or whitespace";
                    break;

                case "bool":
                case "boolean":
                    if (value.ValueKind != JsonValueKind.True && value.ValueKind != JsonValueKind.False)
                        return $"Expected type 'boolean', got '{value.ValueKind}'";
                    break;

                case "date":
                case "datetime":
                    if (value.ValueKind != JsonValueKind.String)
                        return $"Expected type 'string' for date field, got '{value.ValueKind}'";
                    
                    var dateStr = value.GetString();
                    if (!DateTime.TryParse(dateStr, out _))
                        return $"Invalid date format: '{dateStr}'";
                    break;

                default:
                    return $"Unknown field type '{expectedType}'";
            }

            return null;
        }
        catch (Exception ex)
        {
            return $"Type validation failed: {ex.Message}";
        }
    }
}
