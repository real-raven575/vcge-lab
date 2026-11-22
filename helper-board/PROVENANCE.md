# Where Helper Board comes from

This file records how Helper Board was made, so anyone can check that we built it ourselves.
Every claim here can be checked in this repository's git history, which dates each change.

## What the app is built from

| Part | Source | Licence |
|---|---|---|
| All app and keyboard code | Written for Helper Board, first commit bc60d43 (2026-11-20) | Ours |
| Android keyboard framework (`InputMethodService`), vibration, microphone | Public Android SDK APIs | Android SDK terms |
| Speech to text | The phone's own on-device `SpeechRecognizer` (Android 13+), called through the public API. No speech model ships in the app. | Part of the phone |
| Word lists `assets/words-en.txt`, `words-es.txt` | wordfreq 3.1.1 top 25,000 words, by Robyn Speer | CC BY-SA 4.0 (see `assets/WORDS-NOTICE.txt`) |
| Fonts, icons | Android system fonts and Unicode emoji only | Part of the phone |

The app has **no third-party code libraries**: `app/build.gradle.kts` depends only on our own `:core` module.
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
