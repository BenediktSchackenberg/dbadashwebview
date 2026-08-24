using DBADashWebView.Endpoints;
using Xunit;

namespace DBADashWebView.Tests;

public sealed class TagsEndpointMappingsTests
{
    private static Dictionary<string, object?> Row(int tagId, string tagName, string? tagValue, int instanceId) =>
        new()
        {
            ["TagID"] = tagId,
            ["TagName"] = tagName,
            ["TagValue"] = tagValue,
            ["InstanceID"] = instanceId,
        };

    [Fact]
    public void BuildTagRows_GroupsMultipleInstancesUnderOneTag()
    {
        var rows = new List<Dictionary<string, object?>>
        {
            Row(1, "prod", "", 10),
            Row(1, "prod", "", 11),
            Row(1, "prod", "", 12),
        };

        var result = TagsEndpointMappings.BuildTagRows(rows, allowedInstanceIds: null);

        var tag = Assert.Single(result);
        Assert.Equal(1, tag.TagId);
        Assert.Equal("prod", tag.TagName);
        Assert.Equal(new[] { 10, 11, 12 }, tag.InstanceIds);
    }

    [Fact]
    public void BuildTagRows_TagNameStartingWithBrace_IsSystem()
    {
        var rows = new List<Dictionary<string, object?>>
        {
            Row(1, "{Version}", "2019", 10),
            Row(2, "prod", "", 10),
        };

        var result = TagsEndpointMappings.BuildTagRows(rows, allowedInstanceIds: null);

        Assert.True(result.Single(t => t.TagId == 1).IsSystem);
        Assert.False(result.Single(t => t.TagId == 2).IsSystem);
    }

    [Fact]
    public void BuildTagRows_NullScope_IncludesAllInstances()
    {
        var rows = new List<Dictionary<string, object?>>
        {
            Row(1, "prod", "", 10),
            Row(1, "prod", "", 20),
        };

        var result = TagsEndpointMappings.BuildTagRows(rows, allowedInstanceIds: null);

        Assert.Equal(new[] { 10, 20 }, Assert.Single(result).InstanceIds);
    }

    [Fact]
    public void BuildTagRows_ScopedInstances_FiltersOutDisallowedInstances()
    {
        var rows = new List<Dictionary<string, object?>>
        {
            Row(1, "prod", "", 10),
            Row(1, "prod", "", 20),
        };
        var allowed = new HashSet<int> { 10 };

        var result = TagsEndpointMappings.BuildTagRows(rows, allowed);

        Assert.Equal(new[] { 10 }, Assert.Single(result).InstanceIds);
    }

    [Fact]
    public void BuildTagRows_TagWithNoInstancesLeftAfterScoping_IsDropped()
    {
        var rows = new List<Dictionary<string, object?>>
        {
            Row(1, "prod", "", 10),
            Row(2, "dev", "", 20),
        };
        var allowed = new HashSet<int> { 10 };

        var result = TagsEndpointMappings.BuildTagRows(rows, allowed);

        var tag = Assert.Single(result);
        Assert.Equal(1, tag.TagId);
    }

    [Fact]
    public void BuildTagRows_OrdersSystemTagsAfterUserTags_ThenAlphabetically()
    {
        var rows = new List<Dictionary<string, object?>>
        {
            Row(1, "{Version}", "2019", 10),
            Row(2, "web", "", 10),
            Row(3, "app", "", 10),
        };

        var result = TagsEndpointMappings.BuildTagRows(rows, allowedInstanceIds: null);

        Assert.Equal(new[] { "app", "web", "{Version}" }, result.Select(t => t.TagName));
    }
}
