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

step "1 of 7: install"
adb install -r -g "$APK"
adb logcat -c

step "2 of 7: turn on Helper Board as the keyboard"
# Android needs a moment after install before it lists a new keyboard.
for i in $(seq 1 30); do
  if adb shell ime list -a -s | tr -d '\r' | grep -qx "$IME"; then break; fi
  sleep 2
done
echo "Keyboards Android knows about:"; adb shell ime list -a -s
adb shell ime enable "$IME"
adb shell ime set "$IME"
CURRENT=$(adb shell settings get secure default_input_method | tr -d '\r')
echo "Current keyboard: $CURRENT"
[[ "$CURRENT" == *HelperBoardIme ]]
# The emulator reports a hardware keyboard ("qwerty" in its config), and Android hides on-screen keyboards
# while one is attached. Phones have none; tell the emulator to show the on-screen keyboard anyway.
adb shell settings put secure show_ime_with_hard_keyboard 1

step "3 of 7: open the Helper Board app (Take Vault and settings)"
adb shell am start -W -n "$PKG/com.herdofhelpers.helperboard.VaultActivity"
sleep 3
shot 1-vault

step "4 of 7: tap the try-it box, like a person would, so the keyboard draws itself"
adb shell am start -W -n "$PKG/com.herdofhelpers.helperboard.VaultActivity" --ez focusTry true
sleep 2
# Find the box on screen and tap its middle.
adb shell uiautomator dump /sdcard/ui.xml >/dev/null
BOX=$(adb shell cat /sdcard/ui.xml | tr -d '\r' | tr '>' '\n' | grep 'class="android.widget.EditText"' | head -1 \
  | grep -o 'bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' | tr -c '0-9\n' ' ')
echo "Try-it box bounds: $BOX"
read -r X1 Y1 X2 Y2 <<<"$BOX"
[[ -n "${Y2:-}" ]]
adb shell input tap $(((X1+X2)/2)) $(((Y1+Y2)/2))
sleep 4
shot 2-keyboard
SHOWN=$(adb shell dumpsys input_method | tr -d '\r' | grep -o "mInputShown=[a-z]*" | head -1)
echo "Keyboard on screen: $SHOWN"
if [[ "$SHOWN" != "mInputShown=true" ]]; then
  adb shell dumpsys input_method | head -60
  exit 1
fi

step "5 of 7: switch keyboard modes by tapping the screen"
# Tap across the lower part of the screen, where the keyboard sits, to press real keys.
# Screen size comes from the emulator, so the taps land on keys whatever its resolution.
read -r W H < <(adb shell wm size | tr -d '\r' | sed -n 's/.*: \([0-9]*\)x\([0-9]*\).*/\1 \2/p' | tail -1)
echo "Screen: ${W}x${H}"
for fy in 62 70 78 86 94; do for fx in 15 50 85; do adb shell input tap $((W*fx/100)) $((H*fy/100)); done; done
sleep 2
shot 3-after-taps

step "6 of 7: robot typing test (two fast thumbs, 12 keys a second; raven575 11-22: fast typing dropped keys)"
SENTENCE="the quick brown fox jumps over the lazy dog"
adb logcat -c
adb shell am start -W -n "$PKG/com.herdofhelpers.helperboard.VaultActivity" --es robot "'$SENTENCE'" --ei robotGapMs 80
sleep 3
adb shell uiautomator dump /sdcard/ui.xml >/dev/null
TBOX=$(adb shell cat /sdcard/ui.xml | tr -d '\r' | tr '>' '\n' | grep 'content-desc="Typing test box"' | head -1 \
  | grep -o 'bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' | tr -c '0-9\n' ' ' || true)
echo "Test box bounds: $TBOX (the page also focuses it itself)"
read -r X1 Y1 X2 Y2 <<<"${TBOX:-}"
if [[ -n "${Y2:-}" ]]; then adb shell input tap $(((X1+X2)/2)) $(((Y1+Y2)/2)); fi
RESULT=""
for i in $(seq 1 30); do
  RESULT=$(adb logcat -d -s HBTEST:I | tr -d '\r' | grep "robot gap_ms" | tail -1 || true)
  [[ -n "$RESULT" ]] && break
  sleep 2
done
shot 4-robot
adb logcat -d -s HBTEST:I | tr -d '\r' | sed 's/^.*HBTEST: //' || true
echo "Robot result: $RESULT"
[[ -n "$RESULT" ]] || { echo "::error::The robot typing test never reported."; exit 1; }
DROPPED=$(sed -n 's/.* dropped=\([0-9]*\).*/\1/p' <<<"$RESULT")
echo "::notice::Robot typing test: $RESULT"
if [[ "$RESULT" != *"box_ok=true"* || "$DROPPED" != "0" ]]; then
  echo "::error::Fast typing lost keys: $RESULT"
  exit 1
fi

step "7 of 7: check for crashes"
if adb logcat -d | grep -E "FATAL EXCEPTION|AndroidRuntime: Process: $PKG" | grep -q .; then
  adb logcat -d | grep -A30 "FATAL EXCEPTION" | head -80
  echo "::error::Helper Board crashed on the emulator."
  exit 1
fi
adb shell dumpsys input_method | grep -E "mCurMethodId|mInputShown" || true
echo "OK: installed, set as keyboard, opened, no crashes."
