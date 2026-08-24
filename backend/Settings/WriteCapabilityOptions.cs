namespace DBADashWebView.Settings;

/// <summary>
/// Opt-in write capabilities.
///
/// WebView is documented and provisioned as <c>db_datareader</c> on DBADashDB, so
/// every feature that writes stays off unless an operator both enables it here and
/// grants the extra EXECUTE permissions listed in the README. Without that, the UI
/// would offer buttons that can only ever fail with a permission error.
/// </summary>
public sealed class WriteCapabilityOptions
{
    public const string SectionName = "WriteCapabilities";

    /// <summary>
    /// Enables alert acknowledge / close / notes. Requires EXECUTE on
    /// <c>Alert.ActiveAlertsAck_Upd</c>, <c>Alert.ClosedAlerts_Add</c> and
    /// <c>Alert.Alerts_Notes_Upd</c>.
    /// </summary>
    public bool AlertLifecycle { get; set; }
}
