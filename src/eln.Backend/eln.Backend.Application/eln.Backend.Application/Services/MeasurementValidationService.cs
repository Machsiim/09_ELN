using eln.Backend.Application.DTOs;

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
}
