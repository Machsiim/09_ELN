using eln.Backend.Application.DTOs;
using eln.Backend.Application.Model;
using eln.Backend.Application.Services;
using Xunit;

namespace eln.Backend.Tests.Services;

public class ShareLinkServiceTests
{
    [Fact]
    public async Task CreateShareLinkAsync_PublicLink_GeneratesToken()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("CreatePublic" + Guid.NewGuid());
        var user = new User("alice@test.com", "Student");
        context.Users.Add(user);
        var series = new MeasurementSeries("Test Series", user.Id);
        context.MeasurementSeries.Add(series);
        await context.SaveChangesAsync();
        var service = new ShareLinkService(context);
        var dto = new CreateShareLinkDto { ExpiresInDays = 7, IsPublic = true };
        var result = await service.CreateShareLinkAsync(series.Id, dto, user.Id);
        Assert.NotNull(result.Token);
        Assert.Equal(32, result.Token.Length);
        Assert.True(result.IsPublic);
        Assert.True(result.IsActive);
    }

    [Fact]
    public async Task CreateShareLinkAsync_PrivateLink_CreatesSuccessfully()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("CreatePrivate" + Guid.NewGuid());
        var user = new User("alice@test.com", "Student");
        context.Users.Add(user);
        var series = new MeasurementSeries("Test Series", user.Id);
        context.MeasurementSeries.Add(series);
        await context.SaveChangesAsync();
        var service = new ShareLinkService(context);
        var dto = new CreateShareLinkDto { ExpiresInDays = 30, IsPublic = false };
        var result = await service.CreateShareLinkAsync(series.Id, dto, user.Id);
        Assert.False(result.IsPublic);
        Assert.NotNull(result.Token);
    }

    [Fact]
    public async Task CreateShareLinkAsync_SetsCorrectExpiration()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("Expiration" + Guid.NewGuid());
        var user = new User("alice@test.com", "Student");
        context.Users.Add(user);
        var series = new MeasurementSeries("Test Series", user.Id);
        context.MeasurementSeries.Add(series);
        await context.SaveChangesAsync();
        var service = new ShareLinkService(context);
        var dto = new CreateShareLinkDto { ExpiresInDays = 7, IsPublic = true };
        var before = DateTime.UtcNow.AddDays(7);
        var result = await service.CreateShareLinkAsync(series.Id, dto, user.Id);
        var after = DateTime.UtcNow.AddDays(7);
        Assert.True(result.ExpiresAt >= before && result.ExpiresAt <= after);
    }

    [Fact]
    public async Task GetShareLinksForSeriesAsync_ReturnsLinks()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("GetLinks" + Guid.NewGuid());
        var user = new User("alice@test.com", "Student");
        context.Users.Add(user);
        var series = new MeasurementSeries("Test Series", user.Id);
        context.MeasurementSeries.Add(series);
        await context.SaveChangesAsync();
        var service = new ShareLinkService(context);
        var dto = new CreateShareLinkDto { ExpiresInDays = 7, IsPublic = true };
        await service.CreateShareLinkAsync(series.Id, dto, user.Id);
        await service.CreateShareLinkAsync(series.Id, dto, user.Id);
        var result = await service.GetShareLinksForSeriesAsync(series.Id);
        Assert.Equal(2, result.Count);
    }

    [Fact]
    public async Task GetShareLinksForSeriesAsync_EmptySeries_ReturnsEmpty()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("GetEmpty" + Guid.NewGuid());
        var user = new User("alice@test.com", "Student");
        context.Users.Add(user);
        var series = new MeasurementSeries("Test Series", user.Id);
        context.MeasurementSeries.Add(series);
        await context.SaveChangesAsync();
        var service = new ShareLinkService(context);
        var result = await service.GetShareLinksForSeriesAsync(series.Id);
        Assert.Empty(result);
    }

    [Fact]
    public async Task DeleteShareLinkAsync_OwnerDeletes_Success()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("DeleteShare" + Guid.NewGuid());
        var user = new User("alice@test.com", "Student");
        context.Users.Add(user);
        var series = new MeasurementSeries("Test Series", user.Id);
        context.MeasurementSeries.Add(series);
        var shareLink = new SeriesShareLink(series.Id, "token", true, DateTime.UtcNow.AddDays(7), user.Id);
        context.SeriesShareLinks.Add(shareLink);
        await context.SaveChangesAsync();
        var service = new ShareLinkService(context);
        await service.DeleteShareLinkAsync(shareLink.Id, user.Id);
        var deleted = await context.SeriesShareLinks.FindAsync(shareLink.Id);
        Assert.Null(deleted);
    }

    [Fact]
    public async Task DeleteShareLinkAsync_NonOwner_ThrowsException()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("DeleteNonOwner" + Guid.NewGuid());
        var alice = new User("alice@test.com", "Student");
        var bob = new User("bob@test.com", "Student");
        context.Users.AddRange(alice, bob);
        var series = new MeasurementSeries("Test Series", alice.Id);
        context.MeasurementSeries.Add(series);
        var shareLink = new SeriesShareLink(series.Id, "token", true, DateTime.UtcNow.AddDays(7), alice.Id);
        context.SeriesShareLinks.Add(shareLink);
        await context.SaveChangesAsync();
        var service = new ShareLinkService(context);
        await Assert.ThrowsAsync<Exception>(async () => await service.DeleteShareLinkAsync(shareLink.Id, bob.Id));
    }

    [Fact]
    public async Task DeactivateShareLinkAsync_ValidOwner_DeactivatesSuccessfully()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("Deactivate" + Guid.NewGuid());
        var user = new User("alice@test.com", "Student");
        context.Users.Add(user);
        var series = new MeasurementSeries("Test Series", user.Id);
        context.MeasurementSeries.Add(series);
        var shareLink = new SeriesShareLink(series.Id, "token", true, DateTime.UtcNow.AddDays(7), user.Id);
        context.SeriesShareLinks.Add(shareLink);
        await context.SaveChangesAsync();
        var service = new ShareLinkService(context);
        await service.DeactivateShareLinkAsync(shareLink.Id, user.Id);
        var deactivated = await context.SeriesShareLinks.FindAsync(shareLink.Id);
        Assert.NotNull(deactivated);
        Assert.False(deactivated.IsActive);
    }

    [Fact]
    public async Task DeactivateShareLinkAsync_NonOwner_ThrowsException()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("DeactivateNonOwner" + Guid.NewGuid());
        var alice = new User("alice@test.com", "Student");
        var bob = new User("bob@test.com", "Student");
        context.Users.AddRange(alice, bob);
        var series = new MeasurementSeries("Test Series", alice.Id);
        context.MeasurementSeries.Add(series);
        var shareLink = new SeriesShareLink(series.Id, "token", true, DateTime.UtcNow.AddDays(7), alice.Id);
        context.SeriesShareLinks.Add(shareLink);
        await context.SaveChangesAsync();
        var service = new ShareLinkService(context);
        await Assert.ThrowsAsync<Exception>(async () => await service.DeactivateShareLinkAsync(shareLink.Id, bob.Id));
    }
}
