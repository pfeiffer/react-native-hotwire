require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

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

  # Our adapter plus the verbatim Hotwire Native sources under ios/Vendor (see VENDOR.md).
  s.source_files = 'ios/**/*.swift'

  # Hotwire Native loads turbo.js / bridge.js through `Bundle.module`, which SwiftPM
  # generates. ios/Bundle+Module.swift resolves it to this resource bundle instead.
  s.resource_bundles = {
    'Hotwired' => ['ios/Vendor/HotwireNative/Source/**/*.js']
  }

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
