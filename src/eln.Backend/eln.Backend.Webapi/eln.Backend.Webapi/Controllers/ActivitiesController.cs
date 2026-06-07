using eln.Backend.Application.DTOs;
using eln.Backend.Application.Infrastructure;
using eln.Backend.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace eln.Backend.Webapi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ActivitiesController : ControllerBase
{
    private readonly ActivityService _activityService;
    private readonly ElnContext _context;

    public ActivitiesController(ActivityService activityService, ElnContext context)
    {
        _activityService = activityService;
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<PagedResultDto<ActivityDto>>> GetRecentActivities(
        [FromQuery] PaginationParams pagination,
        [FromQuery] string? type = null,
        [FromQuery] int? userId = null)
    {
        var currentUser = await GetCurrentUserAsync();
        if (currentUser is null)
            return Unauthorized();

        var isStaff = string.Equals(currentUser.Value.UserRole, "Staff", StringComparison.OrdinalIgnoreCase);

        // Staff may see all activities (optionally filtered by a specific user);
        // everyone else is restricted to their own activities.
        var effectiveUserId = isStaff ? userId : currentUser.Value.UserId;

        var result = await _activityService.GetRecentActivitiesAsync(pagination, type, effectiveUserId);
        return Ok(result);
    }

    private async Task<(int UserId, string UserRole)?> GetCurrentUserAsync()
    {
        var username = User.FindFirst(ClaimTypes.Name)?.Value;
        if (string.IsNullOrEmpty(username))
            return null;

        var user = await _context.Users.SingleOrDefaultAsync(u => u.Username == username);
        if (user == null)
            return null;

        var userRole = User.FindFirst(ClaimTypes.Role)?.Value ?? "Student";
        return (user.Id, userRole);
    }
}
