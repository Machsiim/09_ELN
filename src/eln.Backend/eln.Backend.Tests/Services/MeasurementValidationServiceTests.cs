using System.Text.Json;
using eln.Backend.Application.DTOs;
using eln.Backend.Application.Services;
using Xunit;

namespace eln.Backend.Tests.Services;

public class MeasurementValidationServiceTests
{
    private readonly MeasurementValidationService _service = new();

    #region ValidateMeasurementData Tests

    [Fact]
    public void ValidateMeasurementData_ValidData_ReturnsValid()
    {
        var schema = new List<TemplateSectionDto>
        {
            new()
            {
                Name = "General",
                Fields = new List<TemplateFieldDto>
                {
                    new() { Name = "Temperature", Type = "float", Required = true },
                    new() { Name = "Notes", Type = "string", Required = false }
                }
            }
        };

        var data = new Dictionary<string, Dictionary<string, object?>>
        {
            ["General"] = new()
            {
                ["Temperature"] = 25.5,
                ["Notes"] = "Test note"
            }
        };

        var result = _service.ValidateMeasurementData(schema, data);

        Assert.True(result.IsValid);
        Assert.Empty(result.Errors);
    }

    [Fact]
    public void ValidateMeasurementData_MissingSectionWithRequiredFields_ReturnsError()
    {
        var schema = new List<TemplateSectionDto>
        {
            new()
            {
                Name = "General",
                Fields = new List<TemplateFieldDto>
                {
                    new() { Name = "Temperature", Type = "float", Required = true }
                }
            }
        };

        var data = new Dictionary<string, Dictionary<string, object?>>();

        var result = _service.ValidateMeasurementData(schema, data);

        Assert.False(result.IsValid);
        Assert.Single(result.Errors);
        Assert.Contains("Missing section", result.Errors[0].Error);
    }

    [Fact]
    public void ValidateMeasurementData_MissingRequiredField_ReturnsError()
    {
        var schema = new List<TemplateSectionDto>
        {
            new()
            {
                Name = "General",
                Fields = new List<TemplateFieldDto>
                {
                    new() { Name = "Temperature", Type = "float", Required = true },
                    new() { Name = "Pressure", Type = "float", Required = true }
                }
            }
        };

        var data = new Dictionary<string, Dictionary<string, object?>>
        {
            ["General"] = new()
            {
                ["Temperature"] = 25.5
                // Missing Pressure
            }
        };

        var result = _service.ValidateMeasurementData(schema, data);

        Assert.False(result.IsValid);
        Assert.Single(result.Errors);
        Assert.Equal("Pressure", result.Errors[0].Field);
    }

    [Fact]
    public void ValidateMeasurementData_NullRequiredField_ReturnsError()
    {
        var schema = new List<TemplateSectionDto>
        {
            new()
            {
                Name = "General",
                Fields = new List<TemplateFieldDto>
                {
                    new() { Name = "Temperature", Type = "float", Required = true }
                }
            }
        };

        var data = new Dictionary<string, Dictionary<string, object?>>
        {
            ["General"] = new()
            {
                ["Temperature"] = null
            }
        };

        var result = _service.ValidateMeasurementData(schema, data);

        Assert.False(result.IsValid);
        Assert.Contains("cannot be null", result.Errors[0].Error);
    }

    [Fact]
    public void ValidateMeasurementData_WrongType_ReturnsError()
    {
        var schema = new List<TemplateSectionDto>
        {
            new()
            {
                Name = "General",
                Fields = new List<TemplateFieldDto>
                {
                    new() { Name = "Count", Type = "int", Required = true }
                }
            }
        };

        var data = new Dictionary<string, Dictionary<string, object?>>
        {
            ["General"] = new()
            {
                ["Count"] = "not a number"
            }
        };

        var result = _service.ValidateMeasurementData(schema, data);

        Assert.False(result.IsValid);
        Assert.Contains("Expected type 'int'", result.Errors[0].Error);
    }

    [Fact]
    public void ValidateMeasurementData_OptionalFieldMissing_ReturnsValid()
    {
        var schema = new List<TemplateSectionDto>
        {
            new()
            {
                Name = "General",
                Fields = new List<TemplateFieldDto>
                {
                    new() { Name = "Notes", Type = "string", Required = false }
                }
            }
        };

        var data = new Dictionary<string, Dictionary<string, object?>>
        {
            ["General"] = new()
            {
                // Notes is optional and not provided
            }
        };

        var result = _service.ValidateMeasurementData(schema, data);

        Assert.True(result.IsValid);
    }

    [Fact]
    public void ValidateMeasurementData_BoolType_ValidatesCorrectly()
    {
        var schema = new List<TemplateSectionDto>
        {
            new()
            {
                Name = "General",
                Fields = new List<TemplateFieldDto>
                {
                    new() { Name = "IsActive", Type = "bool", Required = true }
                }
            }
        };

        var data = new Dictionary<string, Dictionary<string, object?>>
        {
            ["General"] = new()
            {
                ["IsActive"] = true
            }
        };

        var result = _service.ValidateMeasurementData(schema, data);

        Assert.True(result.IsValid);
    }

    [Fact]
    public void ValidateMeasurementData_DateType_ValidatesCorrectly()
    {
        var schema = new List<TemplateSectionDto>
        {
            new()
            {
                Name = "General",
                Fields = new List<TemplateFieldDto>
                {
                    new() { Name = "MeasurementDate", Type = "date", Required = true }
                }
            }
        };

        var data = new Dictionary<string, Dictionary<string, object?>>
        {
            ["General"] = new()
            {
                ["MeasurementDate"] = DateTime.Now
            }
        };

        var result = _service.ValidateMeasurementData(schema, data);

        Assert.True(result.IsValid);
    }

    [Fact]
    public void ValidateMeasurementData_UnknownFieldType_ReturnsError()
    {
        var schema = new List<TemplateSectionDto>
        {
            new()
            {
                Name = "General",
                Fields = new List<TemplateFieldDto>
                {
                    new() { Name = "Custom", Type = "unknowntype", Required = true }
                }
            }
        };

        var data = new Dictionary<string, Dictionary<string, object?>>
        {
            ["General"] = new()
            {
                ["Custom"] = "value"
            }
        };

        var result = _service.ValidateMeasurementData(schema, data);

        Assert.False(result.IsValid);
        Assert.Contains("Unknown field type", result.Errors[0].Error);
    }

    #endregion

    #region ValidateMeasurementDataStrict Tests

    [Fact]
    public void ValidateMeasurementDataStrict_ValidData_ReturnsValid()
    {
        var schemaJson = JsonDocument.Parse(@"{
            ""sections"": [
                {
                    ""Name"": ""General"",
                    ""Fields"": [
                        { ""Name"": ""Temperature"", ""Type"": ""float"", ""Required"": true },
                        { ""Name"": ""Notes"", ""Type"": ""string"", ""Required"": false }
                    ]
                }
            ]
        }");

        var dataJson = JsonDocument.Parse(@"{
            ""General"": {
                ""Temperature"": 25.5,
                ""Notes"": ""Test note""
            }
        }");

        var result = _service.ValidateMeasurementDataStrict(schemaJson, dataJson);

        Assert.True(result.IsValid);
        Assert.Empty(result.Errors);
    }

    [Fact]
    public void ValidateMeasurementDataStrict_MissingSection_ReturnsError()
    {
        var schemaJson = JsonDocument.Parse(@"{
            ""sections"": [
                {
                    ""Name"": ""General"",
                    ""Fields"": [
                        { ""Name"": ""Temperature"", ""Type"": ""float"", ""Required"": true }
                    ]
                }
            ]
        }");

        var dataJson = JsonDocument.Parse(@"{}");

        var result = _service.ValidateMeasurementDataStrict(schemaJson, dataJson);

        Assert.False(result.IsValid);
        Assert.Contains("Missing section", result.Errors[0].Error);
    }

    [Fact]
    public void ValidateMeasurementDataStrict_MissingField_ReturnsError()
    {
        var schemaJson = JsonDocument.Parse(@"{
            ""sections"": [
                {
                    ""Name"": ""General"",
                    ""Fields"": [
                        { ""Name"": ""Temperature"", ""Type"": ""float"", ""Required"": true }
                    ]
                }
            ]
        }");

        var dataJson = JsonDocument.Parse(@"{
            ""General"": {}
        }");

        var result = _service.ValidateMeasurementDataStrict(schemaJson, dataJson);

        Assert.False(result.IsValid);
        Assert.Contains("is missing", result.Errors[0].Error);
    }

    [Fact]
    public void ValidateMeasurementDataStrict_NullField_ReturnsError()
    {
        var schemaJson = JsonDocument.Parse(@"{
            ""sections"": [
                {
                    ""Name"": ""General"",
                    ""Fields"": [
                        { ""Name"": ""Temperature"", ""Type"": ""float"", ""Required"": true }
                    ]
                }
            ]
        }");

        var dataJson = JsonDocument.Parse(@"{
            ""General"": {
                ""Temperature"": null
            }
        }");

        var result = _service.ValidateMeasurementDataStrict(schemaJson, dataJson);

        Assert.False(result.IsValid);
        Assert.Contains("cannot be null", result.Errors[0].Error);
    }

    [Fact]
    public void ValidateMeasurementDataStrict_WrongNumberType_ReturnsError()
    {
        var schemaJson = JsonDocument.Parse(@"{
            ""sections"": [
                {
                    ""Name"": ""General"",
                    ""Fields"": [
                        { ""Name"": ""Temperature"", ""Type"": ""float"", ""Required"": true }
                    ]
                }
            ]
        }");

        var dataJson = JsonDocument.Parse(@"{
            ""General"": {
                ""Temperature"": ""not a number""
            }
        }");

        var result = _service.ValidateMeasurementDataStrict(schemaJson, dataJson);

        Assert.False(result.IsValid);
        Assert.Contains("Expected type 'number'", result.Errors[0].Error);
    }

    [Fact]
    public void ValidateMeasurementDataStrict_IntegerField_ValidatesCorrectly()
    {
        var schemaJson = JsonDocument.Parse(@"{
            ""sections"": [
                {
                    ""Name"": ""General"",
                    ""Fields"": [
                        { ""Name"": ""Count"", ""Type"": ""int"", ""Required"": true }
                    ]
                }
            ]
        }");

        var dataJson = JsonDocument.Parse(@"{
            ""General"": {
                ""Count"": 42
            }
        }");

        var result = _service.ValidateMeasurementDataStrict(schemaJson, dataJson);

        Assert.True(result.IsValid);
    }

    [Fact]
    public void ValidateMeasurementDataStrict_DecimalForIntField_ReturnsError()
    {
        var schemaJson = JsonDocument.Parse(@"{
            ""sections"": [
                {
                    ""Name"": ""General"",
                    ""Fields"": [
                        { ""Name"": ""Count"", ""Type"": ""int"", ""Required"": true }
                    ]
                }
            ]
        }");

        var dataJson = JsonDocument.Parse(@"{
            ""General"": {
                ""Count"": 42.5
            }
        }");

        var result = _service.ValidateMeasurementDataStrict(schemaJson, dataJson);

        Assert.False(result.IsValid);
        Assert.Contains("Expected integer", result.Errors[0].Error);
    }

    [Fact]
    public void ValidateMeasurementDataStrict_StringField_ValidatesCorrectly()
    {
        var schemaJson = JsonDocument.Parse(@"{
            ""sections"": [
                {
                    ""Name"": ""General"",
                    ""Fields"": [
                        { ""Name"": ""Notes"", ""Type"": ""string"", ""Required"": true }
                    ]
                }
            ]
        }");

        var dataJson = JsonDocument.Parse(@"{
            ""General"": {
                ""Notes"": ""Some notes""
            }
        }");

        var result = _service.ValidateMeasurementDataStrict(schemaJson, dataJson);

        Assert.True(result.IsValid);
    }

    [Fact]
    public void ValidateMeasurementDataStrict_EmptyString_ReturnsError()
    {
        var schemaJson = JsonDocument.Parse(@"{
            ""sections"": [
                {
                    ""Name"": ""General"",
                    ""Fields"": [
                        { ""Name"": ""Notes"", ""Type"": ""string"", ""Required"": true }
                    ]
                }
            ]
        }");

        var dataJson = JsonDocument.Parse(@"{
            ""General"": {
                ""Notes"": """"
            }
        }");

        var result = _service.ValidateMeasurementDataStrict(schemaJson, dataJson);

        Assert.False(result.IsValid);
        Assert.Contains("cannot be empty", result.Errors[0].Error);
    }

    [Fact]
    public void ValidateMeasurementDataStrict_BooleanField_ValidatesCorrectly()
    {
        var schemaJson = JsonDocument.Parse(@"{
            ""sections"": [
                {
                    ""Name"": ""General"",
                    ""Fields"": [
                        { ""Name"": ""IsActive"", ""Type"": ""boolean"", ""Required"": true }
                    ]
                }
            ]
        }");

        var dataJson = JsonDocument.Parse(@"{
            ""General"": {
                ""IsActive"": true
            }
        }");

        var result = _service.ValidateMeasurementDataStrict(schemaJson, dataJson);

        Assert.True(result.IsValid);
    }

    [Fact]
    public void ValidateMeasurementDataStrict_WrongBooleanType_ReturnsError()
    {
        var schemaJson = JsonDocument.Parse(@"{
            ""sections"": [
                {
                    ""Name"": ""General"",
                    ""Fields"": [
                        { ""Name"": ""IsActive"", ""Type"": ""boolean"", ""Required"": true }
                    ]
                }
            ]
        }");

        var dataJson = JsonDocument.Parse(@"{
            ""General"": {
                ""IsActive"": ""yes""
            }
        }");

        var result = _service.ValidateMeasurementDataStrict(schemaJson, dataJson);

        Assert.False(result.IsValid);
        Assert.Contains("Expected type 'boolean'", result.Errors[0].Error);
    }

    [Fact]
    public void ValidateMeasurementDataStrict_DateField_ValidatesCorrectly()
    {
        var schemaJson = JsonDocument.Parse(@"{
            ""sections"": [
                {
                    ""Name"": ""General"",
                    ""Fields"": [
                        { ""Name"": ""MeasurementDate"", ""Type"": ""date"", ""Required"": true }
                    ]
                }
            ]
        }");

        var dataJson = JsonDocument.Parse(@"{
            ""General"": {
                ""MeasurementDate"": ""2024-01-15""
            }
        }");

        var result = _service.ValidateMeasurementDataStrict(schemaJson, dataJson);

        Assert.True(result.IsValid);
    }

    [Fact]
    public void ValidateMeasurementDataStrict_InvalidDateFormat_ReturnsError()
    {
        var schemaJson = JsonDocument.Parse(@"{
            ""sections"": [
                {
                    ""Name"": ""General"",
                    ""Fields"": [
                        { ""Name"": ""MeasurementDate"", ""Type"": ""date"", ""Required"": true }
                    ]
                }
            ]
        }");

        var dataJson = JsonDocument.Parse(@"{
            ""General"": {
                ""MeasurementDate"": ""not-a-date""
            }
        }");

        var result = _service.ValidateMeasurementDataStrict(schemaJson, dataJson);

        Assert.False(result.IsValid);
        Assert.Contains("Invalid date format", result.Errors[0].Error);
    }

    [Fact]
    public void ValidateMeasurementDataStrict_UnknownFieldType_ReturnsError()
    {
        var schemaJson = JsonDocument.Parse(@"{
            ""sections"": [
                {
                    ""Name"": ""General"",
                    ""Fields"": [
                        { ""Name"": ""Custom"", ""Type"": ""unknowntype"", ""Required"": true }
                    ]
                }
            ]
        }");

        var dataJson = JsonDocument.Parse(@"{
            ""General"": {
                ""Custom"": ""value""
            }
        }");

        var result = _service.ValidateMeasurementDataStrict(schemaJson, dataJson);

        Assert.False(result.IsValid);
        Assert.Contains("Unknown field type", result.Errors[0].Error);
    }

    [Fact]
    public void ValidateMeasurementDataStrict_MultipleSections_ValidatesAll()
    {
        var schemaJson = JsonDocument.Parse(@"{
            ""sections"": [
                {
                    ""Name"": ""General"",
                    ""Fields"": [
                        { ""Name"": ""Temperature"", ""Type"": ""float"", ""Required"": true }
                    ]
                },
                {
                    ""Name"": ""Details"",
                    ""Fields"": [
                        { ""Name"": ""Notes"", ""Type"": ""string"", ""Required"": true }
                    ]
                }
            ]
        }");

        var dataJson = JsonDocument.Parse(@"{
            ""General"": {
                ""Temperature"": 25.5
            },
            ""Details"": {
                ""Notes"": ""Test notes""
            }
        }");

        var result = _service.ValidateMeasurementDataStrict(schemaJson, dataJson);

        Assert.True(result.IsValid);
    }

    [Fact]
    public void ValidateMeasurementDataStrict_MultipleErrors_ReturnsAllErrors()
    {
        var schemaJson = JsonDocument.Parse(@"{
            ""sections"": [
                {
                    ""Name"": ""General"",
                    ""Fields"": [
                        { ""Name"": ""Temperature"", ""Type"": ""float"", ""Required"": true },
                        { ""Name"": ""Count"", ""Type"": ""int"", ""Required"": true }
                    ]
                }
            ]
        }");

        var dataJson = JsonDocument.Parse(@"{
            ""General"": {
                ""Temperature"": ""not a number"",
                ""Count"": ""also not a number""
            }
        }");

        var result = _service.ValidateMeasurementDataStrict(schemaJson, dataJson);

        Assert.False(result.IsValid);
        Assert.Equal(2, result.Errors.Count);
    }

    [Fact]
    public void ValidateMeasurementDataStrict_TextType_ValidatesAsString()
    {
        var schemaJson = JsonDocument.Parse(@"{
            ""sections"": [
                {
                    ""Name"": ""General"",
                    ""Fields"": [
                        { ""Name"": ""Description"", ""Type"": ""text"", ""Required"": true }
                    ]
                }
            ]
        }");

        var dataJson = JsonDocument.Parse(@"{
            ""General"": {
                ""Description"": ""Some description""
            }
        }");

        var result = _service.ValidateMeasurementDataStrict(schemaJson, dataJson);

        Assert.True(result.IsValid);
    }

    [Fact]
    public void ValidateMeasurementDataStrict_NumberType_ValidatesAsFloat()
    {
        var schemaJson = JsonDocument.Parse(@"{
            ""sections"": [
                {
                    ""Name"": ""General"",
                    ""Fields"": [
                        { ""Name"": ""Value"", ""Type"": ""number"", ""Required"": true }
                    ]
                }
            ]
        }");

        var dataJson = JsonDocument.Parse(@"{
            ""General"": {
                ""Value"": 123.456
            }
        }");

        var result = _service.ValidateMeasurementDataStrict(schemaJson, dataJson);

        Assert.True(result.IsValid);
    }

    #endregion
}
