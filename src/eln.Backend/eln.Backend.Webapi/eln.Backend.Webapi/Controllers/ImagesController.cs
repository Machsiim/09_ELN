using eln.Backend.Application.Model;
using eln.Backend.Application.Infrastructure;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

namespace eln.Backend.Webapi.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ImagesController : ControllerBase
{
    private readonly ElnContext _context;
    private readonly IWebHostEnvironment _environment;
    private readonly ILogger<ImagesController> _logger;
    private readonly string _uploadPath;

    private static readonly string[] AllowedExtensions = { ".jpg", ".jpeg", ".png", ".gif", ".webp" };
    private static readonly string[] AllowedContentTypes = { "image/jpeg", "image/png", "image/gif", "image/webp" };
    private const long MaxFileSize = 10 * 1024 * 1024; // 10 MB

    public ImagesController(
        ElnContext context,
        IWebHostEnvironment environment,
        ILogger<ImagesController> logger)
    {
        _context = context;
        _environment = environment;
        _logger = logger;

        // Use /app/uploads in Docker, or local folder in development
        _uploadPath = Environment.GetEnvironmentVariable("ELN_UPLOAD_PATH")
            ?? Path.Combine(Directory.GetCurrentDirectory(), "uploads");

        // Ensure upload directory exists
        if (!Directory.Exists(_uploadPath))
        {
            Directory.CreateDirectory(_uploadPath);
        }
    }

    /// <summary>
    /// Upload an image for a measurement
    /// POST /api/images/measurement/{measurementId}
    /// </summary>
    [HttpPost("measurement/{measurementId:int}")]
    [Authorize]
    [RequestSizeLimit(MaxFileSize)]
    public async Task<ActionResult<ImageResponseDto>> UploadImage(int measurementId, IFormFile file)
    {
        try
        {
            // Validate file
            if (file == null || file.Length == 0)
                return BadRequest(new { error = "No file uploaded" });

            if (file.Length > MaxFileSize)
                return BadRequest(new { error = $"File too large. Maximum size is {MaxFileSize / 1024 / 1024} MB" });

            var extension = Path.GetExtension(file.FileName).ToLowerInvariant();
            if (!AllowedExtensions.Contains(extension))
                return BadRequest(new { error = $"Invalid file type. Allowed: {string.Join(", ", AllowedExtensions)}" });

            if (!AllowedContentTypes.Contains(file.ContentType))
                return BadRequest(new { error = "Invalid content type" });

            // Verify measurement exists
            var measurement = await _context.Measurements.FindAsync(measurementId);
            if (measurement == null)
                return NotFound(new { error = "Measurement not found" });

            // Check if series is locked
            var series = await _context.MeasurementSeries.FindAsync(measurement.SeriesId);
            if (series?.IsLocked == true)
            {
                var userRole = User.FindFirst(ClaimTypes.Role)?.Value ?? "Student";
                if (userRole != "Staff")
                    return BadRequest(new { error = "Cannot upload images to locked series" });
            }

            // Get user ID
            var username = User.FindFirst(ClaimTypes.Name)?.Value;
            if (string.IsNullOrEmpty(username))
                return Unauthorized();

            var user = await _context.Users.SingleOrDefaultAsync(u => u.Username == username);
            if (user == null)
                return Unauthorized();

            // Generate unique filename
            var uniqueFileName = $"{Guid.NewGuid()}{extension}";
            var filePath = Path.Combine(_uploadPath, uniqueFileName);

            // Save file to disk
            using (var stream = new FileStream(filePath, FileMode.Create))
            {
                await file.CopyToAsync(stream);
            }

            // Create database record
            var image = new MeasurementImage(
                measurementId: measurementId,
                fileName: uniqueFileName,
                originalFileName: file.FileName,
                contentType: file.ContentType,
                fileSize: file.Length,
                uploadedBy: user.Id
            );

            _context.MeasurementImages.Add(image);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Image uploaded: {FileName} for measurement {MeasurementId}", uniqueFileName, measurementId);

            return Ok(ToDto(image, user.Username));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error uploading image for measurement {MeasurementId}", measurementId);
            return StatusCode(500, new { error = "Failed to upload image" });
        }
    }

    /// <summary>
    /// Get all images for a measurement
    /// GET /api/images/measurement/{measurementId}
    /// </summary>
    [HttpGet("measurement/{measurementId:int}")]
    public async Task<ActionResult<List<ImageResponseDto>>> GetImagesForMeasurement(int measurementId)
    {
        try
        {
            var images = await _context.MeasurementImages
                .Where(i => i.MeasurementId == measurementId)
                .Include(i => i.Uploader)
                .OrderByDescending(i => i.UploadedAt)
                .ToListAsync();

            return Ok(images.Select(i => ToDto(i, i.Uploader?.Username ?? "Unknown")));
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting images for measurement {MeasurementId}", measurementId);
            return StatusCode(500, new { error = "Failed to get images" });
        }
    }

    /// <summary>
    /// Get image file by ID
    /// GET /api/images/{id}
    /// </summary>
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetImage(int id)
    {
        try
        {
            var image = await _context.MeasurementImages.FindAsync(id);
            if (image == null)
                return NotFound(new { error = "Image not found" });

            var filePath = Path.Combine(_uploadPath, image.FileName);
            if (!System.IO.File.Exists(filePath))
            {
                _logger.LogWarning("Image file not found on disk: {FileName}", image.FileName);
                return NotFound(new { error = "Image file not found" });
            }

            var fileStream = new FileStream(filePath, FileMode.Open, FileAccess.Read);
            return File(fileStream, image.ContentType, image.OriginalFileName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting image {ImageId}", id);
            return StatusCode(500, new { error = "Failed to get image" });
        }
    }

    /// <summary>
    /// Delete an image
    /// DELETE /api/images/{id}
    /// </summary>
    [HttpDelete("{id:int}")]
    [Authorize]
    public async Task<ActionResult> DeleteImage(int id)
    {
        try
        {
            var image = await _context.MeasurementImages
                .Include(i => i.Measurement)
                .FirstOrDefaultAsync(i => i.Id == id);

            if (image == null)
                return NotFound(new { error = "Image not found" });

            // Check if series is locked
            if (image.Measurement != null)
            {
                var series = await _context.MeasurementSeries.FindAsync(image.Measurement.SeriesId);
                if (series?.IsLocked == true)
                {
                    var userRole = User.FindFirst(ClaimTypes.Role)?.Value ?? "Student";
                    if (userRole != "Staff")
                        return BadRequest(new { error = "Cannot delete images from locked series" });
                }
            }

            // Delete file from disk
            var filePath = Path.Combine(_uploadPath, image.FileName);
            if (System.IO.File.Exists(filePath))
            {
                System.IO.File.Delete(filePath);
            }

            // Remove from database
            _context.MeasurementImages.Remove(image);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Image deleted: {ImageId}", id);

            return NoContent();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting image {ImageId}", id);
            return StatusCode(500, new { error = "Failed to delete image" });
        }
    }

    private static ImageResponseDto ToDto(MeasurementImage image, string uploaderUsername) => new()
    {
        Id = image.Id,
        MeasurementId = image.MeasurementId,
        OriginalFileName = image.OriginalFileName,
        ContentType = image.ContentType,
        FileSize = image.FileSize,
        UploadedBy = image.UploadedBy,
        UploadedByUsername = uploaderUsername,
        UploadedAt = image.UploadedAt,
        Url = $"/api/images/{image.Id}"
    };
}

public class ImageResponseDto
{
    public int Id { get; set; }
    public int MeasurementId { get; set; }
    public string OriginalFileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long FileSize { get; set; }
    public int UploadedBy { get; set; }
    public string UploadedByUsername { get; set; } = string.Empty;
    public DateTime UploadedAt { get; set; }
    public string Url { get; set; } = string.Empty;
}
