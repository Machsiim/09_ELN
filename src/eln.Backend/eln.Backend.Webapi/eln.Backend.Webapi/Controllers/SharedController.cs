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

    public SharedController(ShareLinkService shareLinkService)
    {
        _shareLinkService = shareLinkService;
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
}
