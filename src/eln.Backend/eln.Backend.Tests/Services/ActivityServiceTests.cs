using System.Text.Json;
using eln.Backend.Application.DTOs;
using eln.Backend.Application.Model;
using eln.Backend.Application.Services;
using Xunit;

namespace eln.Backend.Tests.Services;

public class ActivityServiceTests
{
    private static (Measurement m, MeasurementHistory h) CreateMeasurementWithHistory(
        int seriesId, int userId, string changeType, DateTime? at = null)
    {
        var data = JsonDocument.Parse("{}");
        var m = new Measurement(seriesId, templateId: 1, data, userId);
        var h = new MeasurementHistory(measurementId: 0, changeType, data, userId)
        {
            ChangedAt = at ?? DateTime.UtcNow
        };
        return (m, h);
    }

    [Fact]
    public async Task GetRecentActivities_NoData_ReturnsEmptyPage()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("Act_Empty" + Guid.NewGuid());
        var service = new ActivityService(context);

        var result = await service.GetRecentActivitiesAsync(new PaginationParams());

        Assert.NotNull(result);
        Assert.Equal(0, result.Total);
        Assert.Empty(result.Items);
    }

    [Fact]
    public async Task GetRecentActivities_IncludesSeriesAndTemplateCreations()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("Act_Series" + Guid.NewGuid());
        var user = new User("alice", "Staff");
        context.Users.Add(user);
        await context.SaveChangesAsync();

        context.MeasurementSeries.Add(new MeasurementSeries("S1", user.Id));
        context.Templates.Add(new Template("T1", JsonDocument.Parse("{}"), user.Id));
        await context.SaveChangesAsync();

        var service = new ActivityService(context);
        var result = await service.GetRecentActivitiesAsync(new PaginationParams());

        Assert.Equal(2, result.Total);
        Assert.Contains(result.Items, a => a.Type == "SeriesCreated" && a.Username == "alice");
        Assert.Contains(result.Items, a => a.Type == "TemplateCreated" && a.Username == "alice");
    }

    [Fact]
    public async Task GetRecentActivities_OrderedByTimestampDesc()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("Act_Order" + Guid.NewGuid());
        var user = new User("bob", "Staff");
        context.Users.Add(user);
        await context.SaveChangesAsync();

        var oldSeries = new MeasurementSeries("Old", user.Id);
        context.MeasurementSeries.Add(oldSeries);
        await context.SaveChangesAsync();
        oldSeries.CreatedAt = DateTime.UtcNow.AddHours(-5);
        await context.SaveChangesAsync();

        var newSeries = new MeasurementSeries("New", user.Id);
        context.MeasurementSeries.Add(newSeries);
        await context.SaveChangesAsync();

        var service = new ActivityService(context);
        var result = await service.GetRecentActivitiesAsync(new PaginationParams());

        Assert.Equal("New", result.Items[0].SeriesName);
        Assert.Equal("Old", result.Items[1].SeriesName);
    }

    [Theory]
    [InlineData("SeriesCreated", 1)]
    [InlineData("TemplateCreated", 1)]
    [InlineData("MeasurementCreated", 0)]
    [InlineData("NonExistentType", 0)]
    public async Task GetRecentActivities_FiltersByType(string filterType, int expectedCount)
    {
        var context = TestDbContextFactory.CreateInMemoryContext("Act_Filter" + Guid.NewGuid());
        var user = new User("carol", "Staff");
        context.Users.Add(user);
        await context.SaveChangesAsync();

        context.MeasurementSeries.Add(new MeasurementSeries("S1", user.Id));
        context.Templates.Add(new Template("T1", JsonDocument.Parse("{}"), user.Id));
        await context.SaveChangesAsync();

        var service = new ActivityService(context);
        var result = await service.GetRecentActivitiesAsync(new PaginationParams(), type: filterType);

        Assert.Equal(expectedCount, result.Total);
        Assert.All(result.Items, a => Assert.Equal(filterType, a.Type));
    }

    [Fact]
    public async Task GetRecentActivities_FiltersByUserId()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("Act_User" + Guid.NewGuid());
        var alice = new User("alice", "Staff");
        var bob = new User("bob", "Staff");
        context.Users.AddRange(alice, bob);
        await context.SaveChangesAsync();

        context.MeasurementSeries.Add(new MeasurementSeries("Alice's", alice.Id));
        context.MeasurementSeries.Add(new MeasurementSeries("Bob's 1", bob.Id));
        context.MeasurementSeries.Add(new MeasurementSeries("Bob's 2", bob.Id));
        await context.SaveChangesAsync();

        var service = new ActivityService(context);
        var result = await service.GetRecentActivitiesAsync(new PaginationParams(), userId: bob.Id);

        Assert.Equal(2, result.Total);
        Assert.All(result.Items, a => Assert.Equal("bob", a.Username));
    }

    [Theory]
    [InlineData(1, 2, 2, 5)]
    [InlineData(2, 2, 2, 5)]
    [InlineData(3, 2, 1, 5)]
    [InlineData(1, 100, 5, 5)]
    public async Task GetRecentActivities_RespectsPagination(
        int page, int pageSize, int expectedItems, int totalSeries)
    {
        var context = TestDbContextFactory.CreateInMemoryContext("Act_Page" + Guid.NewGuid());
        var user = new User("dave", "Staff");
        context.Users.Add(user);
        await context.SaveChangesAsync();

        for (int i = 0; i < totalSeries; i++)
            context.MeasurementSeries.Add(new MeasurementSeries($"S{i}", user.Id));
        await context.SaveChangesAsync();

        var service = new ActivityService(context);
        var result = await service.GetRecentActivitiesAsync(
            new PaginationParams { Page = page, PageSize = pageSize });

        Assert.Equal(totalSeries, result.Total);
        Assert.Equal(expectedItems, result.Items.Count);
    }

    [Fact]
    public async Task GetRecentActivitiesSimple_RespectsLimit()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("Act_Simple" + Guid.NewGuid());
        var user = new User("eve", "Staff");
        context.Users.Add(user);
        await context.SaveChangesAsync();

        for (int i = 0; i < 15; i++)
            context.MeasurementSeries.Add(new MeasurementSeries($"S{i}", user.Id));
        await context.SaveChangesAsync();

        var service = new ActivityService(context);
        var result = await service.GetRecentActivitiesSimpleAsync(limit: 5);

        Assert.Equal(5, result.Count);
    }
}
