#!/bin/bash
# One episode end to end: narration + timing, music/SFX mix, a stills sheet (one still per scene), then the full render.
# usage: pipeline/make.sh episodes/<slug> [scale]        STILLS_ONLY=1 stops after the stills sheet
set -e
cd "$(dirname "$0")/.."
EP=$1; SCALE=${2:-0.75}
python3 pipeline/voice.py $EP
python3 pipeline/audio.py $EP
mkdir -p $EP/render
F=$(python3 -c "import json;e=json.load(open('$EP/timed.json'));print(','.join(str((s['a']+s['b'])//2) for s in e['scenes']))")
node scripts/stills.mjs $EP/timed.json $EP/render/s_ $F 0.5 2>&1 | grep -E "^still|\[err\]" || true
N=$(echo $F | tr ',' '\n' | wc -l)
ffmpeg -loglevel error -y $(for f in ${F//,/ }; do echo -n "-i $EP/render/s_$f.jpg "; done) \
  -filter_complex "$(python3 -c "
n=$N; c=min(8,n); L='|'.join(f'{(i%c)*540}_{(i//c)*960}' for i in range(n)); print(''.join(f'[{i}]' for i in range(n))+f'xstack=inputs={n}:layout={L}:fill=black,scale=2160:-1')
")" $EP/render/stills.jpg
echo "STILLS $EP/render/stills.jpg"
[ -n "$STILLS_ONLY" ] && exit 0
pipeline/render.sh $EP $SCALE
