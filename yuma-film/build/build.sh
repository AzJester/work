#!/usr/bin/env bash
# Rebuild the film from its sources.
# Needs python3 with Pillow and numpy, ffmpeg, and network access to commons.wikimedia.org,
# upload.wikimedia.org, tile.loc.gov and raw.githubusercontent.com.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p src audio out fonts
python3 build/fetch.py build/photos.json          # stills from Wikimedia Commons
python3 build/fetch_loc.py build/loc_photos.json  # stills from the Library of Congress (about 300 MB each before resizing)
bash build/fetch_fonts.sh
python3 build/music.py audio/music.wav --dur 92   # background score
python3 build/mix.py film.json                    # narration + music -> audio/mix.wav, captions
python3 build/render.py film.json --out out/picture.mp4
ffmpeg -y -loglevel error -i out/picture.mp4 -i audio/mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k \
  -movflags +faststart out/yuma-arizona-promo-master.mp4
echo "built out/yuma-arizona-promo-master.mp4"
