using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Text.Json;
using eln.Backend.Application.Infrastructure;
using eln.Backend.Application.Model;
using eln.Backend.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace eln.Backend.Webapi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class TemplatesController : ControllerBase
{
    private readonly ElnContext _context;
    private readonly ImportService _importService;

    public TemplatesController(ElnContext context, ImportService importService)
    {
        _context = context;
        _importService = importService;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<TemplateResponse>>> GetTemplates(CancellationToken cancellationToken)
    {
        var templates = await _context.Templates
            .OrderBy(t => t.Name)
            .Select(t => new { t.Id, t.Name, t.Schema, t.IsArchived, HasExistingMeasurements = t.Measurements.Any() })
            .ToListAsync(cancellationToken);

        var response = templates
            .Select(t => new TemplateResponse(t.Id, t.Name, t.Schema.RootElement.GetRawText(), t.IsArchived, t.HasExistingMeasurements));

        return Ok(response);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<TemplateResponse>> GetTemplate(int id, CancellationToken cancellationToken)
    {
        var template = await _context.Templates
            .Where(t => t.Id == id)
            .Select(t => new { t.Id, t.Name, t.Schema, t.IsArchived, HasExistingMeasurements = t.Measurements.Any() })
            .FirstOrDefaultAsync(cancellationToken);

        if (template is null)
        {
            return NotFound();
        }

        return Ok(new TemplateResponse(template.Id, template.Name, template.Schema.RootElement.GetRawText(), template.IsArchived, template.HasExistingMeasurements));
    }

    [HttpPost]
    public async Task<ActionResult<TemplateResponse>> CreateTemplate(
        [FromBody] SaveTemplateRequest request,
        CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var schema = request.Schema ?? JsonDocument.Parse("{}");

        // Get user ID from JWT claims
        var username = User.FindFirst(ClaimTypes.Name)?.Value;
        var user = await _context.Users.FirstOrDefaultAsync(u => u.Username == username, cancellationToken);
        if (user == null)
        {
            return Unauthorized(new { error = "User not found" });
        }

        var template = new Template(request.Name, schema, createdBy: user.Id);
        _context.Templates.Add(template);
        await _context.SaveChangesAsync(cancellationToken);

        var response = new TemplateResponse(template.Id, template.Name, template.Schema.RootElement.GetRawText(), template.IsArchived, false);
        return CreatedAtAction(nameof(GetTemplate), new { id = template.Id }, response);
    }

    [HttpPut("{id:int}")]
    public async Task<ActionResult<TemplateResponse>> UpdateTemplate(
        int id,
        [FromBody] SaveTemplateRequest request,
        CancellationToken cancellationToken)
    {
        if (!ModelState.IsValid)
        {
            return ValidationProblem(ModelState);
        }

        var template = await _context.Templates
            .Include(t => t.Measurements)
            .FirstOrDefaultAsync(t => t.Id == id, cancellationToken);
            
        if (template is null)
        {
            return NotFound();
        }

        // Check if template is archived
        if (template.IsArchived)
        {
            return BadRequest(new { message = "Cannot edit archived template." });
        }

        // Check if template has measurements
        if (template.Measurements.Any())
        {
            return BadRequest(new { message = "Cannot edit template that has measurements." });
        }

        template.Name = request.Name;
        template.Schema = request.Schema ?? JsonDocument.Parse("{}");

        await _context.SaveChangesAsync(cancellationToken);

        return Ok(new TemplateResponse(template.Id, template.Name, template.Schema.RootElement.GetRawText(), template.IsArchived, template.Measurements.Any()));
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult> DeleteTemplate(int id, CancellationToken cancellationToken)
    {
        var template = await _context.Templates
            .Include(t => t.Measurements)
            .FirstOrDefaultAsync(t => t.Id == id, cancellationToken);

        if (template is null)
        {
            return NotFound();
        }

        // Check if template has measurements
        if (template.Measurements.Any())
        {
            return BadRequest(new { message = "Cannot delete template with existing measurements. Archive it instead." });
        }

        _context.Templates.Remove(template);
        await _context.SaveChangesAsync(cancellationToken);

        return NoContent();
    }

    [HttpPut("{id:int}/archive")]
    public async Task<ActionResult<TemplateResponse>> ArchiveTemplate(int id, CancellationToken cancellationToken)
    {
        var template = await _context.Templates.FirstOrDefaultAsync(t => t.Id == id, cancellationToken);

        if (template is null)
        {
            return NotFound();
        }

        template.IsArchived = true;
        await _context.SaveChangesAsync(cancellationToken);

        return Ok(new TemplateResponse(template.Id, template.Name, template.Schema.RootElement.GetRawText(), template.IsArchived, true));
    }

    /// <summary>
    /// Generate a sample Excel file with headers matching the template schema
    /// </summary>
    [HttpGet("{id:int}/sample-excel")]
    [AllowAnonymous]
    public async Task<ActionResult> GetSampleExcel(int id, CancellationToken cancellationToken)
    {
        try
        {
            var template = await _context.Templates.FirstOrDefaultAsync(t => t.Id == id, cancellationToken);
            if (template == null)
                return NotFound(new { error = "Template nicht gefunden." });

            var bytes = await _importService.GenerateSampleExcelAsync(template.Schema, template.Name);
            var fileName = $"Vorlage_{template.Name.Replace("\"", "").Replace("/", "_")}.xlsx";

            return File(bytes,
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                fileName);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    public record TemplateResponse(int Id, string Name, string Schema, bool IsArchived, bool HasExistingMeasurements);

    public class SaveTemplateRequest
    {
        [Required]
        [StringLength(200)]
        public string Name { get; set; } = string.Empty;

        public JsonDocument? Schema { get; set; }
    }
}
