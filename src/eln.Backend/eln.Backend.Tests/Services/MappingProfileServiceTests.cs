using System.Text.Json;
using eln.Backend.Application.DTOs;
using eln.Backend.Application.Model;
using eln.Backend.Application.Services;
using Xunit;

namespace eln.Backend.Tests.Services;

public class MappingProfileServiceTests
{
    private static MappingProfile CreateProfile(int templateId, int userId, string name)
    {
        var mappingDoc = JsonDocument.Parse("{\"col1\":\"field1\"}");
        return new MappingProfile(name, templateId, mappingDoc, userId);
    }

    [Fact]
    public async Task GetByTemplateAsync_NoProfiles_ReturnsEmptyPage()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("MP_Empty" + Guid.NewGuid());
        var service = new MappingProfileService(context);

        var result = await service.GetByTemplateAsync(templateId: 1, userId: 1, new PaginationParams());

        Assert.NotNull(result);
        Assert.Empty(result.Items);
        Assert.Equal(0, result.Total);
    }

    [Fact]
    public async Task GetByTemplateAsync_FiltersByUserAndTemplate()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("MP_Filter" + Guid.NewGuid());
        var user1 = new User("user1", "Student");
        var user2 = new User("user2", "Student");
        context.Users.AddRange(user1, user2);
        await context.SaveChangesAsync();

        context.MappingProfiles.AddRange(
            CreateProfile(templateId: 1, userId: user1.Id, "Mine A"),
            CreateProfile(templateId: 1, userId: user1.Id, "Mine B"),
            CreateProfile(templateId: 1, userId: user2.Id, "Other"),
            CreateProfile(templateId: 2, userId: user1.Id, "Different Template")
        );
        await context.SaveChangesAsync();

        var service = new MappingProfileService(context);
        var result = await service.GetByTemplateAsync(templateId: 1, userId: user1.Id, new PaginationParams());

        Assert.Equal(2, result.Total);
        Assert.All(result.Items, item => Assert.Equal(1, item.TemplateId));
    }

    [Theory]
    [InlineData(1, 2, 2, 5)]
    [InlineData(2, 2, 2, 5)]
    [InlineData(3, 2, 1, 5)]
    [InlineData(1, 5, 5, 5)]
    public async Task GetByTemplateAsync_Pagination_ReturnsCorrectSlice(
        int page, int pageSize, int expectedItems, int totalProfiles)
    {
        var context = TestDbContextFactory.CreateInMemoryContext("MP_Page" + Guid.NewGuid());
        var user = new User("test", "Student");
        context.Users.Add(user);
        await context.SaveChangesAsync();

        for (int i = 0; i < totalProfiles; i++)
            context.MappingProfiles.Add(CreateProfile(templateId: 1, userId: user.Id, $"Profile {i}"));
        await context.SaveChangesAsync();

        var service = new MappingProfileService(context);
        var result = await service.GetByTemplateAsync(
            templateId: 1, userId: user.Id,
            new PaginationParams { Page = page, PageSize = pageSize });

        Assert.Equal(totalProfiles, result.Total);
        Assert.Equal(expectedItems, result.Items.Count);
    }

    [Fact]
    public async Task DeleteAsync_WrongUser_ReturnsFalse()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("MP_Delete" + Guid.NewGuid());
        var owner = new User("owner", "Student");
        var other = new User("other", "Student");
        context.Users.AddRange(owner, other);
        var profile = CreateProfile(templateId: 1, userId: 0, "Test");
        context.MappingProfiles.Add(profile);
        await context.SaveChangesAsync();
        profile.CreatedBy = owner.Id;
        await context.SaveChangesAsync();

        var service = new MappingProfileService(context);
        var result = await service.DeleteAsync(profile.Id, other.Id);

        Assert.False(result);
        Assert.NotNull(await context.MappingProfiles.FindAsync(profile.Id));
    }
}
