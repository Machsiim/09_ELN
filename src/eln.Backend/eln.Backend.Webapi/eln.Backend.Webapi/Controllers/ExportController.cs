using eln.Backend.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace eln.Backend.Webapi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class ExportController : ControllerBase
{
    private readonly ExportService _exportService;

    public ExportController(ExportService exportService)
    {
        _exportService = exportService;
    }

    /// <summary>
    /// Export all measurements in a series as Excel (.xlsx)
    /// </summary>
    [HttpGet("series/{seriesId:int}/excel")]
    public async Task<ActionResult> ExportSeriesExcel(int seriesId)
    {
        try
        {
            var bytes = await _exportService.ExportSeriesAsExcelAsync(seriesId);
            return File(bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                $"Messserie_{seriesId}.xlsx");
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Export all measurements in a series as CSV
    /// </summary>
    [HttpGet("series/{seriesId:int}/csv")]
    public async Task<ActionResult> ExportSeriesCsv(int seriesId)
    {
        try
        {
            var bytes = await _exportService.ExportSeriesAsCsvAsync(seriesId);
            return File(bytes, "text/csv", $"Messserie_{seriesId}.csv");
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Export a single measurement as CSV
    /// </summary>
    [HttpGet("measurements/{measurementId:int}/csv")]
    public async Task<ActionResult> ExportMeasurementCsv(int measurementId)
    {
        try
        {
            var bytes = await _exportService.ExportMeasurementAsCsvAsync(measurementId);
            return File(bytes, "text/csv", $"Messung_{measurementId}.csv");
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}
