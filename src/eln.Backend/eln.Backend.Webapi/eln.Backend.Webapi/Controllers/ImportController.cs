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
[Authorize]
[Consumes("multipart/form-data")]
public class ImportController : ControllerBase
{
    private readonly ImportService _importService;
    private readonly ElnContext _context;

    public ImportController(ImportService importService, ElnContext context)
    {
        _importService = importService;
        _context = context;
    }

    /// <summary>
    /// Batch import measurements from an Excel file
    /// </summary>
    [HttpPost("excel")]
    public async Task<ActionResult<ImportResponseDto>> ImportExcel(
        IFormFile file,
        [FromForm] int templateId,
        [FromForm] int? seriesId = null,
        [FromForm] string? seriesName = null,
        [FromForm] string? seriesDescription = null,
        [FromForm] string? columnMapping = null)
    {
        try
        {
            var userId = await GetUserId();
            if (userId == null) return Unauthorized();

            if (file == null || file.Length == 0)
                return BadRequest(new { error = "Keine Datei hochgeladen." });

            var ext = Path.GetExtension(file.FileName).ToLower();
            if (ext != ".xlsx" && ext != ".xls")
                return BadRequest(new { error = "Nur Excel-Dateien (.xlsx, .xls) werden akzeptiert." });

            await using var stream = file.OpenReadStream();
            var result = await _importService.ImportExcelAsync(
                stream, file.FileName, templateId, userId.Value,
                seriesId, seriesName, seriesDescription, columnMapping);

            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Batch import measurements from a CSV file
    /// </summary>
    [HttpPost("csv")]
    public async Task<ActionResult<ImportResponseDto>> ImportCsv(
        IFormFile file,
        [FromForm] int templateId,
        [FromForm] int? seriesId = null,
        [FromForm] string? seriesName = null,
        [FromForm] string? seriesDescription = null,
        [FromForm] string? columnMapping = null)
    {
        try
        {
            var userId = await GetUserId();
            if (userId == null) return Unauthorized();

            if (file == null || file.Length == 0)
                return BadRequest(new { error = "Keine Datei hochgeladen." });

            var ext = Path.GetExtension(file.FileName).ToLower();
            if (ext != ".csv")
                return BadRequest(new { error = "Nur CSV-Dateien (.csv) werden akzeptiert." });

            await using var stream = file.OpenReadStream();
            var result = await _importService.ImportCsvAsync(
                stream, file.FileName, templateId, userId.Value,
                seriesId, seriesName, seriesDescription, columnMapping);

            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    private async Task<int?> GetUserId()
    {
        var username = User.FindFirst(ClaimTypes.Name)?.Value;
        if (string.IsNullOrEmpty(username)) return null;
        var user = await _context.Users.SingleOrDefaultAsync(u => u.Username == username);
        return user?.Id;
    }
}
