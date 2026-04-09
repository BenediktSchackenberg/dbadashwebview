using System.Collections.Frozen;
using System.Data;
using System.Text.Json;
using Microsoft.Data.SqlClient;

namespace DBADashWebView;

/// <summary>
/// Invokes read-oriented dbo.* procedures from the official DBA Dash database (same as the Windows GUI).
/// Unknown procedure names are rejected. Optional empty dbo.IDs TVPs for filters used by many summary SPs.
/// </summary>
public static class DbaDashProcedureBridge
{
    /// <summary>Procedures that accept @DaysOfWeek and @Hours as dbo.IDS READONLY — pass empty tables if omitted.</summary>
    private static readonly FrozenSet<string> ExpectsDayHourTvp = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "dbo.BlockingSnapshots_Get",
        "dbo.WaitsSummary_Get",
    }.ToFrozenSet();

    /// <summary>Allow-list: same catalog the WinForms app calls (read / reporting SPs only).</summary>
    public static readonly FrozenSet<string> AllowedProcedures = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "dbo.Summary_Get",
        // RunningQueries_Get uses OUTPUT params — use /api/performance/running-queries-summary etc.
        "dbo.RunningQueriesSummary_Get",
        "dbo.RunningQueriesServerSummary_Get",
        "dbo.SessionWaits_Get",
        "dbo.SessionWaitsSummary_Get",
        "dbo.BlockingSnapshots_Get",
        "dbo.Waits_Get",
        "dbo.WaitsSummary_Get",
        "dbo.PerformanceSummary_Get",
        "dbo.PerformanceCounterSummary_Get",
        "dbo.IOSummary_Get",
        "dbo.SlowQueriesSummary_Get",
        "dbo.SlowQueriesDetail_Get",
        "dbo.ObjectExecutionStats_Get",
        "dbo.ObjectExecutionStatsSummary_Get",
        "dbo.JobStats_Get",
        "dbo.JobStatsSummary_Get",
        "dbo.JobTimeline_Get",
        "dbo.JobCategories_Get",
        "dbo.JobStep_Get",
        "dbo.JobSteps_Get",
        "dbo.Jobs_Get",
        "dbo.RunningJobs_Get",
        "dbo.MemoryUsage_Get",
        "dbo.MemoryClerkUsage_Get",
        "dbo.MemoryConfig_Get",
        "dbo.MemoryCounters_Get",
        "dbo.BackupSummary_Get",
        "dbo.DatabaseFinder_Get",
        "dbo.DBFiles_Get",
        "dbo.FileGroup_Get",
        "dbo.Drives_Get",
        "dbo.DBObjects_Get",
        "dbo.DDLHistoryForObject_Get",
        "dbo.Counters_Get",
        "dbo.InstanceInfo_Get",
        "dbo.InstanceUptimeThresholds_Get",
        "dbo.DatabasesByInstance_Get",
        "dbo.DatabasesAllInfo_Get",
        "dbo.DBSummary_Get",
        "dbo.DBOptionsHistory_Get",
        "dbo.DBConfiguration_Get",
        "dbo.DBConfigurationHistory_Get",
        "dbo.Configuration_Get",
        "dbo.SysConfigHistory_Get",
        "dbo.TraceFlags_Get",
        "dbo.TraceFlagHistory_Get",
        "dbo.SQLPatching_Get",
        "dbo.BuildReference_Get",
        "dbo.Hardware_Get",
        "dbo.HostUpgradeHistory_Get",
        "dbo.Drivers_Get",
        "dbo.Corruption_Get",
        "dbo.LastGoodCheckDB_Get",
        "dbo.CustomReport_Get",
        "dbo.CustomCheck_Get",
        "dbo.CustomCheckContext_Get",
        "dbo.CustomCheckTest_Get",
        "dbo.CustomChecksHistory_Get",
        "dbo.CustomTools_Get",
        "dbo.DatabaseQueryStoreOptions_Get",
        "dbo.DatabaseQueryStoreOptionsSummary_Get",
        "dbo.ResourceGovernorConfiguration_Get",
        "dbo.ResourceGovernorConfigurationHistory_Get",
        "dbo.ResourceGovernorResourcePools_Get",
        "dbo.ResourceGovernorResourcePoolsMetrics_Get",
        "dbo.AzureDBResourceGovernance_Get",
        "dbo.AzureDBPerformanceSummary_Get",
        "dbo.AzureDBPoolSummary_Get",
        "dbo.AlertsConfig_Get",
        "dbo.Alerts_Get",
        "dbo.OSLoadedModuleSummary_Get",
        "dbo.OfflineInstanceTimeline_Get",
        "dbo.AvailabilityGroupSummary_Get",
        "dbo.LogShippingSummary_Get",
        "dbo.DatabaseMirroringSummary_Get",
        "dbo.DDLSnapshotInstanceSummary_Get",
        "dbo.DDLSnapshots_Get",
        "dbo.DDLSnapshotDiff_Get",
        "dbo.DDLSnapshotDates_Get",
        "dbo.DatabaseDDLCompare_Get",
        "dbo.DBSchemaAtDate_Get",
        "dbo.DDL_Get",
        "dbo.InstancesWithDDLSnapshot_Get",
        "dbo.DatabasesWithDDLSnapshot_Get",
        "dbo.ObjectType_Get",
        "dbo.QueryPlan_Get",
        "dbo.CPU_Get",
        "dbo.PerformanceCounter_Get",
        "dbo.AgentJobs_Get",
        "dbo.PlanForcingLog_Get",
        "dbo.Job_Diff",
        "dbo.ResourceGovernorWorkloadGroups_Get",
        "dbo.ResourceGovernorWorkloadGroupsMetrics_Get",
        "dbo.LogShipping_Get",
        "dbo.DatabaseMirroring_Get",
        "dbo.DataRetention_Get",
        "dbo.DriveSnapshot_Get",
        "dbo.DBSpace_Get",
        "dbo.DBFileSnapshot_Get",
        "dbo.CollectionDates_Get",
        "dbo.CollectionErrorLog_Get",
        "dbo.MemoryDumpThresholds_Get",
        "dbo.BackupThresholds_Get",
        "dbo.OSLoadedModules_Get",
        "dbo.OSLoadedModulesStatus_Get",
        "dbo.TagReport_Get",
        "dbo.TempDBConfig_Get",
    }.ToFrozenSet();

    /// <summary>Mutating procedures (ack / update). Only invokable when Repository:AllowMutatingStoredProcedures is true.</summary>
    public static readonly FrozenSet<string> MutatingAllowedProcedures = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
    {
        "dbo.InstanceUptimeAck",
        "dbo.Corruption_Ack",
        "dbo.AcknowledgeErrors",
        "dbo.AcknowledgeMemoryDumps",
        "dbo.PlanForcingLog_Add",
        "dbo.PlanForcingLog_Upd",
        "dbo.InstanceTags_Add",
        "dbo.InstanceTags_Del",
        "dbo.AlertThresholds_Upd",
        "dbo.DBFileThresholds_Upd",
        "dbo.InstanceUptimeThresholds_Upd",
        "dbo.MemoryDumpThresholds_Upd",
        "dbo.OSLoadedModulesStatus_Del",
        "dbo.OSLoadedModulesStatus_Add",
        "dbo.OSLoadedModulesStatus_Upd",
        "dbo.OSLoadedModules_RefreshStatus",
        "dbo.CustomReport_Upd",
        "dbo.BackupThresholds_Upd",
    }.ToFrozenSet();

    public static bool IsAllowed(string procedure) =>
        !string.IsNullOrWhiteSpace(procedure) && AllowedProcedures.Contains(procedure.Trim());

    public static bool IsMutatingAllowed(string procedure) =>
        !string.IsNullOrWhiteSpace(procedure) && MutatingAllowedProcedures.Contains(procedure.Trim());

    public static DataTable EmptyIdsTable()
    {
        var t = new DataTable();
        t.Columns.Add("ID", typeof(int));
        return t;
    }

    public static async Task<(List<Dictionary<string, object?>> rows, string? error)> ExecuteReadAsync(
        string connectionString,
        string procedure,
        int commandTimeoutSeconds,
        IReadOnlyDictionary<string, object?> scalarParameters,
        bool addEmptyDayHourTvpIfNeeded,
        IReadOnlyDictionary<string, IReadOnlyList<int>>? tvpIdParameters = null,
        CancellationToken ct = default)
    {
        if (!IsAllowed(procedure))
            return ([], "Procedure is not on the allow-list.");

        try
        {
            await using var conn = new SqlConnection(connectionString);
            await conn.OpenAsync(ct);
            await using var cmd = new SqlCommand(procedure, conn)
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

            if (tvpIdParameters != null)
            {
                foreach (var (paramName, ids) in tvpIdParameters)
                {
                    if (ids == null || ids.Count == 0)
                        continue;
                    var name = paramName.StartsWith('@') ? paramName : "@" + paramName;
                    var t = new DataTable();
                    t.Columns.Add("ID", typeof(int));
                    foreach (var i in ids)
                        t.Rows.Add(i);
                    var p = cmd.Parameters.Add(name, SqlDbType.Structured);
                    p.TypeName = "dbo.IDs";
                    p.Value = t;
                }
            }

            var needsTvp = addEmptyDayHourTvpIfNeeded && ExpectsDayHourTvp.Contains(procedure);
            if (needsTvp)
            {
                var empty = EmptyIdsTable();
                var p1 = cmd.Parameters.Add("@DaysOfWeek", SqlDbType.Structured);
                p1.TypeName = "dbo.IDs";
                p1.Value = empty;

                var p2 = cmd.Parameters.Add("@Hours", SqlDbType.Structured);
                p2.TypeName = "dbo.IDs";
                p2.Value = empty;
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

    public static async Task<(int rowsAffected, string? error)> ExecuteNonQueryAsync(
        string connectionString,
        string procedure,
        int commandTimeoutSeconds,
        IReadOnlyDictionary<string, object?> scalarParameters,
        CancellationToken ct = default)
    {
        if (!IsMutatingAllowed(procedure))
            return (0, "Procedure is not on the mutating allow-list.");

        try
        {
            await using var conn = new SqlConnection(connectionString);
            await conn.OpenAsync(ct);
            await using var cmd = new SqlCommand(procedure, conn)
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

            var n = await cmd.ExecuteNonQueryAsync(ct);
            return (n, null);
        }
        catch (Exception ex)
        {
            return (0, ex.Message);
        }
    }

    /// <summary>Parse POST body: { "procedure": "dbo.X_Get", "timeoutSeconds": 120, "parameters": { "@Id": 1 }, "addEmptyDayHourTvp": true }</summary>
    public static bool TryParseParameters(JsonElement parametersObject, out Dictionary<string, object?> scalars)
    {
        scalars = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        if (parametersObject.ValueKind is not JsonValueKind.Object)
            return true;

        foreach (var prop in parametersObject.EnumerateObject())
        {
            var name = prop.Name;
            if (!name.StartsWith('@'))
                name = "@" + name;
            scalars[name] = JsonElementToClr(prop.Value);
        }

        return true;
    }

    public static object? JsonElementToClr(JsonElement el) => el.ValueKind switch
    {
        JsonValueKind.Null => null,
        JsonValueKind.True => true,
        JsonValueKind.False => false,
        JsonValueKind.String => el.GetString(),
        JsonValueKind.Number => el.TryGetInt64(out var l) ? l : el.GetDouble(),
        _ => el.GetRawText(),
    };
}
