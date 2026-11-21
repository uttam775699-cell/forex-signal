#!/bin/bash
# Render one episode in chunks (a crash only loses one chunk), join, mux the mix, QA sheet.
# usage: pipeline/render.sh episodes/<slug> [scale]      scale 0.75 -> 810x1440 (default), 1 -> 1080x1920
set -e
EP=$(cd "$1" && pwd); SCALE=${2:-0.75}
cd "$(dirname "$0")/.."
CHROME=${CHROME:-/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell}
OUT=$EP/render; mkdir -p $OUT/chunks
TOTAL=$(python3 -c "import json;print(json.load(open('$EP/timed.json'))['total'])")
python3 -c "import json;e=json.load(open('$EP/timed.json'));json.dump({'episode':e,'dpr':$SCALE},open('$OUT/props.json','w'))"
CH=225
for a in $(seq 0 $CH $((TOTAL-1))); do
  b=$((a+CH-1)); [ $b -ge $TOTAL ] && b=$((TOTAL-1))
  o=$OUT/chunks/c_$(printf %05d $a).mp4
  [ -s $o ] && continue
  for try in 1 2; do
    npx remotion render src/index.ts Short $o --frames=$a-$b --scale=$SCALE --props=$OUT/props.json --concurrency=${CONC:-3} \
      --gl=swangle --timeout=900000 --crf=18 --browser-executable=$CHROME --log=error > $OUT/chunks/log_$a.txt 2>&1 && break
  done
  [ -s $o ] && echo "chunk $a-$b ok $(date +%T)" || { echo "chunk $a-$b FAILED"; tail -5 $OUT/chunks/log_$a.txt; exit 1; }
done
ls $OUT/chunks/c_*.mp4 | sed "s/.*/file '&'/" > $OUT/list.txt
ffmpeg -loglevel error -y -f concat -safe 0 -i $OUT/list.txt -c copy $OUT/picture.mp4
SLUG=$(basename $EP)
ffmpeg -loglevel error -y -i $OUT/picture.mp4 -i $EP/audio/mix.wav -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart $OUT/$SLUG.mp4
ffmpeg -loglevel error -y -i $OUT/$SLUG.mp4 -vf "fps=1/4,scale=160:-1,tile=8x3" -frames:v 1 $OUT/sheet.jpg
echo "QA:"; ffmpeg -i $OUT/$SLUG.mp4 -vf "blackdetect=d=0.2,freezedetect=n=0.001:d=0.6" -an -f null - 2>&1 | grep -E "black_start|freeze_start" || echo "no black / frozen spans"
ffprobe -v error -show_entries format=duration -of csv=p=0 $OUT/$SLUG.mp4
echo "DONE $OUT/$SLUG.mp4"
