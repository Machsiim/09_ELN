using eln.Backend.Application.DTOs;
using eln.Backend.Application.Services;
using eln.Backend.Application.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace eln.Backend.Webapi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class MeasurementSeriesController : ControllerBase
{
    private readonly MeasurementSeriesService _seriesService;
    private readonly ElnContext _context;

    public MeasurementSeriesController(MeasurementSeriesService seriesService, ElnContext context)
    {
        _seriesService = seriesService;
        _context = context;
    }

    /// <summary>
    /// Get all measurement series
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<MeasurementSeriesResponseDto>>> GetAllSeries()
    {
        try
        {
            var results = await _seriesService.GetAllSeriesAsync();
            return Ok(results);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Get a single series by ID
    /// </summary>
    [HttpGet("{id:int}")]
    public async Task<ActionResult<MeasurementSeriesResponseDto>> GetSeries(int id)
    {
        try
        {
            var result = await _seriesService.GetSeriesByIdAsync(id);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Create a new measurement series
    /// </summary>
    [HttpPost]
    [Authorize]
    public async Task<ActionResult<MeasurementSeriesResponseDto>> CreateSeries(
        [FromBody] CreateMeasurementSeriesDto dto)
    {
        try
        {
            // Extract username from JWT
            var username = User.FindFirst(ClaimTypes.Name)?.Value;

            if (string.IsNullOrEmpty(username))
                return Unauthorized();

            // Get user ID from database
            var user = await _context.Users.SingleOrDefaultAsync(u => u.Username == username);
            if (user == null)
                return Unauthorized();

            var result = await _seriesService.CreateSeriesAsync(dto, user.Id);
            return CreatedAtAction(nameof(GetSeries), new { id = result.Id }, result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Delete a measurement series
    /// </summary>
    [HttpDelete("{id:int}")]
    [Authorize]
    public async Task<ActionResult> DeleteSeries(int id)
    {
        try
        {
            // Extract role from JWT
            var userRole = User.FindFirst(ClaimTypes.Role)?.Value ?? "Student";

            // Check if series is locked
            var series = await _context.MeasurementSeries.FindAsync(id);
            if (series == null)
                return NotFound(new { error = "Series not found" });

            if (series.IsLocked && userRole != "Staff")
                return BadRequest(new { error = "Cannot delete locked series. Only Staff can modify locked series." });

            await _seriesService.DeleteSeriesAsync(id);
            return NoContent();
        }
        catch (Exception ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Update an existing measurement series
    /// </summary>
    [HttpPut("{id:int}")]
    [Authorize]
    public async Task<ActionResult<MeasurementSeriesResponseDto>> UpdateSeries(
        int id,
        [FromBody] UpdateMeasurementSeriesDto dto)
    {
        try
        {
            // Extract role from JWT
            var userRole = User.FindFirst(ClaimTypes.Role)?.Value ?? "Student";

            // Check if series is locked
            var series = await _context.MeasurementSeries.FindAsync(id);
            if (series == null)
                return NotFound(new { error = "Series not found" });

            if (series.IsLocked && userRole != "Staff")
                return BadRequest(new { error = "Cannot update locked series. Only Staff can modify locked series." });

            var result = await _seriesService.UpdateSeriesAsync(id, dto);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Lock a measurement series (Staff only)
    /// Students cannot modify locked series, only Staff can unlock
    /// </summary>
    [HttpPut("{id:int}/lock")]
    [Authorize(Roles = "Staff")]
    public async Task<ActionResult<MeasurementSeriesResponseDto>> LockSeries(int id)
    {
        try
        {
            // Extract username from JWT
            var username = User.FindFirst(ClaimTypes.Name)?.Value;
            if (string.IsNullOrEmpty(username))
                return Unauthorized();

            // Get user ID from database
            var user = await _context.Users.SingleOrDefaultAsync(u => u.Username == username);
            if (user == null)
                return Unauthorized();

            var result = await _seriesService.LockSeriesAsync(id, user.Id);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Unlock a measurement series (Staff only)
    /// </summary>
    [HttpPut("{id:int}/unlock")]
    [Authorize(Roles = "Staff")]
    public async Task<ActionResult<MeasurementSeriesResponseDto>> UnlockSeries(int id)
    {
        try
        {
            var result = await _seriesService.UnlockSeriesAsync(id);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}