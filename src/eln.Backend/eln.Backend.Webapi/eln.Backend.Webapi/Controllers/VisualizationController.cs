using eln.Backend.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace eln.Backend.Webapi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class VisualizationController : ControllerBase
{
    private readonly VisualizationService _visualizationService;

    public VisualizationController(VisualizationService visualizationService)
    {
        _visualizationService = visualizationService;
    }

    [HttpGet("series/{seriesId:int}/timeline")]
    public async Task<ActionResult> GetTimeline(int seriesId)
    {
        var result = await _visualizationService.GetTimelineAsync(seriesId);
        return Ok(result);
    }

    [HttpGet("series/{seriesId:int}/distribution")]
    public async Task<ActionResult> GetDistribution(
        int seriesId,
        [FromQuery] string field,
        [FromQuery] string? section = null)
    {
        if (string.IsNullOrWhiteSpace(field))
            return BadRequest(new { error = "field Parameter ist erforderlich." });

        var result = await _visualizationService.GetDistributionAsync(seriesId, section ?? string.Empty, field);
        return Ok(result);
    }

    [HttpGet("series/{seriesId:int}/fields")]
    public async Task<ActionResult> GetFields(int seriesId)
    {
        var result = await _visualizationService.GetFieldsAsync(seriesId);
        return Ok(result);
    }
}
