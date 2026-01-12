using eln.Backend.Application.Infrastructure;
using Microsoft.EntityFrameworkCore;

namespace eln.Backend.Tests;

public static class TestDbContextFactory
{
    public static ElnContext CreateInMemoryContext(string dbName = "TestDb")
    {
        var options = new DbContextOptionsBuilder<ElnContext>()
            .UseInMemoryDatabase(databaseName: dbName)
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;

        var context = new TestElnContext(options);
        context.Database.EnsureCreated();
        return context;
    }
}

// Custom context für Tests die JsonDocument ignoriert
public class TestElnContext : ElnContext
{
    public TestElnContext(DbContextOptions<ElnContext> options) : base(options)
    {
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Ignoriere JsonDocument Properties für InMemory DB
        modelBuilder.Entity<eln.Backend.Application.Model.Template>()
            .Ignore(t => t.Schema);

        modelBuilder.Entity<eln.Backend.Application.Model.Measurement>()
            .Ignore(m => m.Data);

        modelBuilder.Entity<eln.Backend.Application.Model.MeasurementHistory>()
            .Ignore(mh => mh.DataSnapshot);
            
        // Ignoriere Listen für InMemory DB (JSONB in PostgreSQL)
        modelBuilder.Entity<eln.Backend.Application.Model.SeriesShareLink>()
            .Ignore(ssl => ssl.AllowedUserEmails);
    }
}
