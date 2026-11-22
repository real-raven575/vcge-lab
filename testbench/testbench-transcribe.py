#!/usr/bin/env python3
"""Test Bench voice notes: writes one recording out as plain text, on this machine only (nothing is sent anywhere).

Usage: <python with faster-whisper> testbench-transcribe.py AUDIO   ->  the words on stdout
- ffmpeg turns any phone recording (WebM/Opus, MP4/AAC, Ogg, WAV) into 16 kHz mono first.
- faster-whisper small.en on the CPU (int8), the same model as the lab's tester-audio transcriber (~/vcge/transcribe).
  The model is downloaded once, into HF_HOME (the installer points it at the Test Bench folder).
"""
import os, subprocess, sys, tempfile, wave

import numpy as np

if len(sys.argv) != 2:
    sys.exit('usage: testbench-transcribe.py AUDIO')
with tempfile.TemporaryDirectory() as tmp:
    wav = os.path.join(tmp, 'a.wav')
    r = subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', sys.argv[1], '-ac', '1', '-ar', '16000', wav],
                       capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit('ffmpeg could not read the recording: ' + (r.stderr.strip().splitlines() or ['?'])[-1])
    with wave.open(wav) as w:   # stdlib decode: PyAV breaks faster-whisper's own reader on the lab
        pcm = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).astype(np.float32) / 32768.0

from faster_whisper import WhisperModel

model = WhisperModel(os.environ.get('TESTBENCH_WHISPER_MODEL', 'small.en'), device='cpu', compute_type='int8')
segments, _ = model.transcribe(pcm, vad_filter=True)
print(' '.join(s.text.strip() for s in segments if s.text.strip()))
