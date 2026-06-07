using eln.Backend.Application.DTOs;
using eln.Backend.Application.Services;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace eln.Backend.Webapi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SharedController : ControllerBase
{
    private readonly ShareLinkService _shareLinkService;
    private readonly VisualizationService _visualizationService;

    public SharedController(
        ShareLinkService shareLinkService,
        VisualizationService visualizationService)
    {
        _shareLinkService = shareLinkService;
        _visualizationService = visualizationService;
    }

    /// <summary>
    /// Get shared series by token (PUBLIC endpoint - no auth required for public links)
    /// For private links, user must be authenticated and in allowed list
    /// </summary>
    [HttpGet("{token}")]
    public async Task<ActionResult<SharedSeriesDto>> GetSharedSeries(string token)
    {
        try
        {
            // Try to get user email from JWT (if authenticated)
            var userEmail = User.FindFirst(ClaimTypes.Name)?.Value;

            var result = await _shareLinkService.GetSharedSeriesAsync(token, userEmail);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Get visualizable fields for a shared series.
    /// Public links require only a valid token; private links additionally require an allowed user.
    /// </summary>
    [HttpGet("{token}/visualization/fields")]
    public async Task<ActionResult<List<VisualizableFieldDto>>> GetSharedFields(string token)
    {
        var seriesId = await AuthorizeShareAsync(token);
        var result = await _visualizationService.GetFieldsAsync(seriesId);
        return Ok(result);
    }

    /// <summary>
    /// Get timeline data for a shared series.
    /// </summary>
    [HttpGet("{token}/visualization/timeline")]
    public async Task<ActionResult<TimelineDto>> GetSharedTimeline(string token)
    {
        var seriesId = await AuthorizeShareAsync(token);
        var result = await _visualizationService.GetTimelineAsync(seriesId);
        return Ok(result);
    }

    /// <summary>
    /// Get distribution data for a shared series.
    /// </summary>
    [HttpGet("{token}/visualization/distribution")]
    public async Task<ActionResult<DistributionDto>> GetSharedDistribution(
        string token,
        [FromQuery] string field,
        [FromQuery] string? section = null,
        [FromQuery] int bins = 10)
    {
        if (string.IsNullOrWhiteSpace(field))
            return BadRequest(new { error = "field Parameter ist erforderlich." });

        var seriesId = await AuthorizeShareAsync(token);
        var result = await _visualizationService.GetDistributionAsync(
            seriesId,
            section ?? string.Empty,
            field,
            bins);
        return Ok(result);
    }

    private Task<int> AuthorizeShareAsync(string token)
    {
        var username = User.FindFirst(ClaimTypes.Name)?.Value;
        return _shareLinkService.GetAuthorizedSeriesIdAsync(token, username);
    }
}
