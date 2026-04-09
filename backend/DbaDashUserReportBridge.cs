using System.Collections.Frozen;
using System.Data;
using System.Text.RegularExpressions;
using Microsoft.Data.SqlClient;

namespace DBADashWebView;

/// <summary>
/// Executes <c>UserReport</c> schema procedures only, gated by configuration allow-list (no wildcards).
/// </summary>
public static class DbaDashUserReportBridge
{
    private static readonly Regex SafeIdentifier = new("^[A-Za-z_][A-Za-z0-9_]*$", RegexOptions.Compiled);

    public static bool IsSafeProcedureName(string name) =>
        !string.IsNullOrEmpty(name) && SafeIdentifier.IsMatch(name);

    public static FrozenSet<string> ParseAllowList(string? csv)
    {
        if (string.IsNullOrWhiteSpace(csv))
            return Enumerable.Empty<string>().ToFrozenSet(StringComparer.OrdinalIgnoreCase);
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var part in csv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            if (!string.IsNullOrEmpty(part) && !part.Contains('*'))
                set.Add(part);
        }

        return set.ToFrozenSet(StringComparer.OrdinalIgnoreCase);
    }

    public static async Task<(bool exists, string? error)> ProcedureExistsInUserReportAsync(
        string connectionString, string procedureName, CancellationToken ct)
    {
        try
        {
            await using var cn = new SqlConnection(connectionString);
            await cn.OpenAsync(ct);
            await using var cmd = new SqlCommand(
                """
                SELECT 1
                FROM sys.procedures p
                INNER JOIN sys.schemas s ON p.schema_id = s.schema_id
                WHERE s.name = N'UserReport' AND p.name = @n
                """, cn) { CommandTimeout = 30 };
            cmd.Parameters.AddWithValue("@n", procedureName);
            var o = await cmd.ExecuteScalarAsync(ct);
            return (o != null && o != DBNull.Value, null);
        }
        catch (Exception ex)
        {
            return (false, ex.Message);
        }
    }

    public static async Task<(List<Dictionary<string, object?>> rows, string? error)> ExecuteReadAsync(
        string connectionString,
        string procedureName,
        FrozenSet<string> allowList,
        int commandTimeoutSeconds,
        IReadOnlyDictionary<string, object?> scalarParameters,
        CancellationToken ct)
    {
        if (!IsSafeProcedureName(procedureName))
            return ([], "Invalid procedure name.");
        if (allowList.Count == 0 || !allowList.Contains(procedureName))
            return ([], "Procedure is not on UserReport:AllowedProcedures.");

        try
        {
            await using var conn = new SqlConnection(connectionString);
            await conn.OpenAsync(ct);
            await using var cmd = new SqlCommand("[UserReport].[" + procedureName + "]", conn)
            {
                CommandType = CommandType.StoredProcedure,
                CommandTimeout = commandTimeoutSeconds,
            };

            foreach (var (name, value) in scalarParameters)
            {
                if (string.IsNullOrEmpty(name) || !name.StartsWith('@'))
                    continue;
                cmd.Parameters.AddWithValue(name, value ?? DBNull.Value);
            }

            await using var reader = await cmd.ExecuteReaderAsync(ct);
            var results = new List<Dictionary<string, object?>>();
            while (await reader.ReadAsync(ct))
            {
                var row = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
                for (var i = 0; i < reader.FieldCount; i++)
                {
                    if (reader.IsDBNull(i))
                    {
                        row[reader.GetName(i)] = null;
                        continue;
                    }

                    var val = reader.GetValue(i);
                    row[reader.GetName(i)] = val is byte[] bytes ? Convert.ToBase64String(bytes) : val;
                }

                results.Add(row);
            }

            return (results, null);
        }
        catch (Exception ex)
        {
            return ([], ex.Message);
        }
    }
}
