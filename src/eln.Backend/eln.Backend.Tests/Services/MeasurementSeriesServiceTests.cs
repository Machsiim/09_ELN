using eln.Backend.Application;
using eln.Backend.Application.DTOs;
using eln.Backend.Application.Model;
using eln.Backend.Application.Services;
using Xunit;

namespace eln.Backend.Tests.Services;

public class MeasurementSeriesServiceTests
{
    [Fact]
    public async Task CreateSeriesAsync_ValidData_ReturnsDto()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("CreateSeries" + Guid.NewGuid());
        var user = new User("test@test.com", "Student");
        context.Users.Add(user);
        await context.SaveChangesAsync();
        var service = new MeasurementSeriesService(context);
        var dto = new CreateMeasurementSeriesDto { Name = "Test Series", Description = "Test" };
        var result = await service.CreateSeriesAsync(dto, user.Id);
        Assert.NotNull(result);
        Assert.Equal("Test Series", result.Name);
        Assert.Equal("Test", result.Description);
    }

    [Fact]
    public async Task GetSeriesByIdAsync_ValidId_ReturnsDto()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("GetById" + Guid.NewGuid());
        var user = new User("test@test.com", "Student");
        context.Users.Add(user);
        var series = new MeasurementSeries("Test Series", user.Id, "Description");
        context.MeasurementSeries.Add(series);
        await context.SaveChangesAsync();
        var service = new MeasurementSeriesService(context);
        var result = await service.GetSeriesByIdAsync(series.Id);
        Assert.NotNull(result);
        Assert.Equal("Test Series", result.Name);
    }

    [Fact]
    public async Task GetAllSeriesAsync_ReturnsList()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("GetAll" + Guid.NewGuid());
        var user = new User("test@test.com", "Student");
        context.Users.Add(user);
        var series1 = new MeasurementSeries("Series 1", user.Id);
        var series2 = new MeasurementSeries("Series 2", user.Id);
        context.MeasurementSeries.AddRange(series1, series2);
        await context.SaveChangesAsync();
        var service = new MeasurementSeriesService(context);
        var result = await service.GetAllSeriesAsync(new PaginationParams());
        Assert.NotNull(result);
        Assert.Equal(2, result.Total);
        Assert.Equal(2, result.Items.Count);
    }

    [Theory]
    [InlineData(1, 2, 2, 5)]
    [InlineData(2, 2, 2, 5)]
    [InlineData(3, 2, 1, 5)]
    [InlineData(4, 2, 0, 5)]
    [InlineData(1, 10, 5, 5)]
    [InlineData(1, 1, 1, 5)]
    public async Task GetAllSeriesAsync_Pagination_ReturnsCorrectSlice(
        int page, int pageSize, int expectedItems, int totalSeries)
    {
        var context = TestDbContextFactory.CreateInMemoryContext("Paginate" + Guid.NewGuid());
        var user = new User("test@test.com", "Student");
        context.Users.Add(user);
        for (int i = 1; i <= totalSeries; i++)
            context.MeasurementSeries.Add(new MeasurementSeries($"Series {i}", user.Id));
        await context.SaveChangesAsync();

        var service = new MeasurementSeriesService(context);
        var result = await service.GetAllSeriesAsync(new PaginationParams { Page = page, PageSize = pageSize });

        Assert.Equal(totalSeries, result.Total);
        Assert.Equal(expectedItems, result.Items.Count);
        Assert.Equal(page, result.Page);
        Assert.Equal(pageSize, result.PageSize);
    }

    [Fact]
    public async Task GetAllSeriesAsync_OrderedByCreatedAtDesc()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("Order" + Guid.NewGuid());
        var user = new User("test@test.com", "Student");
        context.Users.Add(user);

        var older = new MeasurementSeries("Older", user.Id);
        await context.SaveChangesAsync();
        context.MeasurementSeries.Add(older);
        await context.SaveChangesAsync();
        await Task.Delay(10);
        var newer = new MeasurementSeries("Newer", user.Id);
        context.MeasurementSeries.Add(newer);
        await context.SaveChangesAsync();

        var service = new MeasurementSeriesService(context);
        var result = await service.GetAllSeriesAsync(new PaginationParams());

        Assert.Equal("Newer", result.Items[0].Name);
        Assert.Equal("Older", result.Items[1].Name);
    }

    [Fact]
    public async Task UpdateSeriesAsync_ValidData_UpdatesSuccessfully()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("Update" + Guid.NewGuid());
        var user = new User("test@test.com", "Student");
        context.Users.Add(user);
        var series = new MeasurementSeries("Old Name", user.Id);
        context.MeasurementSeries.Add(series);
        await context.SaveChangesAsync();
        var service = new MeasurementSeriesService(context);
        var dto = new UpdateMeasurementSeriesDto { Name = "New Name", Description = "New Description" };
        var result = await service.UpdateSeriesAsync(series.Id, dto);
        Assert.Equal("New Name", result.Name);
        Assert.Equal("New Description", result.Description);
    }

    [Fact]
    public async Task LockSeriesAsync_ValidSeries_LocksSuccessfully()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("Lock" + Guid.NewGuid());
        var user = new User("staff@test.com", "Staff");
        context.Users.Add(user);
        var series = new MeasurementSeries("Test Series", user.Id);
        context.MeasurementSeries.Add(series);
        await context.SaveChangesAsync();
        var service = new MeasurementSeriesService(context);
        var result = await service.LockSeriesAsync(series.Id, user.Id);
        Assert.True(result.IsLocked);
        Assert.Equal(user.Id, result.LockedBy);
        Assert.NotNull(result.LockedAt);
    }

    [Fact]
    public async Task LockSeriesAsync_AlreadyLocked_ThrowsException()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("LockAlready" + Guid.NewGuid());
        var user = new User("staff@test.com", "Staff");
        context.Users.Add(user);
        var series = new MeasurementSeries("Test Series", user.Id);
        series.IsLocked = true;
        series.LockedBy = user.Id;
        context.MeasurementSeries.Add(series);
        await context.SaveChangesAsync();
        var service = new MeasurementSeriesService(context);
        await Assert.ThrowsAsync<ValidationException>(async () => await service.LockSeriesAsync(series.Id, user.Id));
    }

    [Fact]
    public async Task UnlockSeriesAsync_LockedSeries_UnlocksSuccessfully()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("Unlock" + Guid.NewGuid());
        var user = new User("staff@test.com", "Staff");
        context.Users.Add(user);
        var series = new MeasurementSeries("Test Series", user.Id);
        series.IsLocked = true;
        series.LockedBy = user.Id;
        context.MeasurementSeries.Add(series);
        await context.SaveChangesAsync();
        var service = new MeasurementSeriesService(context);
        var result = await service.UnlockSeriesAsync(series.Id);
        Assert.False(result.IsLocked);
        Assert.Null(result.LockedBy);
    }

    [Fact]
    public async Task UnlockSeriesAsync_NotLocked_ThrowsException()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("UnlockNotLocked" + Guid.NewGuid());
        var user = new User("staff@test.com", "Staff");
        context.Users.Add(user);
        var series = new MeasurementSeries("Test Series", user.Id);
        context.MeasurementSeries.Add(series);
        await context.SaveChangesAsync();
        var service = new MeasurementSeriesService(context);
        await Assert.ThrowsAsync<ValidationException>(async () => await service.UnlockSeriesAsync(series.Id));
    }

    [Fact]
    public async Task UpdateSeriesAsync_LockedSeries_ThrowsException()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("UpdateLocked" + Guid.NewGuid());
        var user = new User("staff@test.com", "Staff");
        context.Users.Add(user);
        var series = new MeasurementSeries("Test Series", user.Id);
        series.IsLocked = true;
        context.MeasurementSeries.Add(series);
        await context.SaveChangesAsync();
        var service = new MeasurementSeriesService(context);
        var dto = new UpdateMeasurementSeriesDto { Name = "Updated", Description = "Updated" };
        await Assert.ThrowsAsync<ValidationException>(async () => await service.UpdateSeriesAsync(series.Id, dto));
    }

    [Fact]
    public async Task DeleteSeriesAsync_ValidSeries_DeletesSuccessfully()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("Delete" + Guid.NewGuid());
        var user = new User("test@test.com", "Student");
        context.Users.Add(user);
        var series = new MeasurementSeries("Test Series", user.Id);
        context.MeasurementSeries.Add(series);
        await context.SaveChangesAsync();
        var service = new MeasurementSeriesService(context);
        await service.DeleteSeriesAsync(series.Id);
        var deleted = await context.MeasurementSeries.FindAsync(series.Id);
        Assert.Null(deleted);
    }
}
