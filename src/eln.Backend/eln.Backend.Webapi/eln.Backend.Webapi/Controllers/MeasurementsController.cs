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
public class MeasurementsController : ControllerBase
{
    private readonly MeasurementService _measurementService;
    private readonly ElnContext _context;

    public MeasurementsController(MeasurementService measurementService, ElnContext context)
    {
        _measurementService = measurementService;
        _context = context;
    }

    /// <summary>
    /// Create a new measurement with template assignment
    /// </summary>
    [HttpPost]
    [Authorize]
    public async Task<ActionResult<MeasurementResponseDto>> CreateMeasurement(
        [FromBody] CreateMeasurementDto dto,
        CancellationToken cancellationToken)
    {
        try
        {
            // Extract username and role from JWT
            var username = User.FindFirst(ClaimTypes.Name)?.Value;
            var userRole = User.FindFirst(ClaimTypes.Role)?.Value ?? "Student";

            if (string.IsNullOrEmpty(username))
                return Unauthorized();

            // Get user ID from database
            var user = await _context.Users.SingleOrDefaultAsync(u => u.Username == username);
            if (user == null)
                return Unauthorized();

            // Check if series is locked
            var series = await _context.MeasurementSeries.FindAsync(dto.SeriesId);
            if (series == null)
                return BadRequest(new { error = "Series not found" });

            if (series.IsLocked && userRole != "Staff")
                return BadRequest(new { error = "Cannot add measurements to locked series. Only Staff can modify locked series." });
            
            var result = await _measurementService.CreateMeasurementAsync(dto, user.Id);
            return CreatedAtAction(nameof(GetMeasurement), new { id = result.Id }, result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Get a single measurement by ID
    /// </summary>
    [HttpGet("{id:int}")]
    [Authorize]
    public async Task<ActionResult<MeasurementResponseDto>> GetMeasurement(int id)
    {
        try
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null)
                return Unauthorized();

            var result = await _measurementService.GetMeasurementByIdAsync(id);
            if (IsStudent(currentUser.Value.UserRole) && result.CreatedBy != currentUser.Value.UserId)
                return Forbid();

            return Ok(result);
        }
        catch (Exception ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Get all measurements for a specific series with optional server-side search.
    /// </summary>
    /// <param name="seriesId">Measurement series ID.</param>
    /// <param name="searchText">Optional search text for measurement ID, template, creator, date, fields, sections, and values.</param>
    [HttpGet("series/{seriesId:int}")]
    [Authorize]
    public async Task<ActionResult<List<MeasurementResponseDto>>> GetMeasurementsBySeries(
        int seriesId,
        [FromQuery] string? searchText)
    {
        try
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null)
                return Unauthorized();

            var results = await _measurementService.GetMeasurementsBySeriesAsync(
                seriesId,
                currentUser.Value.UserId,
                currentUser.Value.UserRole,
                searchText);
            return Ok(results);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Search and filter measurements
    /// GET /api/measurements/search?templateId=1&dateFrom=2024-01-01&searchText=temp
    /// RBAC: Students see only their own, Staff see all
    /// </summary>
    [HttpGet("search")]
    [Authorize] // Requires JWT Token
    public async Task<ActionResult<List<MeasurementListDto>>> SearchMeasurements(
        [FromQuery] int? templateId,
        [FromQuery] int? seriesId,
        [FromQuery] DateTime? dateFrom,
        [FromQuery] DateTime? dateTo,
        [FromQuery] string? searchText)
    {
        try
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null)
                return Unauthorized();

            var filter = new MeasurementFilterDto
            {
                TemplateId = templateId,
                SeriesId = seriesId,
                DateFrom = dateFrom,
                DateTo = dateTo,
                SearchText = searchText
            };

            var results = await _measurementService.GetFilteredMeasurementsAsync(
                filter,
                currentUser.Value.UserId,
                currentUser.Value.UserRole);
            return Ok(results);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Delete a measurement
    /// Students can only delete their own measurements
    /// </summary>
    [HttpDelete("{id:int}")]
    [Authorize]
    public async Task<ActionResult> DeleteMeasurement(int id)
    {
        try
        {
            // Extract username and role from JWT
            var username = User.FindFirst(ClaimTypes.Name)?.Value;
            var userRole = User.FindFirst(ClaimTypes.Role)?.Value ?? "Student";

            if (string.IsNullOrEmpty(username))
                return Unauthorized();

            // Get user ID from database
            var user = await _context.Users.SingleOrDefaultAsync(u => u.Username == username);
            if (user == null)
                return Unauthorized();

            // Get measurement to check ownership and series lock status
            var measurement = await _context.Measurements
                .Include(m => m.Series)
                .FirstOrDefaultAsync(m => m.Id == id);
                
            if (measurement == null)
                return NotFound(new { error = "Measurement not found" });

            // Check if series is locked
            if (measurement.Series != null && measurement.Series.IsLocked && userRole != "Staff")
                return BadRequest(new { error = "Cannot delete measurements from locked series. Only Staff can modify locked series." });

            // Students can only delete their own measurements
            if (userRole == "Student" && measurement.CreatedBy != user.Id)
                return Forbid();

            await _measurementService.DeleteMeasurementAsync(id);
            return NoContent();
        }
        catch (Exception ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }


    /// <summary>
    /// Update an existing measurement
    /// Students can only update their own measurements
    /// </summary>
    [HttpPut("{id:int}")]
    [Authorize]
    public async Task<ActionResult<MeasurementResponseDto>> UpdateMeasurement(
        int id,
        [FromBody] UpdateMeasurementDto dto)
    {
        try
        {
            // Extract username and role from JWT
            var username = User.FindFirst(ClaimTypes.Name)?.Value;
            var userRole = User.FindFirst(ClaimTypes.Role)?.Value ?? "Student";

            if (string.IsNullOrEmpty(username))
                return Unauthorized();

            // Get user ID from database
            var user = await _context.Users.SingleOrDefaultAsync(u => u.Username == username);
            if (user == null)
                return Unauthorized();

            // Get measurement to check ownership and series lock status
            var measurement = await _context.Measurements
                .Include(m => m.Series)
                .FirstOrDefaultAsync(m => m.Id == id);
                
            if (measurement == null)
                return NotFound(new { error = "Measurement not found" });

            // Check if series is locked
            if (measurement.Series != null && measurement.Series.IsLocked && userRole != "Staff")
                return BadRequest(new { error = "Cannot modify measurements in locked series. Only Staff can modify locked series." });

            // Students can only update their own measurements
            if (userRole == "Student" && measurement.CreatedBy != user.Id)
                return Forbid();
            
            var result = await _measurementService.UpdateMeasurementAsync(id, dto, user.Id);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Get history of changes for a measurement
    /// </summary>
    [HttpGet("{id:int}/history")]
    [Authorize]
    public async Task<ActionResult<List<MeasurementHistoryDto>>> GetMeasurementHistory(int id)
    {
        try
        {
            var currentUser = await GetCurrentUserAsync();
            if (currentUser is null)
                return Unauthorized();

            var measurement = await _measurementService.GetMeasurementByIdAsync(id);
            if (IsStudent(currentUser.Value.UserRole) && measurement.CreatedBy != currentUser.Value.UserId)
                return Forbid();

            var history = await _measurementService.GetMeasurementHistoryAsync(id);
            return Ok(history);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
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

    private static bool IsStudent(string? userRole) =>
        string.Equals(userRole, "Student", StringComparison.OrdinalIgnoreCase);
}
