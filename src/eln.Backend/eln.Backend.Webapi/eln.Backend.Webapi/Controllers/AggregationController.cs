using eln.Backend.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace eln.Backend.Webapi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AggregationController : ControllerBase
{
    private readonly AggregationService _aggregationService;

    public AggregationController(AggregationService aggregationService)
    {
        _aggregationService = aggregationService;
    }

    [HttpGet("series/{seriesId:int}/summary")]
    public async Task<ActionResult> GetSeriesSummary(int seriesId)
    {
        var result = await _aggregationService.GetSeriesSummaryAsync(seriesId);
        return Ok(result);
    }

    [HttpGet("series/{seriesId:int}/grouped")]
    public async Task<ActionResult> GetGroupedAggregation(int seriesId, [FromQuery] string groupBy)
    {
        if (string.IsNullOrWhiteSpace(groupBy))
            return BadRequest(new { error = "groupBy Parameter ist erforderlich." });

        var result = await _aggregationService.GetGroupedAggregationAsync(seriesId, groupBy);
        return Ok(result);
    }
}
