using System.ComponentModel.DataAnnotations;
using System.Security.Claims;
using System.Text.Json;
using eln.Backend.Application.Infrastructure;
using eln.Backend.Application.Model;
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

    public TemplatesController(ElnContext context)
    {
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<IEnumerable<TemplateResponse>>> GetTemplates(CancellationToken cancellationToken)
    {
        var templates = await _context.Templates
            .OrderBy(t => t.Name)
            .Select(t => new { t.Id, t.Name, t.Schema })
            .ToListAsync(cancellationToken);

        var response = templates
            .Select(t => new TemplateResponse(t.Id, t.Name, t.Schema.RootElement.GetRawText()));

        return Ok(response);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<TemplateResponse>> GetTemplate(int id, CancellationToken cancellationToken)
    {
        var template = await _context.Templates
            .Where(t => t.Id == id)
            .Select(t => new { t.Id, t.Name, t.Schema })
            .FirstOrDefaultAsync(cancellationToken);

        if (template is null)
        {
            return NotFound();
        }

        return Ok(new TemplateResponse(template.Id, template.Name, template.Schema.RootElement.GetRawText()));
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

        var response = new TemplateResponse(template.Id, template.Name, template.Schema.RootElement.GetRawText());
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

        return Ok(new TemplateResponse(template.Id, template.Name, template.Schema.RootElement.GetRawText()));
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

        return Ok(new TemplateResponse(template.Id, template.Name, template.Schema.RootElement.GetRawText()));
    }

    public record TemplateResponse(int Id, string Name, string Schema);

    public class SaveTemplateRequest
    {
        [Required]
        [StringLength(200)]
        public string Name { get; set; } = string.Empty;

        public JsonDocument? Schema { get; set; }
    }
}
