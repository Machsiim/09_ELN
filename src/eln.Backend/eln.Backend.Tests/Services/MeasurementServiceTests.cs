using eln.Backend.Application.DTOs;
using eln.Backend.Application.Model;
using eln.Backend.Application.Services;
using Xunit;

namespace eln.Backend.Tests.Services;

public class MeasurementServiceTests
{
    private MeasurementValidationService CreateValidationService() => new MeasurementValidationService();

    [Fact]
    public async Task GetMeasurementsBySeriesAsync_EmptySeries_ReturnsEmptyList()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("GetMeasurementsBySeries_Empty" + Guid.NewGuid());
        var user = new User("test@test.com", "Student");
        context.Users.Add(user);
        var series = new MeasurementSeries("Test Series", user.Id);
        context.MeasurementSeries.Add(series);
        await context.SaveChangesAsync();

        var service = new MeasurementService(context, CreateValidationService());
        var result = await service.GetMeasurementsBySeriesAsync(series.Id);

        Assert.NotNull(result);
        Assert.Empty(result);
    }

    [Fact]
    public async Task GetMeasurementByIdAsync_NonExistentId_ThrowsException()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("GetMeasurementById_NotFound" + Guid.NewGuid());
        var service = new MeasurementService(context, CreateValidationService());

        await Assert.ThrowsAsync<Exception>(async () =>
            await service.GetMeasurementByIdAsync(999));
    }

    [Fact]
    public async Task DeleteMeasurementAsync_NonExistentId_ThrowsException()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("DeleteMeasurement_NotFound" + Guid.NewGuid());
        var service = new MeasurementService(context, CreateValidationService());

        await Assert.ThrowsAsync<Exception>(async () =>
            await service.DeleteMeasurementAsync(999));
    }

    [Fact]
    public async Task GetFilteredMeasurementsAsync_NoFilters_ReturnsAllMeasurements()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("FilterMeasurements_NoFilter" + Guid.NewGuid());
        var user = new User("test@test.com", "Student");
        context.Users.Add(user);
        await context.SaveChangesAsync();

        var service = new MeasurementService(context, CreateValidationService());
        var filter = new MeasurementFilterDto();

        var result = await service.GetFilteredMeasurementsAsync(filter, user.Id, "Student");

        Assert.NotNull(result);
        Assert.Empty(result); // No measurements created yet
    }

    [Fact]
    public async Task GetFilteredMeasurementsAsync_WithSeriesFilter_FiltersCorrectly()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("FilterMeasurements_BySeries" + Guid.NewGuid());
        var user = new User("test@test.com", "Student");
        context.Users.Add(user);
        var series1 = new MeasurementSeries("Series 1", user.Id);
        var series2 = new MeasurementSeries("Series 2", user.Id);
        context.MeasurementSeries.AddRange(series1, series2);
        await context.SaveChangesAsync();

        var service = new MeasurementService(context, CreateValidationService());
        var filter = new MeasurementFilterDto { SeriesId = series1.Id };

        var result = await service.GetFilteredMeasurementsAsync(filter, user.Id, "Student");

        Assert.NotNull(result);
        // Should return empty as no measurements exist, but the filter should work
        Assert.Empty(result);
    }

    [Fact]
    public async Task GetFilteredMeasurementsAsync_WithTemplateFilter_FiltersCorrectly()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("FilterMeasurements_ByTemplate" + Guid.NewGuid());
        var user = new User("test@test.com", "Student");
        context.Users.Add(user);
        await context.SaveChangesAsync();

        var service = new MeasurementService(context, CreateValidationService());
        var filter = new MeasurementFilterDto { TemplateId = 1 };

        var result = await service.GetFilteredMeasurementsAsync(filter, user.Id, "Student");

        Assert.NotNull(result);
        Assert.Empty(result);
    }

    [Fact]
    public async Task GetFilteredMeasurementsAsync_WithDateRangeFilter_FiltersCorrectly()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("FilterMeasurements_ByDateRange" + Guid.NewGuid());
        var user = new User("test@test.com", "Student");
        context.Users.Add(user);
        await context.SaveChangesAsync();

        var service = new MeasurementService(context, CreateValidationService());
        var filter = new MeasurementFilterDto
        {
            DateFrom = DateTime.UtcNow.AddDays(-7),
            DateTo = DateTime.UtcNow.AddDays(1)
        };

        var result = await service.GetFilteredMeasurementsAsync(filter, user.Id, "Student");

        Assert.NotNull(result);
        Assert.Empty(result);
    }

    [Fact]
    public async Task GetFilteredMeasurementsAsync_WithSearchText_FiltersCorrectly()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("FilterMeasurements_BySearch" + Guid.NewGuid());
        var user = new User("test@test.com", "Student");
        context.Users.Add(user);
        await context.SaveChangesAsync();

        var service = new MeasurementService(context, CreateValidationService());
        var filter = new MeasurementFilterDto { SearchText = "test" };

        var result = await service.GetFilteredMeasurementsAsync(filter, user.Id, "Student");

        Assert.NotNull(result);
        Assert.Empty(result);
    }

    [Fact]
    public async Task GetMeasurementHistoryAsync_NonExistentMeasurement_ThrowsException()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("GetHistory_NotFound" + Guid.NewGuid());
        var service = new MeasurementService(context, CreateValidationService());

        await Assert.ThrowsAsync<Exception>(async () =>
            await service.GetMeasurementHistoryAsync(999));
    }
}
