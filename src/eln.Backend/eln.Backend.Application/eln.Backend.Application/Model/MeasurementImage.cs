namespace eln.Backend.Application.Model;

public class MeasurementImage
{
    #pragma warning disable CS8618
    protected MeasurementImage() { }
    #pragma warning restore CS8618

    public MeasurementImage(int measurementId, string fileName, string originalFileName, string contentType, long fileSize, int uploadedBy)
    {
        MeasurementId = measurementId;
        FileName = fileName;
        OriginalFileName = originalFileName;
        ContentType = contentType;
        FileSize = fileSize;
        UploadedBy = uploadedBy;
        UploadedAt = DateTime.UtcNow;
    }

    public int Id { get; set; }
    public int MeasurementId { get; set; }
    public string FileName { get; set; }  // Unique filename on disk (GUID-based)
    public string OriginalFileName { get; set; }  // Original filename from upload
    public string ContentType { get; set; }  // e.g. "image/jpeg"
    public long FileSize { get; set; }  // Size in bytes
    public int UploadedBy { get; set; }
    public DateTime UploadedAt { get; set; }

    // Navigation Properties
    public Measurement? Measurement { get; set; }
    public User? Uploader { get; set; }
}
