#!/usr/bin/env bash
# sim_capture.sh : takes clean screenshots (9:41, full battery, full signal) from the iOS Simulator.
#
#   bash sim_capture.sh boot "iPhone 17 Pro Max"                 # open the simulator (6.9" = 1320x2868)
#   bash sim_capture.sh launch com.example.lumen tr              # open the app in Turkish
#   bash sim_capture.sh shot Asset/screens/tr/01.png             # save the current screen
#   bash sim_capture.sh reset                                    # restore the status bar
#
# Flow: launch -> the user goes to the screen (or the one Claude asks for) -> shot. Repeat per locale.
# Screenshots always come from the REAL app; UI is never made up.
set -euo pipefail
cmd="${1:-}"; shift || true

case "$cmd" in
  boot)
    dev="${1:-iPhone 17 Pro Max}"
    xcrun simctl boot "$dev" 2>/dev/null || true
    open -a Simulator
    echo "opened: $dev  (use a Pro Max class device for the 6.9\" master: 1320x2868)"
    ;;
  launch)
    bundle="$1"; loc="${2:-en-US}"; lang="${loc%%-*}"
    region="${loc#*-}"; [[ "$region" == "$loc" ]] && region=$(echo "$lang" | tr '[:lower:]' '[:upper:]')
    xcrun simctl status_bar booted override --time "9:41" --dataNetwork wifi --wifiMode active --wifiBars 3 \
      --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100
    xcrun simctl terminate booted "$bundle" 2>/dev/null || true
    xcrun simctl launch booted "$bundle" -AppleLanguages "($lang)" -AppleLocale "${lang}_${region}"
    echo "opened: $bundle  lang=$lang region=$region  (status bar 9:41)"
    ;;
  shot)
    out="$1"; mkdir -p "$(dirname "$out")"
    xcrun simctl io booted screenshot --type=png "$out" >/dev/null
    sips -g pixelWidth -g pixelHeight "$out" | tail -2 | awk '{printf "%s ", $2} END {print ""}' | sed "s|^|$out  |"
    ;;
  reset)
    xcrun simctl status_bar booted clear && echo "status bar restored"
    ;;
  *)
    sed -n '2,12p' "$0"; exit 1 ;;
esac
