#!/bin/sh
# Replaces the vendored Hotwire Native sources with the tags recorded in VENDOR.md,
# keeping the trimmed layout described there.
#
#   sh scripts/sync-upstream.sh
#
# Afterwards: re-apply the modifications listed in VENDOR.md (the script overwrites
# them), review `git diff ios/Vendor android/hotwire-core/src`, fix compile errors in
# our adapter files (never in vendored ones), update the SHAs in VENDOR.md, and build
# the consuming app on both platforms.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
IOS_TAG=$(sed -n 's/^ios-tag: *//p' "$ROOT/VENDOR.md")
ANDROID_TAG=$(sed -n 's/^android-tag: *//p' "$ROOT/VENDOR.md")
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# Files we modified carry a `react-native-hotwired:` marker (see VENDOR.md). Remember
# them now; the sync overwrites them and we fail loudly at the end if any lost the marker.
MODIFIED=$(git -C "$ROOT" grep -l 'react-native-hotwired:' HEAD -- android/hotwire-core/src ios/Vendor | sed 's/^HEAD://')

echo "hotwire-native-ios @ $IOS_TAG"
git clone -q --depth 1 --branch "$IOS_TAG" https://github.com/hotwired/hotwire-native-ios.git "$WORK/ios"
IOS_DEST="$ROOT/ios/Vendor/HotwireNative"
rm -rf "$IOS_DEST"
mkdir -p "$IOS_DEST"
cp -R "$WORK/ios/Source/Turbo" "$IOS_DEST/Turbo"
rm -rf "$IOS_DEST/Turbo/Navigator" "$IOS_DEST/Turbo/.swiftpm"
find "$IOS_DEST" -name '*.xcodeproj' -prune -exec rm -rf {} +
cp "$WORK/ios/Source/HotwireLogger.swift" "$WORK/ios/Source/ScriptMessageHandler.swift" "$IOS_DEST/"
IOS_SHA=$(git -C "$WORK/ios" rev-parse HEAD)

echo "hotwire-native-android @ $ANDROID_TAG"
git clone -q --depth 1 --branch "$ANDROID_TAG" https://github.com/hotwired/hotwire-native-android.git "$WORK/android"
ANDROID_DEST="$ROOT/android/hotwire-core/src/main"
rm -rf "$ANDROID_DEST"
cp -R "$WORK/android/core/src/main" "$ANDROID_DEST"
rm -rf "$ANDROID_DEST/kotlin/dev/hotwire/core/bridge" \
  "$ANDROID_DEST/assets/js/bridge_components.js" \
  "$ANDROID_DEST/assets/json"
ANDROID_SHA=$(git -C "$WORK/android" rev-parse HEAD)

echo
echo "Synced. Record these in VENDOR.md:"
echo "ios-sha: $IOS_SHA"
echo "android-sha: $ANDROID_SHA"
echo
echo "Compare this upstream dependency block with android/hotwire-core/build.gradle:"
for f in "$WORK/android/core/build.gradle" "$WORK/android/core/build.gradle.kts"; do [ -f "$f" ] && sed -n '/dependencies {/,/^}/p' "$f"; done

LOST=""
for f in $MODIFIED; do
  grep -q 'react-native-hotwired:' "$ROOT/$f" 2>/dev/null || LOST="$LOST $f"
done
if [ -n "$LOST" ]; then
  echo
  echo "Re-apply the modifications described in VENDOR.md to these files (use \`git diff\` to see what changed):"
  for f in $LOST; do echo "  $f"; done
  exit 1
fi
