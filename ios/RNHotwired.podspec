require 'json'

package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

# Lives under ios/ because Expo autolinking only discovers podspecs in top-level
# subdirectories of a package; a root podspec is linked by React Native as a plain
# pod and the module is never registered.
Pod::Spec.new do |s|
  s.name           = 'RNHotwired'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = package['license']
  s.author         = 'Mattias Pfeiffer'
  s.homepage       = 'https://github.com/pfeiffer/react-native-hotwired'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/pfeiffer/react-native-hotwired.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Our adapter plus the vendored Hotwire Native sources under Vendor/ (see VENDOR.md).
  s.source_files = '**/*.swift'

  # Hotwire Native loads turbo.js through `Bundle.module`, which SwiftPM generates.
  # Bundle+Module.swift resolves it to this resource bundle instead.
  s.resource_bundles = {
    'Hotwired' => ['Vendor/**/*.js']
  }

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
