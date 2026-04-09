using System.Data;
using System.IO.Compression;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Xml;
using Microsoft.Data.SqlClient;

namespace DBADashWebView;

/// <summary>
/// Sends the same compressed JSON payloads the WinForms app sends via <c>Messaging.SendMessageFromGUIToService</c>,
/// then reads replies from <c>Messaging.ReceiveReplyFromServiceToGUI</c>. Requires DBA Dash collectors with messaging enabled.
/// </summary>
public static class DbaDashMessaging
{
    private static readonly JsonSerializerOptions PayloadJsonOptions = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = null,
    };

    public const string ReplyMessageType = "//dbadash.com/DBADashService/Reply";
    public const string EndDialogMessageType = "http://schemas.microsoft.com/SQL/ServiceBroker/EndDialog";
    public const string ErrorMessageType = "http://schemas.microsoft.com/SQL/ServiceBroker/Error";

    /// <summary>Names aligned with <c>ProcedureExecutionMessage.CommunityProcs</c> in DBA Dash.</summary>
    public static readonly HashSet<string> CommunityProcedureNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "sp_WhoIsActive", "sp_Blitz", "sp_BlitzFirst", "sp_BlitzIndex", "sp_BlitzCache", "sp_BlitzWho",
        "sp_LogHunter", "sp_PressureDetector", "sp_BlitzLock", "sp_BlitzBackups", "sp_HumanEvents",
        "sp_HealthParser", "sp_QuickieStore", "sp_HumanEventsBlockViewer", "sp_SrvPermissions",
        "sp_DBPermissions", "sp_IndexCleanup",
    };

    public static byte[] GZipCompressUtf8(string text)
    {
        var raw = Encoding.UTF8.GetBytes(text);
        using var msOut = new MemoryStream();
        using (var gz = new GZipStream(msOut, CompressionMode.Compress, leaveOpen: true))
        {
            gz.Write(raw, 0, raw.Length);
        }

        return msOut.ToArray();
    }

    public static string GZipDecompressToUtf8(byte[] data)
    {
        using var msIn = new MemoryStream(data);
        using var gz = new GZipStream(msIn, CompressionMode.Decompress);
        using var msOut = new MemoryStream();
        gz.CopyTo(msOut);
        return Encoding.UTF8.GetString(msOut.ToArray());
    }

    public sealed class InstanceMessagingRow
    {
        public int InstanceId { get; init; }
        public string ConnectionId { get; init; } = "";
        public int? CollectAgentId { get; init; }
        public int? ImportAgentId { get; init; }
        public bool MessagingEnabled { get; init; }
    }

    public static async Task<InstanceMessagingRow?> GetInstanceMessagingAsync(string connectionString, int instanceId, CancellationToken ct)
    {
        await using var cn = new SqlConnection(connectionString);
        await cn.OpenAsync(ct);
        await using var cmd = new SqlCommand(
            """
            SELECT i.InstanceID, i.ConnectionID, i.CollectAgentID, i.ImportAgentID,
                   CAST(CASE WHEN ia.MessagingEnabled = 1 AND ca.MessagingEnabled = 1 THEN 1 ELSE 0 END AS BIT) AS MessagingEnabled
            FROM dbo.Instances i
            LEFT JOIN dbo.DBADashAgent ia ON i.ImportAgentID = ia.DBADashAgentID
            LEFT JOIN dbo.DBADashAgent ca ON i.CollectAgentID = ca.DBADashAgentID
            WHERE i.InstanceID = @id
            """, cn) { CommandTimeout = 30 };
        cmd.Parameters.AddWithValue("@id", instanceId);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return null;
        return new InstanceMessagingRow
        {
            InstanceId = r.GetInt32(0),
            ConnectionId = r.GetString(1),
            CollectAgentId = r.IsDBNull(2) ? null : r.GetInt32(2),
            ImportAgentId = r.IsDBNull(3) ? null : r.GetInt32(3),
            MessagingEnabled = !r.IsDBNull(4) && r.GetBoolean(4),
        };
    }

    public sealed class AgentDto
    {
        public string? AgentServiceName { get; set; }
        public string? AgentHostName { get; set; }
        public string? AgentPath { get; set; }
        public string? AgentVersion { get; set; }
        public string? ServiceSQSQueueUrl { get; set; }
        public bool MessagingEnabled { get; set; }
        public string? AllowedScriptsCSV { get; set; }
        public string? AllowedCustomProcsCSV { get; set; }
        public string? S3Path { get; set; }
    }

    public static async Task<AgentDto?> GetAgentDtoAsync(string connectionString, int agentId, CancellationToken ct)
    {
        await using var cn = new SqlConnection(connectionString);
        await cn.OpenAsync(ct);
        await using var cmd = new SqlCommand("dbo.DBADashAgent_Get", cn) { CommandType = CommandType.StoredProcedure, CommandTimeout = 30 };
        cmd.Parameters.AddWithValue("DBADashAgentID", agentId);
        await using var r = await cmd.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct)) return null;
        return new AgentDto
        {
            AgentServiceName = r["AgentServiceName"]?.ToString(),
            AgentHostName = r["AgentHostName"]?.ToString(),
            AgentPath = r["AgentPath"]?.ToString(),
            AgentVersion = r["AgentVersion"]?.ToString(),
            ServiceSQSQueueUrl = r["ServiceSQSQueueURL"]?.ToString(),
            S3Path = r["S3Path"] == DBNull.Value ? null : r["S3Path"]?.ToString(),
            MessagingEnabled = r["MessagingEnabled"] != DBNull.Value && (bool)r["MessagingEnabled"],
            AllowedScriptsCSV = r["AllowedScripts"]?.ToString() ?? "",
            AllowedCustomProcsCSV = r["AllowedCustomProcs"]?.ToString() ?? "",
        };
    }

    public sealed class CustomParamDto
    {
        public string SerializedParam { get; set; } = "";
        public bool UseDefaultValue { get; set; }
    }

    public sealed class ProcedureExecutionPayload
    {
        public Guid Id { get; set; }
        public DateTime Created { get; set; }
        public int Lifetime { get; set; }
        public AgentDto CollectAgent { get; set; } = new();
        public AgentDto ImportAgent { get; set; } = new();
        public string ConnectionID { get; set; } = "";
        public string ProcedureName { get; set; } = "";
        public string SchemaName { get; set; } = "dbo";
        public List<CustomParamDto> Parameters { get; set; } = new();
    }

    public static string BuildSerializedParam(string parameterName, string dbType, object? value, bool isNull, ParameterDirection direction = ParameterDirection.Input)
    {
        var pn = parameterName.StartsWith('@') ? parameterName : "@" + parameterName;
        var node = new JsonObject
        {
            ["ParameterName"] = pn,
            ["DbType"] = dbType,
            ["IsNull"] = isNull,
            ["Direction"] = direction.ToString(),
        };
        if (isNull || value == null)
            node["Value"] = null;
        else
            node["Value"] = JsonSerializer.SerializeToNode(value);
        return node.ToJsonString();
    }

    public sealed class MessagingResult
    {
        public List<MessagingProgressDto> Progress { get; } = new();
        public string? Error { get; set; }
        public List<DataTableJson> ResultSets { get; set; } = new();
        public bool UsedS3DataPath { get; set; }
    }

    public sealed class MessagingProgressDto
    {
        public string? Message { get; set; }
    }

    public sealed class DataTableJson
    {
        public string Name { get; set; } = "";
        public List<Dictionary<string, object?>> Rows { get; set; } = new();
    }

    public static List<DataTableJson> DataSetToResult(DataSet? ds)
    {
        var list = new List<DataTableJson>();
        if (ds == null) return list;
        for (var i = 0; i < ds.Tables.Count; i++)
        {
            var t = ds.Tables[i];
            var name = string.IsNullOrEmpty(t.TableName) ? "Table" + i : t.TableName;
            var rows = new List<Dictionary<string, object?>>();
            foreach (DataRow r in t.Rows)
            {
                var d = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
                foreach (DataColumn c in t.Columns)
                {
                    var v = r[c];
                    if (v is DBNull or null)
                        d[c.ColumnName] = null;
                    else if (v is byte[] b)
                        d[c.ColumnName] = Convert.ToBase64String(b);
                    else
                        d[c.ColumnName] = v;
                }

                rows.Add(d);
            }

            list.Add(new DataTableJson { Name = name, Rows = rows });
        }

        return list;
    }

    public static async Task<MessagingResult> SendProcedureExecutionAndWaitAsync(
        string repositoryConnectionString,
        string procedureExecutionMessageAssemblyQualifiedType,
        int importAgentId,
        string connectionId,
        AgentDto collectAgent,
        AgentDto importAgent,
        string schemaName,
        string procedureName,
        IReadOnlyList<CustomParamDto>? parameters,
        int lifetimeSeconds,
        CancellationToken ct)
    {
        var result = new MessagingResult();
        var messageGroup = Guid.NewGuid();
        var created = DateTime.UtcNow;
        var body = new ProcedureExecutionPayload
        {
            Id = messageGroup,
            Created = created,
            Lifetime = lifetimeSeconds,
            CollectAgent = collectAgent,
            ImportAgent = importAgent,
            ConnectionID = connectionId,
            ProcedureName = procedureName,
            SchemaName = string.IsNullOrEmpty(schemaName) ? "dbo" : schemaName,
            Parameters = parameters?.ToList() ?? new List<CustomParamDto>(),
        };
        var json = JsonSerializer.Serialize(body, PayloadJsonOptions);
        var rootNode = JsonNode.Parse(json)!.AsObject();
        rootNode["__type"] = procedureExecutionMessageAssemblyQualifiedType;
        var finalJson = rootNode.ToJsonString(PayloadJsonOptions);
        var payload = GZipCompressUtf8(finalJson);

        await using (var cn = new SqlConnection(repositoryConnectionString))
        {
            await cn.OpenAsync(ct);
            await using var send = new SqlCommand("Messaging.SendMessageFromGUIToService", cn)
            { CommandType = CommandType.StoredProcedure, CommandTimeout = 60 };
            send.Parameters.AddWithValue("@Payload", payload);
            send.Parameters.AddWithValue("@InitDlgHandle", Guid.NewGuid());
            send.Parameters.AddWithValue("@ConversationGroup", messageGroup);
            send.Parameters.AddWithValue("@DBADashAgentID", importAgentId);
            send.Parameters.AddWithValue("@Lifetime", lifetimeSeconds);
            await send.ExecuteNonQueryAsync(ct);
        }

        var deadline = DateTime.UtcNow.AddSeconds(Math.Max(lifetimeSeconds, 30) + 120);
        DataSet? successData = null;
        while (DateTime.UtcNow < deadline)
        {
            ct.ThrowIfCancellationRequested();
            BrokerResponse reply;
            try
            {
                reply = await ReceiveReplyFromBrokerAsync(repositoryConnectionString, messageGroup,
                    Math.Min(60_000, (int)(deadline - DateTime.UtcNow).TotalMilliseconds), ct);
            }
            catch (Exception ex)
            {
                result.Error = ex.Message;
                return result;
            }

            switch (reply.Type)
            {
                case ErrorMessageType:
                {
                    var msg = reply.Payload is { Length: > 0 }
                        ? Encoding.Unicode.GetString(reply.Payload)
                        : "Service Broker error";
                    await EndConversationSafeAsync(repositoryConnectionString, reply.Handle, ct);
                    result.Error = msg;
                    return result;
                }
                case EndDialogMessageType:
                    await EndConversationSafeAsync(repositoryConnectionString, reply.Handle, ct);
                    result.ResultSets = DataSetToResult(successData);
                    return result;
                case ReplyMessageType:
                {
                    var rm = DeserializeResponseMessage(reply.Payload);
                    if (rm == null)
                    {
                        result.Error = "Invalid reply payload";
                        return result;
                    }

                    switch (rm.Type)
                    {
                        case 0: // Progress
                            result.Progress.Add(new MessagingProgressDto { Message = rm.Message });
                            break;
                        case 1: // Failure
                            result.Error = rm.Message ?? "Failure";
                            if (!string.IsNullOrEmpty(rm.ExceptionMessage))
                                result.Error += " — " + rm.ExceptionMessage;
                            return result;
                        case 2: // Success
                            if (!string.IsNullOrEmpty(rm.MessageDataPath))
                            {
                                result.UsedS3DataPath = true;
                                result.Error =
                                    "Result set was stored in S3 (large payload). Download is not implemented in the web API; use the Windows GUI for this report.";
                                return result;
                            }

                            successData = rm.DecodeDataSet();
                            break;
                        case 3: // EndConversation
                            result.ResultSets = DataSetToResult(successData);
                            return result;
                    }

                    break;
                }
                default:
                    result.Error = "Unknown broker message type: " + reply.Type;
                    return result;
            }
        }

        result.Error = "Timed out waiting for messaging reply.";
        return result;
    }

    private sealed class ParsedReply
    {
        public int Type { get; set; }
        public string? Message { get; set; }
        public string? MessageDataPath { get; set; }
        public string? DataString { get; set; }
        public string? ExceptionMessage { get; set; }

        public DataSet? DecodeDataSet()
        {
            if (string.IsNullOrEmpty(DataString)) return null;
            var ds = new DataSet();
            using var sr = new StringReader(DataString);
            ds.ReadXml(sr, XmlReadMode.ReadSchema);
            return ds;
        }
    }

    private static ParsedReply? DeserializeResponseMessage(byte[]? compressed)
    {
        if (compressed == null || compressed.Length == 0) return null;
        var json = GZipDecompressToUtf8(compressed);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;
        if (!root.TryGetProperty("Type", out var typeEl) || typeEl.ValueKind != JsonValueKind.Number)
            return null;
        var pr = new ParsedReply { Type = typeEl.GetInt32() };
        if (root.TryGetProperty("Message", out var msgEl) && msgEl.ValueKind == JsonValueKind.String)
            pr.Message = msgEl.GetString();
        if (root.TryGetProperty("MessageDataPath", out var mdp) && mdp.ValueKind == JsonValueKind.String)
            pr.MessageDataPath = mdp.GetString();
        if (root.TryGetProperty("DataString", out var dsEl) && dsEl.ValueKind == JsonValueKind.String)
            pr.DataString = dsEl.GetString();
        if (root.TryGetProperty("Exception", out var exEl) && exEl.ValueKind == JsonValueKind.Object &&
            exEl.TryGetProperty("Message", out var exm) && exm.ValueKind == JsonValueKind.String)
            pr.ExceptionMessage = exm.GetString();
        return pr;
    }

    private readonly struct BrokerResponse
    {
        public Guid Handle { get; init; }
        public string Type { get; init; }
        public byte[]? Payload { get; init; }
    }

    private static async Task<BrokerResponse> ReceiveReplyFromBrokerAsync(
        string connectionString, Guid conversationGroup, int timeoutMs, CancellationToken ct)
    {
        await using var cn = new SqlConnection(connectionString);
        await cn.OpenAsync(ct);
        await using var cmd = new SqlCommand("Messaging.ReceiveReplyFromServiceToGUI", cn)
        { CommandType = CommandType.StoredProcedure, CommandTimeout = 0 };
        cmd.Parameters.AddWithValue("@ConversationGroupID", conversationGroup);
        cmd.Parameters.AddWithValue("@Timeout", timeoutMs);
        await using var rdr = await cmd.ExecuteReaderAsync(ct);
        if (!await rdr.ReadAsync(ct))
            throw new InvalidOperationException("No reply from Messaging.ReceiveReplyFromServiceToGUI (timeout or empty).");
        return new BrokerResponse
        {
            Handle = (Guid)rdr["conversation_handle"],
            Type = (string)rdr["message_type_name"],
            Payload = rdr["message_body"] == DBNull.Value ? null : (byte[])rdr["message_body"],
        };
    }

    private static async Task EndConversationSafeAsync(string connectionString, Guid handle, CancellationToken ct)
    {
        try
        {
            await using var cn = new SqlConnection(connectionString);
            await cn.OpenAsync(ct);
            await using var cmd = new SqlCommand("END CONVERSATION @handle", cn) { CommandTimeout = 30 };
            cmd.Parameters.AddWithValue("@handle", handle);
            await cmd.ExecuteNonQueryAsync(ct);
        }
        catch
        {
            /* best-effort */
        }
    }
}
