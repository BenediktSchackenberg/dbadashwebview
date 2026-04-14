using System.Data;
using Microsoft.Data.SqlClient;

namespace DBADashWebView.Data;

public sealed class SqlDataService
{
    private readonly string _connectionString;

    public SqlDataService(IConfiguration configuration)
    {
        _connectionString = configuration.GetConnectionString("DBADashDB") ?? string.Empty;
    }

    public Task<List<Dictionary<string, object?>>> QueryAsync(string sql, params (string name, object? value)[] parameters) =>
        QueryAsync(sql, CancellationToken.None, parameters);

    public async Task<List<Dictionary<string, object?>>> QueryAsync(
        string sql,
        CancellationToken cancellationToken,
        params (string name, object? value)[] parameters)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new SqlCommand(sql, connection) { CommandTimeout = 30 };
        AddParameters(command, parameters);
        return await ReadRowsAsync(command, cancellationToken);
    }

    public Task<List<Dictionary<string, object?>>> SpAsync(string procedure, params (string name, object? value)[] parameters) =>
        SpAsync(procedure, CancellationToken.None, parameters);

    public async Task<List<Dictionary<string, object?>>> SpAsync(
        string procedure,
        CancellationToken cancellationToken,
        params (string name, object? value)[] parameters)
    {
        await using var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        await using var command = new SqlCommand(procedure, connection)
        {
            CommandType = CommandType.StoredProcedure,
            CommandTimeout = 30
        };
        AddParameters(command, parameters);
        return await ReadRowsAsync(command, cancellationToken);
    }

    public async Task<SqlConnection> OpenConnectionAsync(CancellationToken cancellationToken = default)
    {
        var connection = new SqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        return connection;
    }

    private static void AddParameters(SqlCommand command, IEnumerable<(string name, object? value)> parameters)
    {
        foreach (var (name, value) in parameters)
        {
            command.Parameters.AddWithValue(name, value ?? DBNull.Value);
        }
    }

    private static async Task<List<Dictionary<string, object?>>> ReadRowsAsync(SqlCommand command, CancellationToken cancellationToken)
    {
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        var results = new List<Dictionary<string, object?>>();
        while (await reader.ReadAsync(cancellationToken))
        {
            var row = new Dictionary<string, object?>();
            for (var index = 0; index < reader.FieldCount; index++)
            {
                row[reader.GetName(index)] = reader.IsDBNull(index) ? null : reader.GetValue(index);
            }

            results.Add(row);
        }

        return results;
    }
}
