using System.Security.Claims;
using eln.Backend.Application.DTOs;
using eln.Backend.Application.Infrastructure;
using eln.Backend.Application.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace eln.Backend.Webapi.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class MappingProfilesController : ControllerBase
{
    private readonly MappingProfileService _service;
    private readonly ElnContext _context;

    public MappingProfilesController(MappingProfileService service, ElnContext context)
    {
        _service = service;
        _context = context;
    }

    [HttpGet]
    public async Task<ActionResult<List<MappingProfileResponseDto>>> GetByTemplate(
        [FromQuery] int templateId)
    {
        var userId = await GetUserId();
        if (userId == null) return Unauthorized();

        var profiles = await _service.GetByTemplateAsync(templateId, userId.Value);
        return Ok(profiles);
    }

    [HttpPost]
    public async Task<ActionResult<MappingProfileResponseDto>> Create(
        [FromBody] CreateMappingProfileDto dto)
    {
        var userId = await GetUserId();
        if (userId == null) return Unauthorized();

        var result = await _service.CreateAsync(dto, userId.Value);
        return CreatedAtAction(nameof(GetByTemplate), new { templateId = result.TemplateId }, result);
    }

    [HttpDelete("{id:int}")]
    public async Task<ActionResult> Delete(int id)
    {
        var userId = await GetUserId();
        if (userId == null) return Unauthorized();

        var deleted = await _service.DeleteAsync(id, userId.Value);
        if (!deleted) return NotFound();

        return NoContent();
    }

    private async Task<int?> GetUserId()
    {
        var username = User.FindFirst(ClaimTypes.Name)?.Value;
        if (string.IsNullOrEmpty(username)) return null;
        var user = await _context.Users.SingleOrDefaultAsync(u => u.Username == username);
        return user?.Id;
    }
}
