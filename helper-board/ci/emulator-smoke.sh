#!/usr/bin/env bash
# Smoke test on an emulator: install Helper Board, turn it on as the keyboard, open the app and a text box,
# type a few keys, and fail if the app crashed. Screenshots go to $2 for a person to look at.
set -euo pipefail
APK="$1"
SHOTS="${2:-shots}"
PKG=com.herdofhelpers.helperboard.proto
IME="$PKG/com.herdofhelpers.helperboard.HelperBoardIme"
mkdir -p "$SHOTS"
trap 'echo "--- recent keyboard and app log ---"; adb logcat -d | grep -iE "InputMethod|helperboard" | tail -40 || true' ERR

step() { echo; echo "=== $* ==="; }
shot() { adb exec-out screencap -p > "$SHOTS/$1.png" || true; }

step "1 of 6: install"
adb install -r -g "$APK"
adb logcat -c

step "2 of 6: turn on Helper Board as the keyboard"
# Android needs a moment after install before it lists a new keyboard.
for i in $(seq 1 30); do
  if adb shell ime list -a -s | tr -d '\r' | grep -qx "$IME"; then break; fi
  sleep 2
done
echo "Keyboards Android knows about:"; adb shell ime list -a -s
adb shell ime enable "$IME"
adb shell ime set "$IME"
adb shell settings get secure default_input_method | tee /dev/stderr | grep -q "HelperBoardIme"

step "3 of 6: open the Helper Board app (Take Vault and settings)"
adb shell am start -W -n "$PKG/com.herdofhelpers.helperboard.VaultActivity"
sleep 3
shot 1-vault

step "4 of 6: open a text box so the keyboard shows"
adb shell am start -W -a android.intent.action.INSERT -t vnd.android.cursor.dir/contact || true
sleep 4
adb shell input tap 540 600 || true
sleep 2
shot 2-keyboard

step "5 of 6: type on the keyboard"
adb shell input text "hello" || true
sleep 1
shot 3-typed

step "6 of 6: check for crashes"
if adb logcat -d | grep -E "FATAL EXCEPTION|AndroidRuntime: Process: $PKG" | grep -q .; then
  adb logcat -d | grep -A30 "FATAL EXCEPTION" | head -80
  echo "::error::Helper Board crashed on the emulator."
  exit 1
fi
adb shell dumpsys input_method | grep -E "mCurMethodId|mInputShown" || true
echo "OK: installed, set as keyboard, opened, no crashes."
