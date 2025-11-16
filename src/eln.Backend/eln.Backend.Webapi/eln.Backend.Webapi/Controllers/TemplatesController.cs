using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using eln.Backend.Application.Infrastructure;
using eln.Backend.Application.Model;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace eln.Backend.Webapi.Controllers;

[ApiController]
[Route("api/[controller]")]
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
            .Select(t => new TemplateResponse(t.Id, t.Name, t.Schema.RootElement.GetRawText()))
            .ToListAsync(cancellationToken);

        return Ok(templates);
    }

    [HttpGet("{id:int}")]
    public async Task<ActionResult<TemplateResponse>> GetTemplate(int id, CancellationToken cancellationToken)
    {
        var template = await _context.Templates
            .Where(t => t.Id == id)
            .Select(t => new TemplateResponse(t.Id, t.Name, t.Schema.RootElement.GetRawText()))
            .FirstOrDefaultAsync(cancellationToken);

        if (template is null)
        {
            return NotFound();
        }

        return Ok(template);
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
        
        // TODO: Replace hardcoded createdBy with actual user ID from authentication
        var template = new Template(request.Name, schema, createdBy: 1);
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

        var template = await _context.Templates.FirstOrDefaultAsync(t => t.Id == id, cancellationToken);
        if (template is null)
        {
            return NotFound();
        }

        template.Name = request.Name;
        template.Schema = request.Schema ?? JsonDocument.Parse("{}");

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
