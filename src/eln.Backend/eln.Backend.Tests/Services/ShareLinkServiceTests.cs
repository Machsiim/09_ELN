using eln.Backend.Application;
using eln.Backend.Application.DTOs;
using eln.Backend.Application.Model;
using eln.Backend.Application.Services;
using Xunit;

namespace eln.Backend.Tests.Services;

public class ShareLinkServiceTests
{
    // ── Create ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task CreateShareLinkAsync_PublicLink_GeneratesToken()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("CreatePublic" + Guid.NewGuid());
        var user = new User("alice@technikum-wien.at", "Student");
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
    public async Task CreateShareLinkAsync_PrivateLink_WithValidUniversityEmails_Succeeds()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("CreatePrivateValid" + Guid.NewGuid());
        var user = new User("alice@technikum-wien.at", "Student");
        context.Users.Add(user);
        var series = new MeasurementSeries("Test Series", user.Id);
        context.MeasurementSeries.Add(series);
        await context.SaveChangesAsync();

        var service = new ShareLinkService(context);
        var dto = new CreateShareLinkDto
        {
            ExpiresInDays = 30,
            IsPublic = false,
            AllowedUserEmails = ["bob@technikum-wien.at", "carol@technikum-wien.at"]
        };
        var result = await service.CreateShareLinkAsync(series.Id, dto, user.Id);

        Assert.False(result.IsPublic);
        Assert.NotNull(result.Token);
        Assert.Equal(2, result.AllowedUserEmails.Count);
        // Emails should be stored lowercase
        Assert.Contains("bob@technikum-wien.at", result.AllowedUserEmails);
    }

    [Fact]
    public async Task CreateShareLinkAsync_PrivateLink_EmailsNormalisedToLowercase()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("NormEmail" + Guid.NewGuid());
        var user = new User("alice@technikum-wien.at", "Student");
        context.Users.Add(user);
        var series = new MeasurementSeries("S", user.Id);
        context.MeasurementSeries.Add(series);
        await context.SaveChangesAsync();

        var service = new ShareLinkService(context);
        var dto = new CreateShareLinkDto
        {
            ExpiresInDays = 7,
            IsPublic = false,
            AllowedUserEmails = ["BOB@TECHNIKUM-WIEN.AT"]
        };
        var result = await service.CreateShareLinkAsync(series.Id, dto, user.Id);

        Assert.Contains("bob@technikum-wien.at", result.AllowedUserEmails);
    }

    [Fact]
    public async Task CreateShareLinkAsync_PrivateLink_NonUniversityEmail_Throws()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("CreatePrivateInvalid" + Guid.NewGuid());
        var user = new User("alice@technikum-wien.at", "Student");
        context.Users.Add(user);
        var series = new MeasurementSeries("Test Series", user.Id);
        context.MeasurementSeries.Add(series);
        await context.SaveChangesAsync();

        var service = new ShareLinkService(context);
        var dto = new CreateShareLinkDto
        {
            ExpiresInDays = 7,
            IsPublic = false,
            AllowedUserEmails = ["hacker@gmail.com"]
        };

        await Assert.ThrowsAsync<ValidationException>(
            async () => await service.CreateShareLinkAsync(series.Id, dto, user.Id));
    }

    [Fact]
    public async Task CreateShareLinkAsync_PrivateLink_NoEmails_Throws()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("CreatePrivateNoEmails" + Guid.NewGuid());
        var user = new User("alice@technikum-wien.at", "Student");
        context.Users.Add(user);
        var series = new MeasurementSeries("Test Series", user.Id);
        context.MeasurementSeries.Add(series);
        await context.SaveChangesAsync();

        var service = new ShareLinkService(context);
        var dto = new CreateShareLinkDto { ExpiresInDays = 7, IsPublic = false, AllowedUserEmails = [] };

        await Assert.ThrowsAsync<ValidationException>(
            async () => await service.CreateShareLinkAsync(series.Id, dto, user.Id));
    }

    [Fact]
    public async Task CreateShareLinkAsync_SetsCorrectExpiration()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("Expiration" + Guid.NewGuid());
        var user = new User("alice@technikum-wien.at", "Student");
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

    // ── GetSharedSeries access control ────────────────────────────────────────

    [Fact]
    public async Task GetSharedSeriesAsync_PrivateLink_AllowedEmail_Succeeds()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("AccessAllowed" + Guid.NewGuid());
        var user = new User("alice@technikum-wien.at", "Student");
        context.Users.Add(user);
        var series = new MeasurementSeries("S", user.Id);
        context.MeasurementSeries.Add(series);
        var link = new SeriesShareLink(series.Id, "tok1", false,
            DateTime.UtcNow.AddDays(7), user.Id,
            ["bob@technikum-wien.at"]);
        context.SeriesShareLinks.Add(link);
        await context.SaveChangesAsync();

        var service = new ShareLinkService(context);
        // Case-insensitive: stored lowercase, request uppercase
        var result = await service.GetSharedSeriesAsync("tok1", "BOB@TECHNIKUM-WIEN.AT");

        Assert.Equal(series.Id, result.SeriesId);
    }

    [Fact]
    public async Task GetSharedSeriesAsync_PrivateLink_AllowedEmail_MatchesUsernameClaim()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("AccessAllowedUsername" + Guid.NewGuid());
        var user = new User("alice@technikum-wien.at", "Student");
        context.Users.Add(user);
        var series = new MeasurementSeries("S", user.Id);
        context.MeasurementSeries.Add(series);
        var link = new SeriesShareLink(series.Id, "tok-username", false,
            DateTime.UtcNow.AddDays(7), user.Id,
            ["bob@technikum-wien.at"]);
        context.SeriesShareLinks.Add(link);
        await context.SaveChangesAsync();

        var service = new ShareLinkService(context);
        var result = await service.GetSharedSeriesAsync("tok-username", "bob");

        Assert.Equal(series.Id, result.SeriesId);
    }

    [Fact]
    public async Task GetSharedSeriesAsync_PrivateLink_UnknownEmail_Throws()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("AccessDenied" + Guid.NewGuid());
        var user = new User("alice@technikum-wien.at", "Student");
        context.Users.Add(user);
        var series = new MeasurementSeries("S", user.Id);
        context.MeasurementSeries.Add(series);
        var link = new SeriesShareLink(series.Id, "tok2", false,
            DateTime.UtcNow.AddDays(7), user.Id,
            ["bob@technikum-wien.at"]);
        context.SeriesShareLinks.Add(link);
        await context.SaveChangesAsync();

        var service = new ShareLinkService(context);
        await Assert.ThrowsAsync<ForbiddenException>(
            async () => await service.GetSharedSeriesAsync("tok2", "eve@gmail.com"));
    }

    [Fact]
    public async Task GetSharedSeriesAsync_PrivateLink_CreatorHasAccessWithoutAllowListEntry()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("CreatorAccess" + Guid.NewGuid());
        var creator = new User("testcreator", "Student");
        context.Users.Add(creator);
        await context.SaveChangesAsync();

        var series = new MeasurementSeries("S", creator.Id);
        context.MeasurementSeries.Add(series);
        var link = new SeriesShareLink(
            series.Id,
            "creator-token",
            false,
            DateTime.UtcNow.AddDays(7),
            creator.Id,
            ["other@technikum-wien.at"]);
        context.SeriesShareLinks.Add(link);
        await context.SaveChangesAsync();

        var service = new ShareLinkService(context);
        var result = await service.GetSharedSeriesAsync("creator-token", "testcreator");

        Assert.Equal(series.Id, result.SeriesId);
    }

    // ── GetShareLinks ─────────────────────────────────────────────────────────

    [Fact]
    public async Task GetShareLinksForSeriesAsync_ReturnsLinks()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("GetLinks" + Guid.NewGuid());
        var user = new User("alice@technikum-wien.at", "Student");
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
        var user = new User("alice@technikum-wien.at", "Student");
        context.Users.Add(user);
        var series = new MeasurementSeries("Test Series", user.Id);
        context.MeasurementSeries.Add(series);
        await context.SaveChangesAsync();

        var service = new ShareLinkService(context);
        var result = await service.GetShareLinksForSeriesAsync(series.Id);

        Assert.Empty(result);
    }

    [Fact]
    public async Task GetShareLinksByCreatorAsync_ReturnsOnlyCreatorsLinks()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("CreatorLinks" + Guid.NewGuid());
        var creator = new User("creator", "Student");
        var otherUser = new User("other", "Student");
        context.Users.AddRange(creator, otherUser);
        await context.SaveChangesAsync();

        var firstSeries = new MeasurementSeries("First Series", creator.Id);
        var secondSeries = new MeasurementSeries("Second Series", otherUser.Id);
        context.MeasurementSeries.AddRange(firstSeries, secondSeries);
        await context.SaveChangesAsync();

        context.SeriesShareLinks.AddRange(
            new SeriesShareLink(
                firstSeries.Id,
                "creator-link",
                true,
                DateTime.UtcNow.AddDays(7),
                creator.Id),
            new SeriesShareLink(
                secondSeries.Id,
                "other-link",
                true,
                DateTime.UtcNow.AddDays(7),
                otherUser.Id));
        await context.SaveChangesAsync();

        var service = new ShareLinkService(context);
        var result = await service.GetShareLinksByCreatorAsync(creator.Id);

        var link = Assert.Single(result);
        Assert.Equal("creator-link", link.Token);
        Assert.Equal(firstSeries.Id, link.SeriesId);
        Assert.Equal("First Series", link.SeriesName);
    }

    [Fact]
    public async Task GetShareLinksByCreatorAsync_AppliesSearchStatusAndVisibility()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("FilteredCreatorLinks" + Guid.NewGuid());
        var creator = new User("creator", "Student");
        context.Users.Add(creator);
        await context.SaveChangesAsync();

        var matchingSeries = new MeasurementSeries("Temperatur Labor", creator.Id);
        var publicSeries = new MeasurementSeries("Temperatur Aussen", creator.Id);
        var expiredSeries = new MeasurementSeries("Temperatur Alt", creator.Id);
        context.MeasurementSeries.AddRange(matchingSeries, publicSeries, expiredSeries);
        await context.SaveChangesAsync();

        context.SeriesShareLinks.AddRange(
            new SeriesShareLink(
                matchingSeries.Id,
                "matching-link",
                false,
                DateTime.UtcNow.AddDays(7),
                creator.Id),
            new SeriesShareLink(
                publicSeries.Id,
                "public-link",
                true,
                DateTime.UtcNow.AddDays(7),
                creator.Id),
            new SeriesShareLink(
                expiredSeries.Id,
                "expired-link",
                false,
                DateTime.UtcNow.AddDays(-1),
                creator.Id));
        await context.SaveChangesAsync();

        var service = new ShareLinkService(context);
        var result = await service.GetShareLinksByCreatorAsync(
            creator.Id,
            "labor",
            "active",
            "private");

        var link = Assert.Single(result);
        Assert.Equal("matching-link", link.Token);
    }

    // ── Delete ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task DeleteShareLinkAsync_OwnerDeletes_Success()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("DeleteShare" + Guid.NewGuid());
        var user = new User("alice@technikum-wien.at", "Student");
        context.Users.Add(user);
        var series = new MeasurementSeries("Test Series", user.Id);
        context.MeasurementSeries.Add(series);
        var shareLink = new SeriesShareLink(series.Id, "token", true, DateTime.UtcNow.AddDays(7), user.Id);
        context.SeriesShareLinks.Add(shareLink);
        await context.SaveChangesAsync();

        var service = new ShareLinkService(context);
        await service.DeleteShareLinkAsync(series.Id, shareLink.Id, user.Id);
        var deleted = await context.SeriesShareLinks.FindAsync(shareLink.Id);

        Assert.Null(deleted);
    }

    [Fact]
    public async Task DeleteShareLinkAsync_NonOwner_ThrowsException()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("DeleteNonOwner" + Guid.NewGuid());
        var alice = new User("alice@technikum-wien.at", "Student");
        var bob = new User("bob@technikum-wien.at", "Student");
        context.Users.AddRange(alice, bob);
        var series = new MeasurementSeries("Test Series", alice.Id);
        context.MeasurementSeries.Add(series);
        var shareLink = new SeriesShareLink(series.Id, "token", true, DateTime.UtcNow.AddDays(7), alice.Id);
        context.SeriesShareLinks.Add(shareLink);
        await context.SaveChangesAsync();

        var service = new ShareLinkService(context);
        await Assert.ThrowsAsync<ForbiddenException>(
            async () => await service.DeleteShareLinkAsync(series.Id, shareLink.Id, bob.Id));
    }

    [Fact]
    public async Task DeleteShareLinkAsync_WrongSeriesId_ThrowsException()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("DeleteWrongSeries" + Guid.NewGuid());
        var user = new User("alice@technikum-wien.at", "Student");
        context.Users.Add(user);
        var series = new MeasurementSeries("S1", user.Id);
        var otherSeries = new MeasurementSeries("S2", user.Id);
        context.MeasurementSeries.AddRange(series, otherSeries);
        var shareLink = new SeriesShareLink(series.Id, "token", true, DateTime.UtcNow.AddDays(7), user.Id);
        context.SeriesShareLinks.Add(shareLink);
        await context.SaveChangesAsync();

        var service = new ShareLinkService(context);
        // Pass the OTHER series ID — should fail
        await Assert.ThrowsAsync<NotFoundException>(
            async () => await service.DeleteShareLinkAsync(otherSeries.Id, shareLink.Id, user.Id));
    }

    // ── Deactivate ────────────────────────────────────────────────────────────

    [Fact]
    public async Task DeactivateShareLinkAsync_ValidOwner_DeactivatesSuccessfully()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("Deactivate" + Guid.NewGuid());
        var user = new User("alice@technikum-wien.at", "Student");
        context.Users.Add(user);
        var series = new MeasurementSeries("Test Series", user.Id);
        context.MeasurementSeries.Add(series);
        var shareLink = new SeriesShareLink(series.Id, "token", true, DateTime.UtcNow.AddDays(7), user.Id);
        context.SeriesShareLinks.Add(shareLink);
        await context.SaveChangesAsync();

        var service = new ShareLinkService(context);
        await service.DeactivateShareLinkAsync(series.Id, shareLink.Id, user.Id);
        var deactivated = await context.SeriesShareLinks.FindAsync(shareLink.Id);

        Assert.NotNull(deactivated);
        Assert.False(deactivated.IsActive);
    }

    [Fact]
    public async Task DeactivateShareLinkAsync_NonOwner_ThrowsException()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("DeactivateNonOwner" + Guid.NewGuid());
        var alice = new User("alice@technikum-wien.at", "Student");
        var bob = new User("bob@technikum-wien.at", "Student");
        context.Users.AddRange(alice, bob);
        var series = new MeasurementSeries("Test Series", alice.Id);
        context.MeasurementSeries.Add(series);
        var shareLink = new SeriesShareLink(series.Id, "token", true, DateTime.UtcNow.AddDays(7), alice.Id);
        context.SeriesShareLinks.Add(shareLink);
        await context.SaveChangesAsync();

        var service = new ShareLinkService(context);
        await Assert.ThrowsAsync<ForbiddenException>(
            async () => await service.DeactivateShareLinkAsync(series.Id, shareLink.Id, bob.Id));
    }

    [Fact]
    public async Task DeactivateShareLinkAsync_WrongSeriesId_ThrowsException()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("DeactivateWrongSeries" + Guid.NewGuid());
        var user = new User("alice@technikum-wien.at", "Student");
        context.Users.Add(user);
        var series = new MeasurementSeries("S1", user.Id);
        var otherSeries = new MeasurementSeries("S2", user.Id);
        context.MeasurementSeries.AddRange(series, otherSeries);
        var shareLink = new SeriesShareLink(series.Id, "token", true, DateTime.UtcNow.AddDays(7), user.Id);
        context.SeriesShareLinks.Add(shareLink);
        await context.SaveChangesAsync();

        var service = new ShareLinkService(context);
        await Assert.ThrowsAsync<NotFoundException>(
            async () => await service.DeactivateShareLinkAsync(otherSeries.Id, shareLink.Id, user.Id));
    }
}
