using eln.Backend.Application.DTOs;
using eln.Backend.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace eln.Backend.Webapi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ActivitiesController : ControllerBase
{
    private readonly ActivityService _activityService;

    public ActivitiesController(ActivityService activityService)
    {
        _activityService = activityService;
    }

    [HttpGet]
    public async Task<ActionResult<PagedResultDto<ActivityDto>>> GetRecentActivities(
        [FromQuery] PaginationParams pagination,
        [FromQuery] string? type = null,
        [FromQuery] int? userId = null)
    {
        var result = await _activityService.GetRecentActivitiesAsync(pagination, type, userId);
        return Ok(result);
    }
}
