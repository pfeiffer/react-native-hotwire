import Foundation

// Hotwire Native is built with SwiftPM upstream and loads turbo.js through
// `Bundle.module`, an accessor SwiftPM generates per package. CocoaPods has no such
// accessor, so this resolves the `Hotwired` resource bundle declared in
// RNHotwired.podspec. With static linking the bundle is copied into the app's main
// bundle; with dynamic frameworks it sits next to the framework binary.
extension Bundle {
  static let module: Bundle = {
    let hostBundle = Bundle(for: Session.self)
    let candidates = [hostBundle.resourceURL, Bundle.main.resourceURL]

    for directory in candidates {
      if let url = directory?.appendingPathComponent("Hotwired.bundle"),
         let bundle = Bundle(url: url) {
        return bundle
      }
    }

    fatalError("react-native-hotwired: Hotwired.bundle not found; check RNHotwired.podspec resource_bundles")
  }()
}
