# Where Helper Board comes from

This file records how Helper Board was made, so anyone can check that we built it ourselves.
Every claim here can be checked in this repository's git history, which dates each change.

## What the app is built from

| Part | Source | Licence |
|---|---|---|
| All app and keyboard code | Written for Helper Board, first commit bc60d43 (2026-11-20) | Ours |
| Android keyboard framework (`InputMethodService`), vibration, microphone | Public Android SDK APIs | Android SDK terms |
| Speech to text | The phone's own on-device `SpeechRecognizer` (Android 13+), called through the public API. No speech model ships in the app. | Part of the phone |
| Word lists `assets/words-en.txt`, `words-es.txt` | wordfreq 3.1.1 top 25,000 words, by Robyn Speer | CC BY-SA 4.0; SUBTLEX authors (Brysbaert et al.) and OpenSubtitles credited as wordfreq requires (see `assets/WORDS-NOTICE.txt` and the Settings credit) |
| Fonts, in-app icons | Android system fonts and Unicode emoji only | Part of the phone |
| App icons (`res/drawable/ic_*_{foreground,background,monochrome}.xml`, six choices in Settings > Look: Keycap Buddy (default), Iris the Lynx, Cornerstone peeks, Glyph the Owl, Cornerstone taps, Plush paw) | Drawn for Helper Board by Team Creative (icon menu pack, 2026-11-22); source zip sha256 c9da617dc9306a4756b6e414a99634c6a55303b54f0341e500ae260a86d926ae; SVG layers converted to Android vectors by us | Ours |
| Laughter sound model `assets/yamnet.tflite` (added 2026-11-24, raven575's yes on a decision card) | Google's YAMNet audio classifier, MediaPipe float32 build, downloaded by CI from storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite, sha256 4d8b4a53282dc83ef04e3e7dbc4fbc98082e34e44ed798e16c3a0cdd4c584faf (checked before every build; not stored in git) | Apache-2.0 (see `assets/MODEL-NOTICE.txt`) |
| TensorFlow Lite runtime (`org.tensorflow:tensorflow-lite:2.16.1`, Maven Central) | Runs the laughter model on the phone | Apache-2.0 |

The app's only third-party code library is the TensorFlow Lite runtime (Apache-2.0, added 2026-11-24 for the
laughter model, which raven575 approved). It needs no internet, and CI still fails any build that asks for it.
Everything else in `app/build.gradle.kts` is our own `:core` module.
It uses no Google closed keyboard library, no Gboard code, no Swype, Nuance or Cerence code, and no code from
FUTO Keyboard, HeliBoard, AnySoftKeyboard or other keyboards.

## How each feature works, and where the idea is public

| Feature | How we did it | Public, prior source of the general idea |
|---|---|---|
| Swipe typing (`core/SwipeDecoder.kt`, first commit 927ba77, 2026-11-21) | Our own code: resample the finger path to 32 points, keep words whose first and last letters are near where the finger started and ended, rank by average distance from the path plus how common the word is. | Kristensson's 2002 master's thesis and Zhai and Kristensson, "Shorthand writing on stylus keyboard," CHI 2003 (published research). |
| Autocorrect (`core/Autocorrect.kt`) | Our own edit distance (Damerau-Levenshtein, 1964-1966 published method) weighted by neighbouring keys, plus word frequency. Off unless the user turns it on. | Textbook spelling correction (Damerau 1964). |
| Hold a key for more characters (`core/Alternates.kt`) | A list that mirrors the printed symbols on a computer keyboard (! over 1, ( over 9). | The shifted symbols of the standard US computer keyboard. |
| Key buzz | Android's public `Vibrator` API with one short pulse. We store no haptic effect library. | Platform feature. |
| Live voice (`app/LiveTranscriber.kt`, `core/Pauses.kt`) | Record the whole take to a file first, split it at pauses by loudness, and send each finished part to the phone's speech recognizer. | Loudness-based pause detection (voice activity detection) is long-published signal processing. |
| Layout Lab (`testbench/www/layout-lab.html`, `core/LabLayout.kt`) | Our own page and our own JSON format. | Ours. |

## How we keep it that way

1. New code is written here, not copied. If we ever use outside code, it goes in this table with its licence first.
2. Before Helper Board goes on a store, a patent lawyer reviews the swipe feature, starting with Cerence's
   US 7,750,891 (active to 2028-03-20), and the key buzz against Immersion's US 8,619,051 (to 2027).
3. Git history is the dated record. Do not rewrite history on this folder.
