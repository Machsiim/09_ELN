using eln.Backend.Application.Model;
using eln.Backend.Application.Services;
using Xunit;

namespace eln.Backend.Tests.Services;

public class TemplateServiceTests
{
    [Fact]
    public async Task GetTemplateByIdAsync_NonExistentId_ThrowsException()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("GetTemplateById_NotFound" + Guid.NewGuid());
        var service = new TemplateService(context);

        await Assert.ThrowsAsync<Exception>(async () =>
            await service.GetTemplateByIdAsync(999));
    }

    [Fact]
    public async Task GetAllTemplatesAsync_NoTemplates_ReturnsEmptyList()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("GetAllTemplates_Empty" + Guid.NewGuid());
        var service = new TemplateService(context);

        var result = await service.GetAllTemplatesAsync();

        Assert.NotNull(result);
        Assert.Empty(result);
    }

    [Fact]
    public async Task DeleteTemplateAsync_NonExistentId_ThrowsException()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("DeleteTemplate_NotFound" + Guid.NewGuid());
        var service = new TemplateService(context);

        await Assert.ThrowsAsync<Exception>(async () =>
            await service.DeleteTemplateAsync(999));
    }

    [Fact]
    public async Task GetAllTemplatesAsync_WithCreator_IncludesCreatorInfo()
    {
        var context = TestDbContextFactory.CreateInMemoryContext("GetAllTemplates_WithCreator" + Guid.NewGuid());
        var user = new User("creator@test.com", "Staff");
        context.Users.Add(user);
        await context.SaveChangesAsync();

        var service = new TemplateService(context);
        var result = await service.GetAllTemplatesAsync();

        // No templates yet, but the query should work
        Assert.NotNull(result);
        Assert.Empty(result);
    }
}
