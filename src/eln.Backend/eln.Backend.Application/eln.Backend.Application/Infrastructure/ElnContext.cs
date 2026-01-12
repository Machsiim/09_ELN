using Microsoft.EntityFrameworkCore;
using eln.Backend.Application.Model;

namespace eln.Backend.Application.Infrastructure;

public class ElnContext : DbContext
{
    public ElnContext(DbContextOptions<ElnContext> options) : base(options)
    {
    }

    public DbSet<User> Users => Set<User>();
    public DbSet<Template> Templates => Set<Template>();
    public DbSet<MeasurementSeries> MeasurementSeries => Set<MeasurementSeries>();
    public DbSet<Measurement> Measurements => Set<Measurement>();
    public DbSet<MeasurementHistory> MeasurementHistories => Set<MeasurementHistory>();
    public DbSet<SeriesShareLink> SeriesShareLinks => Set<SeriesShareLink>();
    public DbSet<MeasurementImage> MeasurementImages => Set<MeasurementImage>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        foreach (var entity in modelBuilder.Model.GetEntityTypes())
        {
            // Tabellennamen in Snake Case
            entity.SetTableName(ToSnakeCase(entity.GetTableName()));

            // Spaltennamen in Snake Case
            foreach (var property in entity.GetProperties())
            {
                property.SetColumnName(ToSnakeCase(property.Name));
            }
        }

        // JSONB Konfiguration für PostgreSQL
        modelBuilder.Entity<Template>()
            .Property(t => t.Schema)
            .HasColumnType("jsonb");

        modelBuilder.Entity<Measurement>()
            .Property(m => m.Data)
            .HasColumnType("jsonb");

        modelBuilder.Entity<MeasurementHistory>()
            .Property(mh => mh.DataSnapshot)
            .HasColumnType("jsonb");

        // Relationships & Delete Behavior
        
        // User -> Templates
        modelBuilder.Entity<User>()
            .HasMany(u => u.Templates)
            .WithOne(t => t.Creator)
            .HasForeignKey(t => t.CreatedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // User -> MeasurementSeries
        modelBuilder.Entity<User>()
            .HasMany(u => u.MeasurementSeries)
            .WithOne(ms => ms.Creator)
            .HasForeignKey(ms => ms.CreatedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // User -> Measurements
        modelBuilder.Entity<User>()
            .HasMany(u => u.Measurements)
            .WithOne(m => m.Creator)
            .HasForeignKey(m => m.CreatedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // MeasurementSeries -> Measurements
        modelBuilder.Entity<MeasurementSeries>()
            .HasMany(ms => ms.Measurements)
            .WithOne(m => m.Series)
            .HasForeignKey(m => m.SeriesId)
            .OnDelete(DeleteBehavior.Cascade);

        // Template -> Measurements
        modelBuilder.Entity<Template>()
            .HasMany(t => t.Measurements)
            .WithOne(m => m.Template)
            .HasForeignKey(m => m.TemplateId)
            .OnDelete(DeleteBehavior.SetNull);

        // Measurement -> MeasurementHistory
        modelBuilder.Entity<Measurement>()
            .HasMany(m => m.History)
            .WithOne(mh => mh.Measurement)
            .HasForeignKey(mh => mh.MeasurementId)
            .OnDelete(DeleteBehavior.Cascade);

        // User -> MeasurementHistory
        modelBuilder.Entity<User>()
            .HasMany<MeasurementHistory>()
            .WithOne(mh => mh.Changer)
            .HasForeignKey(mh => mh.ChangedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // SeriesShareLink relationships
        modelBuilder.Entity<SeriesShareLink>()
            .HasOne(ssl => ssl.Series)
            .WithMany()
            .HasForeignKey(ssl => ssl.SeriesId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<SeriesShareLink>()
            .HasOne(ssl => ssl.Creator)
            .WithMany()
            .HasForeignKey(ssl => ssl.CreatedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // SeriesShareLink: Store AllowedUserEmails as JSONB
        modelBuilder.Entity<SeriesShareLink>()
            .Property(ssl => ssl.AllowedUserEmails)
            .HasColumnType("jsonb");

        // SeriesShareLink: Unique index on Token
        modelBuilder.Entity<SeriesShareLink>()
            .HasIndex(ssl => ssl.Token)
            .IsUnique();

        // MeasurementSeries -> Locker (User who locked)
        modelBuilder.Entity<MeasurementSeries>()
            .HasOne(ms => ms.Locker)
            .WithMany()
            .HasForeignKey(ms => ms.LockedBy)
            .OnDelete(DeleteBehavior.Restrict);

        // MeasurementImage -> Measurement
        modelBuilder.Entity<MeasurementImage>()
            .HasOne(mi => mi.Measurement)
            .WithMany()
            .HasForeignKey(mi => mi.MeasurementId)
            .OnDelete(DeleteBehavior.Cascade);

        // MeasurementImage -> User (Uploader)
        modelBuilder.Entity<MeasurementImage>()
            .HasOne(mi => mi.Uploader)
            .WithMany()
            .HasForeignKey(mi => mi.UploadedBy)
            .OnDelete(DeleteBehavior.Restrict);
    }

    private static string ToSnakeCase(string? name)
    {
        if (string.IsNullOrEmpty(name)) return name ?? string.Empty;
        
        return string.Concat(
            name.Select((x, i) => i > 0 && char.IsUpper(x) 
                ? "_" + x.ToString() 
                : x.ToString())
        ).ToLower();
    }

    /// <summary>
    /// Initialize the database.
    /// In Development: Uses EnsureCreated (no migrations needed for rapid development)
    /// In Production: Uses Migrate (requires EF migrations to be created)
    /// </summary>
    public void CreateDatabase(bool isDevelopment)
    {
        if (isDevelopment)
        {
            // In Development: Create database schema if it doesn't exist
            // NOTE: Does NOT delete existing data - just ensures schema exists
            Database.EnsureCreated();
        }
        else
        {
            // In Production: Apply any pending migrations
            Database.Migrate();
        }
    }
}
