using System;
using System.Collections.Generic;

namespace eln.Backend.Application.Model;

public class SeriesShareLink
{
    #pragma warning disable CS8618
    protected SeriesShareLink() { }
    #pragma warning restore CS8618

    public SeriesShareLink(
        int seriesId, 
        string token, 
        bool isPublic, 
        DateTime expiresAt, 
        int createdBy,
        List<string>? allowedUserEmails = null)
    {
        SeriesId = seriesId;
        Token = token;
        IsPublic = isPublic;
        ExpiresAt = expiresAt;
        CreatedBy = createdBy;
        AllowedUserEmails = allowedUserEmails ?? new List<string>();
        CreatedAt = DateTime.UtcNow;
        IsActive = true;
    }

    public int Id { get; set; }
    public int SeriesId { get; set; }
    public string Token { get; set; }
    
    // Access Control
    public bool IsPublic { get; set; }
    public List<string> AllowedUserEmails { get; set; } = new();
    
    // Expiration
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public bool IsActive { get; set; } = true;
    
    // Creator Info
    public int CreatedBy { get; set; }
    
    // Navigation Properties
    public MeasurementSeries? Series { get; set; }
    public User? Creator { get; set; }
}
