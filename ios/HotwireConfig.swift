import Foundation

// Replaces upstream Hotwire.swift / HotwireConfig.swift (see VENDOR.md). The vendored
// Turbo sources only read `Hotwire.config.pathConfiguration`; everything else in the
// upstream config concerns the Navigator and bridge components, which this package
// does not use.
public enum Hotwire {
  public static var config = HotwireConfig()
}

public struct HotwireConfig {
  public var pathConfiguration = PathConfiguration()

  public var debugLoggingEnabled = false {
    didSet { HotwireLogger.debugLoggingEnabled = debugLoggingEnabled }
  }
}
