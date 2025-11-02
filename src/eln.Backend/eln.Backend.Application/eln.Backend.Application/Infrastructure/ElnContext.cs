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
    public DbSet<Animal> Animals => Set<Animal>();
    public DbSet<Lung> Lungs => Set<Lung>();
    public DbSet<MeasurementSeries> MeasurementSeries => Set<MeasurementSeries>();
    public DbSet<Measurement> Measurements => Set<Measurement>();
    public DbSet<Model.File> Files => Set<Model.File>();

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
        modelBuilder.Entity<User>()
            .HasMany(u => u.Animals)
            .WithOne(a => a.Creator)
            .HasForeignKey(a => a.CreatedBy)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<User>()
            .HasMany(u => u.MeasurementSeries)
            .WithOne(ms => ms.Creator)
            .HasForeignKey(ms => ms.CreatedBy)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<User>()
            .HasMany(u => u.Measurements)
            .WithOne(m => m.Creator)
            .HasForeignKey(m => m.CreatedBy)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<User>()
            .HasMany(u => u.Files)
            .WithOne(f => f.Owner)
            .HasForeignKey(f => f.OwnerId)
            .OnDelete(DeleteBehavior.Restrict);

        modelBuilder.Entity<Animal>()
            .HasMany(a => a.Lungs)
            .WithOne(l => l.Animal)
            .HasForeignKey(l => l.AnimalId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<Lung>()
            .HasMany(l => l.MeasurementSeries)
            .WithOne(ms => ms.Lung)
            .HasForeignKey(ms => ms.LungId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<MeasurementSeries>()
            .HasMany(ms => ms.Measurements)
            .WithOne(m => m.Series)
            .HasForeignKey(m => m.SeriesId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<MeasurementSeries>()
            .HasOne(ms => ms.File)
            .WithMany(f => f.MeasurementSeries)
            .HasForeignKey(ms => ms.FileId)
            .OnDelete(DeleteBehavior.SetNull);

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
