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

    public void CreateDatabase(bool isDevelopment)
    {
        if (isDevelopment)
        {
            Database.EnsureDeleted();
            Database.EnsureCreated();
        }
        else
        {
            Database.Migrate();
        }
    }
}
