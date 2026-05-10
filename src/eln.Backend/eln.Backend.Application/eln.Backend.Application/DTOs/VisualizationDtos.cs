namespace eln.Backend.Application.DTOs;

public class TimelineDto
{
    public List<string> Labels { get; set; } = new();
    public List<TimelineDatasetDto> Datasets { get; set; } = new();
}

public class TimelineDatasetDto
{
    public string Field { get; set; } = "";
    public string Section { get; set; } = "";
    public List<double?> Values { get; set; } = new();
}

public class DistributionDto
{
    public string Field { get; set; } = "";
    public string Section { get; set; } = "";
    public List<double> Values { get; set; } = new();
    public List<BucketDto> Buckets { get; set; } = new();
}

public class BucketDto
{
    public double Min { get; set; }
    public double Max { get; set; }
    public int Count { get; set; }
}

public class VisualizableFieldDto
{
    public string Key { get; set; } = "";
    public string Label { get; set; } = "";
    public string Type { get; set; } = "";
    public string Section { get; set; } = "";
}
