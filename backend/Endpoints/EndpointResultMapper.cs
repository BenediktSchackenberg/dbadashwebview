using Microsoft.Data.SqlClient;

namespace DBADashWebView.Endpoints;

internal static class EndpointResultMapper
{
    public static async Task<List<Dictionary<string, object?>>> ReadRowsAsync(
        SqlCommand command,
        CancellationToken cancellationToken,
        bool camelCase = false)
    {
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var results = new List<Dictionary<string, object?>>();

        while (await reader.ReadAsync(cancellationToken))
        {
            var row = new Dictionary<string, object?>();
            for (var index = 0; index < reader.FieldCount; index++)
            {
                var key = reader.GetName(index);
                row[camelCase ? ToCamelCase(key) : key] = reader.IsDBNull(index) ? null : reader.GetValue(index);
            }

            results.Add(row);
        }

        return results;
    }

    public static string ToCamelCase(string value) =>
        string.IsNullOrEmpty(value) ? value : char.ToLowerInvariant(value[0]) + value[1..];
}
