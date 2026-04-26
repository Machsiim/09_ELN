namespace eln.Backend.Application.DTOs;

public class FieldStatisticsDto
{
    public string Key { get; set; } = "";
    public string Label { get; set; } = "";
    public string Section { get; set; } = "";
    public int Count { get; set; }
    public double Min { get; set; }
    public double Max { get; set; }
    public double Avg { get; set; }
    public double Median { get; set; }
    public double StdDev { get; set; }
}

public class SeriesSummaryDto
{
    public int SeriesId { get; set; }
    public string SeriesName { get; set; } = "";
    public int MeasurementCount { get; set; }
    public List<FieldStatisticsDto> Fields { get; set; } = new();
}

public class GroupedAggregationDto
{
    public string GroupField { get; set; } = "";
    public List<AggregationGroupDto> Groups { get; set; } = new();
}

public class AggregationGroupDto
{
    public string Value { get; set; } = "";
    public int Count { get; set; }
    public Dictionary<string, FieldAggregateDto> Aggregations { get; set; } = new();
}

public class FieldAggregateDto
{
    public double Avg { get; set; }
    public double Min { get; set; }
    public double Max { get; set; }
}

