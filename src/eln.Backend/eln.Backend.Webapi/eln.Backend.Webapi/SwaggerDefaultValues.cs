using Microsoft.OpenApi.Any;
using Microsoft.OpenApi.Models;
using Swashbuckle.AspNetCore.SwaggerGen;

namespace eln.Backend.Webapi;

/// <summary>
/// Sets example/default values in Swagger UI so you can click "Try it out" → "Execute" without typing.
/// </summary>
public class SwaggerDefaultValuesFilter : IOperationFilter
{
    private static readonly Dictionary<string, Dictionary<string, string>> Defaults = new()
    {
        // AggregationController
        ["GetSeriesSummary"] = new() { ["seriesId"] = "1" },
        ["GetGroupedAggregation"] = new() { ["seriesId"] = "1", ["groupBy"] = "standort" },

        // VisualizationController
        ["GetTimeline"] = new() { ["seriesId"] = "1" },
        ["GetDistribution"] = new() { ["seriesId"] = "1", ["field"] = "temperatur" },
        ["GetSharedFields"] = new() { ["token"] = "share-token" },
        ["GetSharedTimeline"] = new() { ["token"] = "share-token" },
        ["GetSharedDistribution"] = new()
        {
            ["token"] = "share-token",
            ["field"] = "temperatur",
            ["bins"] = "10"
        },
        ["GetFields"] = new() { ["seriesId"] = "1" },

        // MeasurementsController
        ["GetMeasurementsBySeries"] = new() { ["seriesId"] = "1", ["searchText"] = "temperatur" },
        ["SearchMeasurements"] = new() { ["seriesId"] = "1", ["searchText"] = "Labor" },

        // TemplatesController
        ["GetTemplates"] = new() { ["page"] = "1", ["pageSize"] = "5", ["searchText"] = "Temperatur", ["archiveFilter"] = "active" },
    };

    private static readonly Dictionary<string, string> ParameterDescriptions = new()
    {
        ["searchText"] = "Optionaler Suchbegriff. Wird serverseitig angewendet.",
        ["archiveFilter"] = "Optionaler Template-Statusfilter: all, active oder archived.",
        ["page"] = "Seitennummer fuer paginierte Ergebnisse.",
        ["pageSize"] = "Anzahl der Ergebnisse pro Seite.",
        ["seriesId"] = "ID der Messserie."
    };

    public void Apply(OpenApiOperation operation, OperationFilterContext context)
    {
        var methodName = context.MethodInfo.Name;

        if (!Defaults.TryGetValue(methodName, out var paramDefaults))
            return;

        foreach (var param in operation.Parameters)
        {
            if (ParameterDescriptions.TryGetValue(param.Name, out var description))
            {
                param.Description ??= description;
            }

            if (paramDefaults.TryGetValue(param.Name, out var value))
            {
                param.Example = new OpenApiString(value);
            }
        }
    }
}
