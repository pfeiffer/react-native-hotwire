#!/bin/sh
# Replaces the vendored Hotwire Native sources with the tags recorded in VENDOR.md.
#
#   sh scripts/sync-upstream.sh
#
# Then review `git diff ios/Vendor android/hotwire-core/src`, fix any compile errors
# in our adapter files (never in the vendored ones), update the SHAs in VENDOR.md,
# and build the consuming app on both platforms.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
IOS_TAG=$(sed -n 's/^ios-tag: *//p' "$ROOT/VENDOR.md")
ANDROID_TAG=$(sed -n 's/^android-tag: *//p' "$ROOT/VENDOR.md")
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "hotwire-native-ios @ $IOS_TAG"
git clone -q --depth 1 --branch "$IOS_TAG" https://github.com/hotwired/hotwire-native-ios.git "$WORK/ios"
rm -rf "$ROOT/ios/Vendor/HotwireNative/Source"
rsync -a --exclude '*.xcodeproj' --exclude '.swiftpm' "$WORK/ios/Source/" "$ROOT/ios/Vendor/HotwireNative/Source/"
IOS_SHA=$(git -C "$WORK/ios" rev-parse HEAD)

echo "hotwire-native-android @ $ANDROID_TAG"
git clone -q --depth 1 --branch "$ANDROID_TAG" https://github.com/hotwired/hotwire-native-android.git "$WORK/android"
rm -rf "$ROOT/android/hotwire-core/src/main"
rsync -a "$WORK/android/core/src/main/" "$ROOT/android/hotwire-core/src/main/"
ANDROID_SHA=$(git -C "$WORK/android" rev-parse HEAD)

echo
echo "Synced. Record these in VENDOR.md:"
echo "ios-sha: $IOS_SHA"
echo "android-sha: $ANDROID_SHA"
echo
echo "Upstream core/build.gradle dependencies (compare with android/hotwire-core/build.gradle):"
sed -n '/dependencies {/,/^}/p' "$WORK/android/core/build.gradle" 2>/dev/null || true
