using System.Data;
using DBADashWebView.Endpoints;
using Microsoft.Data.SqlClient;
using Microsoft.Data.SqlClient.Server;
using Xunit;

namespace DBADashWebView.Tests;

public sealed class AlertsEndpointMappingsTests
{
    [Theory]
    [InlineData(208, "Invalid object name 'Alert.ActiveAlerts_Get'.", true)]
    [InlineData(2812, "Could not find stored procedure 'Alert.ClosedAlerts_Add'.", true)]
    [InlineData(208, "Invalid object name 'dbo.SomeOtherTable'.", false)]
    [InlineData(547, "The INSERT statement conflicted with Alert.FK_ActiveAlerts_Rules", false)]
    public void IsMissingAlertSchema_DetectsMissingAlertObjectsOnly(int errorNumber, string message, bool expected)
    {
        Assert.Equal(expected, AlertsEndpointMappings.IsMissingAlertSchema(errorNumber, message));
    }

    [Fact]
    public void BuildIntIdsParameter_UsesDboIDsType()
    {
        var parameter = AlertsEndpointMappings.BuildIntIdsParameter("@InstanceIDs", new HashSet<int> { 1, 2, 3 });

        Assert.Equal(SqlDbType.Structured, parameter.SqlDbType);
        Assert.Equal("dbo.IDs", parameter.TypeName);
        Assert.Equal("@InstanceIDs", parameter.ParameterName);
    }

    [Fact]
    public void BuildIntIdsParameter_RoundTripsValues()
    {
        var parameter = AlertsEndpointMappings.BuildIntIdsParameter("@InstanceIDs", new HashSet<int> { 5, 9 });

        var records = Assert.IsAssignableFrom<IEnumerable<SqlDataRecord>>(parameter.Value).ToList();
        var values = records.Select(r => r.GetInt32(0)).OrderBy(v => v).ToArray();

        Assert.Equal(new[] { 5, 9 }, values);
    }

    [Fact]
    public void BuildIntIdsParameter_NullOrEmptySet_SendsNullValue()
    {
        // SqlClient throws ("There are no records in the SqlDataRecord enumeration...")
        // if a structured parameter is given an empty IEnumerable<SqlDataRecord> instead
        // of null for a zero-row table-valued parameter.
        var parameter = AlertsEndpointMappings.BuildIntIdsParameter("@InstanceIDs", null);

        Assert.Null(parameter.Value);
    }

    [Fact]
    public void BuildBigIntIdsParameter_UsesDboBigIDsType()
    {
        var parameter = AlertsEndpointMappings.BuildBigIntIdsParameter("@AlertIDs", new long[] { 100L });

        Assert.Equal(SqlDbType.Structured, parameter.SqlDbType);
        Assert.Equal("dbo.BigIDs", parameter.TypeName);
    }

    [Fact]
    public void BuildBigIntIdsParameter_EmptyInput_SendsNullValue()
    {
        var parameter = AlertsEndpointMappings.BuildBigIntIdsParameter("@AlertIDs", Array.Empty<long>());

        Assert.Null(parameter.Value);
    }

    [Fact]
    public void BuildBigIntIdsParameter_DedupesInput()
    {
        var parameter = AlertsEndpointMappings.BuildBigIntIdsParameter("@AlertIDs", new long[] { 7L, 7L, 8L });

        var records = Assert.IsAssignableFrom<IEnumerable<SqlDataRecord>>(parameter.Value).ToList();
        var values = records.Select(r => r.GetInt64(0)).OrderBy(v => v).ToArray();

        Assert.Equal(new[] { 7L, 8L }, values);
    }
}
