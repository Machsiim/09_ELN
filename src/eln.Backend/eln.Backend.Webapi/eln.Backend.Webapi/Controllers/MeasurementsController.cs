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
    public async Task<ActionResult<MeasurementResponseDto>> CreateMeasurement(
        [FromBody] CreateMeasurementDto dto,
        CancellationToken cancellationToken)
    {
        try
        {
            // TODO: Get actual user ID from JWT token
            int userId = 1; // Placeholder
            
            var result = await _measurementService.CreateMeasurementAsync(dto, userId);
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
    public async Task<ActionResult<MeasurementResponseDto>> GetMeasurement(int id)
    {
        try
        {
            var result = await _measurementService.GetMeasurementByIdAsync(id);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return NotFound(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Get all measurements for a specific series
    /// </summary>
    [HttpGet("series/{seriesId:int}")]
    public async Task<ActionResult<List<MeasurementListDto>>> GetMeasurementsBySeries(int seriesId)
    {
        try
        {
            var results = await _measurementService.GetMeasurementsBySeriesAsync(seriesId);
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
            // Extract username and role from JWT
            var username = User.FindFirst(ClaimTypes.Name)?.Value;
            var userRole = User.FindFirst(ClaimTypes.Role)?.Value ?? "Student";

            if (string.IsNullOrEmpty(username))
                return Unauthorized();

            // Get user ID from database
            var user = await _context.Users.SingleOrDefaultAsync(u => u.Username == username);
            if (user == null)
                return Unauthorized();

            var filter = new MeasurementFilterDto
            {
                TemplateId = templateId,
                SeriesId = seriesId,
                DateFrom = dateFrom,
                DateTo = dateTo,
                SearchText = searchText
            };

            var results = await _measurementService.GetFilteredMeasurementsAsync(filter, user.Id, userRole);
            return Ok(results);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Delete a measurement
    /// </summary>
    [HttpDelete("{id:int}")]
    public async Task<ActionResult> DeleteMeasurement(int id)
    {
        try
        {
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
    /// </summary>
    [HttpPut("{id:int}")]
    public async Task<ActionResult<MeasurementResponseDto>> UpdateMeasurement(
        int id,
        [FromBody] UpdateMeasurementDto dto)
    {
        try
        {
            // TODO: Get actual user ID from JWT token
            int userId = 1; // Placeholder
            
            var result = await _measurementService.UpdateMeasurementAsync(id, dto, userId);
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
    public async Task<ActionResult<List<MeasurementHistoryDto>>> GetMeasurementHistory(int id)
    {
        try
        {
            var history = await _measurementService.GetMeasurementHistoryAsync(id);
            return Ok(history);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}