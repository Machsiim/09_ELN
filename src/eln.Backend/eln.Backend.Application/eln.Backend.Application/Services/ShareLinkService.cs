using System;
using System.Text.Json;
using eln.Backend.Application.DTOs;
using eln.Backend.Application.Infrastructure;
using eln.Backend.Application.Model;
using Microsoft.EntityFrameworkCore;

namespace eln.Backend.Application.Services;

/// <summary>
/// Service for managing series share links
/// </summary>
public class ShareLinkService
{
    private readonly ElnContext _context;

    public ShareLinkService(ElnContext context)
    {
        _context = context;
    }

    /// <summary>
    /// Create a share link for a measurement series
    /// </summary>
    public async Task<ShareLinkResponseDto> CreateShareLinkAsync(
        int seriesId, 
        CreateShareLinkDto dto, 
        int userId)
    {
        // Verify series exists
        var series = await _context.MeasurementSeries.FindAsync(seriesId);
        if (series == null)
            throw new Exception($"MeasurementSeries with ID {seriesId} not found");

        // Generate unique token
        var token = Guid.NewGuid().ToString("N");

        // Calculate expiration
        var expiresAt = DateTime.UtcNow.AddDays(dto.ExpiresInDays);

        // Validate allowed emails if not public
        var allowedEmails = dto.IsPublic 
            ? new List<string>() 
            : dto.AllowedUserEmails ?? new List<string>();

        // Create share link
        var shareLink = new SeriesShareLink(
            seriesId: seriesId,
            token: token,
            isPublic: dto.IsPublic,
            expiresAt: expiresAt,
            createdBy: userId,
            allowedUserEmails: allowedEmails
        );

        _context.SeriesShareLinks.Add(shareLink);
        await _context.SaveChangesAsync();

        // Get creator username
        var creator = await _context.Users.FindAsync(userId);

        return new ShareLinkResponseDto
        {
            Id = shareLink.Id,
            Token = shareLink.Token,
            ShareUrl = $"/shared/{shareLink.Token}",
            IsPublic = shareLink.IsPublic,
            AllowedUserEmails = shareLink.AllowedUserEmails,
            CreatedAt = shareLink.CreatedAt,
            ExpiresAt = shareLink.ExpiresAt,
            IsActive = shareLink.IsActive,
            CreatedBy = shareLink.CreatedBy,
            CreatedByUsername = creator?.Username ?? "Unknown"
        };
    }

    /// <summary>
    /// Get shared series data by token (public endpoint)
    /// </summary>
    public async Task<SharedSeriesDto> GetSharedSeriesAsync(string token, string? requestingUserEmail = null)
    {
        var shareLink = await _context.SeriesShareLinks
            .Include(ssl => ssl.Series)
                .ThenInclude(s => s!.Measurements)
                    .ThenInclude(m => m.Template)
            .Include(ssl => ssl.Series)
                .ThenInclude(s => s!.Measurements)
                    .ThenInclude(m => m.Creator)
            .Include(ssl => ssl.Series)
                .ThenInclude(s => s!.Creator)
            .FirstOrDefaultAsync(ssl => ssl.Token == token);

        if (shareLink == null)
            throw new Exception("Share link not found");

        if (!shareLink.IsActive)
            throw new Exception("Share link has been disabled");

        if (shareLink.ExpiresAt < DateTime.UtcNow)
            throw new Exception("Share link has expired");

        // Access control for non-public links
        if (!shareLink.IsPublic)
        {
            if (string.IsNullOrEmpty(requestingUserEmail) || 
                !shareLink.AllowedUserEmails.Contains(requestingUserEmail))
            {
                throw new Exception("You don't have access to this shared series");
            }
        }

        var series = shareLink.Series!;

        // Convert measurements to read-only DTOs
        var measurements = series.Measurements.Select(m =>
        {
            var dataJson = m.Data.RootElement.GetRawText();
            var data = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, object?>>>(dataJson) 
                       ?? new();

            return new SharedMeasurementDto
            {
                Id = m.Id,
                TemplateName = m.Template?.Name ?? "Unknown",
                Data = data,
                CreatedAt = m.CreatedAt,
                CreatedByUsername = m.Creator?.Username ?? "Unknown"
            };
        }).ToList();

        return new SharedSeriesDto
        {
            SeriesId = series.Id,
            SeriesName = series.Name,
            SeriesDescription = series.Description,
            SeriesCreatedAt = series.CreatedAt,
            CreatedByUsername = series.Creator?.Username ?? "Unknown",
            ExpiresAt = shareLink.ExpiresAt,
            Measurements = measurements
        };
    }

    /// <summary>
    /// Get all share links for a series
    /// </summary>
    public async Task<List<ShareLinkResponseDto>> GetShareLinksForSeriesAsync(int seriesId)
    {
        var shareLinks = await _context.SeriesShareLinks
            .Include(ssl => ssl.Creator)
            .Where(ssl => ssl.SeriesId == seriesId)
            .OrderByDescending(ssl => ssl.CreatedAt)
            .ToListAsync();

        return shareLinks.Select(ssl => new ShareLinkResponseDto
        {
            Id = ssl.Id,
            Token = ssl.Token,
            ShareUrl = $"/shared/{ssl.Token}",
            IsPublic = ssl.IsPublic,
            AllowedUserEmails = ssl.AllowedUserEmails,
            CreatedAt = ssl.CreatedAt,
            ExpiresAt = ssl.ExpiresAt,
            IsActive = ssl.IsActive,
            CreatedBy = ssl.CreatedBy,
            CreatedByUsername = ssl.Creator?.Username ?? "Unknown"
        }).ToList();
    }

    /// <summary>
    /// Disable/Delete a share link
    /// </summary>
    public async Task DeleteShareLinkAsync(int shareId, int userId)
    {
        var shareLink = await _context.SeriesShareLinks.FindAsync(shareId);
        if (shareLink == null)
            throw new Exception($"Share link with ID {shareId} not found");

        if (shareLink.CreatedBy != userId)
            throw new Exception("You can only delete your own share links");

        _context.SeriesShareLinks.Remove(shareLink);
        await _context.SaveChangesAsync();
    }

    /// <summary>
    /// Deactivate a share link (soft delete)
    /// </summary>
    public async Task DeactivateShareLinkAsync(int shareId, int userId)
    {
        var shareLink = await _context.SeriesShareLinks.FindAsync(shareId);
        if (shareLink == null)
            throw new Exception($"Share link with ID {shareId} not found");

        if (shareLink.CreatedBy != userId)
            throw new Exception("You can only deactivate your own share links");

        shareLink.IsActive = false;
        await _context.SaveChangesAsync();
    }
}
