using eln.Backend.Application.DTOs;
using eln.Backend.Application.Services;
using Microsoft.AspNetCore.Mvc;

namespace eln.Backend.Webapi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class TemplateController : ControllerBase
{
    private readonly TemplateService _templateService;
    private readonly ILogger<TemplateController> _logger;

    public TemplateController(TemplateService templateService, ILogger<TemplateController> logger)
    {
        _templateService = templateService;
        _logger = logger;
    }

    /// <summary>
    /// Get all templates
    /// </summary>
    [HttpGet]
    public async Task<ActionResult<List<TemplateListDto>>> GetAllTemplates()
    {
        try
        {
            var templates = await _templateService.GetAllTemplatesAsync();
            return Ok(templates);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting all templates");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Get template by ID with full schema
    /// </summary>
    [HttpGet("{id}")]
    public async Task<ActionResult<TemplateResponseDto>> GetTemplateById(int id)
    {
        try
        {
            var template = await _templateService.GetTemplateByIdAsync(id);
            return Ok(template);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting template {TemplateId}", id);
            return NotFound(new { error = $"Template with ID {id} not found" });
        }
    }

    /// <summary>
    /// Create a new template
    /// </summary>
    [HttpPost]
    public async Task<ActionResult<TemplateResponseDto>> CreateTemplate([FromBody] CreateTemplateDto dto)
    {
        try
        {
            // TODO: Get user ID from JWT token
            int userId = 1; // Placeholder
            
            var template = await _templateService.CreateTemplateAsync(dto, userId);
            return CreatedAtAction(nameof(GetTemplateById), new { id = template.Id }, template);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating template");
            return BadRequest(new { error = ex.Message });
        }
    }

    /// <summary>
    /// Delete a template
    /// </summary>
    [HttpDelete("{id}")]
    public async Task<ActionResult> DeleteTemplate(int id)
    {
        try
        {
            await _templateService.DeleteTemplateAsync(id);
            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting template {TemplateId}", id);
            return NotFound(new { error = $"Template with ID {id} not found" });
        }
    }
}
