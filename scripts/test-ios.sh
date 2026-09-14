#!/bin/sh
# Runs the XCTest package under ios/ (the Expo-free iOS sources) on an iOS simulator.
# Pass a simulator name to pick one; the first available iPhone is used otherwise.
# Further arguments go to xcodebuild.
set -e
cd "$(dirname "$0")/../ios"

device="$1"
[ $# -gt 0 ] && shift
if [ -z "$device" ]; then
  device=$(xcrun simctl list devices available | grep -m1 -o 'iPhone [^(]*' | sed 's/ *$//')
fi
if [ -z "$device" ]; then
  echo "No iOS simulator available" >&2
  exit 1
fi

exec xcodebuild test -scheme HotwireCore-Package -destination "platform=iOS Simulator,name=$device" "$@"
