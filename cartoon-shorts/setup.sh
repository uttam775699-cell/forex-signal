#!/bin/bash
# One-time setup in a fresh cloud container (~3 min): node packages, python audio/TTS packages, Kokoro voice model.
set -e
cd "$(dirname "$0")"
[ -d node_modules/remotion ] || npm ci --silent
python3 -c "import kokoro_onnx, scipy, soundfile" 2>/dev/null || pip install -q kokoro-onnx scipy soundfile
mkdir -p models
for f in kokoro-v1.0.onnx voices-v1.0.bin; do
  [ -s models/$f ] || curl -sL --retry 3 -o models/$f https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/$f
done
ls -la models
echo "setup ok"
