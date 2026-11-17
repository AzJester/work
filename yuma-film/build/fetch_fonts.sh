#!/usr/bin/env bash
# Download the two typefaces used for titles (both SIL Open Font License) into fonts/.
set -euo pipefail
mkdir -p fonts
base=https://raw.githubusercontent.com/google/fonts/main/ofl
curl -fsSL -o fonts/PlayfairDisplay.ttf "$base/playfairdisplay/PlayfairDisplay%5Bwght%5D.ttf"
curl -fsSL -o fonts/PlayfairDisplay-Italic.ttf "$base/playfairdisplay/PlayfairDisplay-Italic%5Bwght%5D.ttf"
curl -fsSL -o fonts/Montserrat.ttf "$base/montserrat/Montserrat%5Bwght%5D.ttf"
