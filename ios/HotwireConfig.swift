import Foundation

// Replaces upstream Hotwire.swift / HotwireConfig.swift (see VENDOR.md). The vendored
// Turbo sources read only the members below; everything else in the upstream config
// concerns the Navigator and bridge components, which this package does not use.
public enum Hotwire {
  public static var config = HotwireConfig()
}

public struct HotwireConfig {
  public var pathConfiguration = PathConfiguration()

  /// How long a cross-origin redirect resolution may take before it is treated as failed.
  public var redirectResolutionTimeout: TimeInterval = 30

  public var debugLoggingEnabled = false {
    didSet { HotwireLogger.update(debugLoggingEnabled: debugLoggingEnabled, log: nil) }
  }
}

// Upstream's WebViewPolicyManager belongs to the Navigator. Session and SessionDelegate
// only use its nested Decision type, which is all that is provided here.
public final class WebViewPolicyManager {
  public enum Decision {
    case cancel
    case allow
  }
}
