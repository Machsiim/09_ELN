using eln.Backend.Application.DTOs;
using Xunit;

namespace eln.Backend.Tests.DTOs;

public class PaginationParamsTests
{
    [Theory]
    [InlineData(0, 1)]
    [InlineData(-5, 1)]
    [InlineData(1, 1)]
    [InlineData(5, 5)]
    [InlineData(999, 999)]
    public void Page_NegativeOrZero_ClampedToOne(int input, int expected)
    {
        var p = new PaginationParams { Page = input };
        Assert.Equal(expected, p.Page);
    }

    [Theory]
    [InlineData(1, 1)]
    [InlineData(20, 20)]
    [InlineData(100, 100)]
    [InlineData(101, 100)]
    [InlineData(1000, 100)]
    [InlineData(0, 1)]
    [InlineData(-5, 1)]
    public void PageSize_OutsideRange_ClampedToValidValue(int input, int expected)
    {
        var p = new PaginationParams { PageSize = input };
        Assert.Equal(expected, p.PageSize);
    }

    [Fact]
    public void Defaults_AreSensible()
    {
        var p = new PaginationParams();
        Assert.Equal(1, p.Page);
        Assert.Equal(20, p.PageSize);
    }
}

public class PagedResultDtoTests
{
    [Theory]
    [InlineData(0, 20, 0)]
    [InlineData(1, 20, 1)]
    [InlineData(20, 20, 1)]
    [InlineData(21, 20, 2)]
    [InlineData(100, 20, 5)]
    [InlineData(101, 20, 6)]
    [InlineData(50, 10, 5)]
    [InlineData(51, 10, 6)]
    public void TotalPages_CalculatedCorrectly(int total, int pageSize, int expected)
    {
        var dto = new PagedResultDto<string>
        {
            Total = total,
            PageSize = pageSize
        };

        Assert.Equal(expected, dto.TotalPages);
    }

    [Fact]
    public void TotalPages_ZeroPageSize_ReturnsZero()
    {
        var dto = new PagedResultDto<string> { Total = 100, PageSize = 0 };
        Assert.Equal(0, dto.TotalPages);
    }
}
