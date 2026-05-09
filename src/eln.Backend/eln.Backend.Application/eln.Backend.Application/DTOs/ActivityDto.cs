namespace eln.Backend.Application.DTOs;

public class ActivityDto
{
    public string Type { get; set; } = "";
    public string Description { get; set; } = "";
    public DateTime Timestamp { get; set; }
    public string Username { get; set; } = "";
    public int? UserId { get; set; }
    public int? EntityId { get; set; }
    public string? EntityType { get; set; }
    public int? SeriesId { get; set; }
    public string? SeriesName { get; set; }
}
