using eln.Backend.Application.DTOs;
using eln.Backend.Application.Services;
using Microsoft.AspNetCore.Mvc;

namespace eln.Backend.Webapi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class MeasurementSeriesController : ControllerBase
{
    private readonly MeasurementSeriesService _seriesService;

    public MeasurementSeriesController(MeasurementSeriesService seriesService)
    {
        _seriesService = seriesService;
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
    public async Task<ActionResult<MeasurementSeriesResponseDto>> CreateSeries(
        [FromBody] CreateMeasurementSeriesDto dto)
    {
        try
        {
            // TODO: Get actual user ID from JWT token
            int userId = 1; // Placeholder

            var result = await _seriesService.CreateSeriesAsync(dto, userId);
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
    public async Task<ActionResult> DeleteSeries(int id)
    {
        try
        {
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
    public async Task<ActionResult<MeasurementSeriesResponseDto>> UpdateSeries(
        int id,
        [FromBody] UpdateMeasurementSeriesDto dto)
    {
        try
        {
            var result = await _seriesService.UpdateSeriesAsync(id, dto);
            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}