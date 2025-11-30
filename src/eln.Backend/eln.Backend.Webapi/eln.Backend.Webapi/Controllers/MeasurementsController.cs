using eln.Backend.Application.DTOs;
using eln.Backend.Application.Services;
using Microsoft.AspNetCore.Mvc;

namespace eln.Backend.Webapi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class MeasurementsController : ControllerBase
{
    private readonly MeasurementService _measurementService;

    public MeasurementsController(MeasurementService measurementService)
    {
        _measurementService = measurementService;
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
    /// </summary>
    [HttpGet("search")]
    public async Task<ActionResult<List<MeasurementListDto>>> SearchMeasurements(
        [FromQuery] int? templateId,
        [FromQuery] int? seriesId,
        [FromQuery] DateTime? dateFrom,
        [FromQuery] DateTime? dateTo,
        [FromQuery] string? searchText)
    {
        try
        {
            var filter = new MeasurementFilterDto
            {
                TemplateId = templateId,
                SeriesId = seriesId,
                DateFrom = dateFrom,
                DateTo = dateTo,
                SearchText = searchText
            };

            var results = await _measurementService.GetFilteredMeasurementsAsync(filter);
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
}
