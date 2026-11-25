#!/usr/bin/env bash
# Regenerates the Android launcher icons and splash images from
# resources/icon-source.png (the plain Odd Birdle icon: the shuttle on a cream court).
# Needs ImageMagick 6 (`convert`) on PATH. Rerunnable; overwrites the PNGs it owns.
#
#   bash mobile-app/scripts/make-icons.sh
set -euo pipefail

here="$(cd "$(dirname "$0")/.." && pwd)"
src="$here/resources/icon-source.png"
res="$here/android/app/src/main/res"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

CREAM='#F0E6D6'   # court colour of the icon art
INK='#574837'     # shuttle colour of the icon art
PAGE='#182223'    # page background of the game (index.html --page)

# 1. Cut the shuttle out of the art as a clean alpha mask (cream -> transparent,
#    dark -> opaque) so its anti-aliased edges carry no cream fringe.
convert "$src" -crop 300x470+288+90 +repage -colorspace Gray -negate \
  -level 20%,65% "$tmp/mask.png"
convert "$tmp/mask.png" -trim +repage "$tmp/mask.png"

# shuttle <colour> <canvas px> <shuttle height as a fraction of canvas> <out>
shuttle() {
  local h
  h=$(awk -v c="$2" -v f="$3" 'BEGIN { printf "%d", c * f }')
  convert -size "$2x$2" xc:none \
    \( -size "$2x$2" "xc:$1" \( "$tmp/mask.png" -resize "x$h" -background black -gravity center -extent "$2x$2" \) \
       -compose CopyOpacity -composite \) \
    -gravity center -compose Over -composite "$4"
}

# 2. Adaptive icon foreground (108dp canvas, the shuttle stays inside the 66dp safe circle).
shuttle "$INK" 1024 0.46 "$tmp/fg.png"
# 3. Legacy square / round icons (pre-Android 8): cream tile with the shuttle.
shuttle "$INK" 1024 0.60 "$tmp/legacy-shuttle.png"
convert -size 1024x1024 "xc:$CREAM" "$tmp/legacy-shuttle.png" -compose Over -composite \
  \( -size 1024x1024 xc:none -fill white -draw "roundrectangle 0,0 1023,1023 180,180" \) \
  -compose DstIn -composite "$tmp/legacy.png"
convert -size 1024x1024 "xc:$CREAM" "$tmp/legacy-shuttle.png" -compose Over -composite \
  \( -size 1024x1024 xc:none -fill white -draw "circle 511.5,511.5 511.5,0" \) \
  -compose DstIn -composite "$tmp/legacy-round.png"

for pair in mdpi:1 hdpi:1.5 xhdpi:2 xxhdpi:3 xxxhdpi:4; do
  d=${pair%%:*}; s=${pair##*:}
  fg=$(awk -v s="$s" 'BEGIN { printf "%d", 108 * s }')
  lg=$(awk -v s="$s" 'BEGIN { printf "%d", 48 * s }')
  mkdir -p "$res/mipmap-$d"
  convert "$tmp/fg.png" -resize "${fg}x${fg}" -strip "$res/mipmap-$d/ic_launcher_foreground.png"
  convert "$tmp/legacy.png" -resize "${lg}x${lg}" -strip "$res/mipmap-$d/ic_launcher.png"
  convert "$tmp/legacy-round.png" -resize "${lg}x${lg}" -strip "$res/mipmap-$d/ic_launcher_round.png"
done

# 4. Android 12+ splash icon (288dp canvas, content inside the 192dp circle): cream
#    shuttle on the dark page colour that the theme uses as the splash background.
mkdir -p "$res/drawable-xxxhdpi"
shuttle "$CREAM" 1152 0.40 "$tmp/splash-icon.png"
convert "$tmp/splash-icon.png" -strip "$res/drawable-xxxhdpi/splash_icon.png"

# 5. Pre-Android 12 splash bitmaps (window background while the WebView starts).
splash() { # <w> <h> <out>
  local m h
  m=$(( $1 < $2 ? $1 : $2 ))
  h=$(awk -v m="$m" 'BEGIN { printf "%d", m * 0.30 }')
  convert -size "$1x$2" "xc:$PAGE" \
    \( -size "$1x$2" "xc:$CREAM" \( "$tmp/mask.png" -resize "x$h" -background black -gravity center -extent "$1x$2" \) \
       -compose CopyOpacity -composite \) \
    -gravity center -compose Over -composite -strip "$3"
}
splash 480 320 "$res/drawable/splash.png"
for spec in mdpi:320x480 hdpi:480x800 xhdpi:720x1280 xxhdpi:960x1600 xxxhdpi:1280x1920; do
  d=${spec%%:*}; wh=${spec##*:}; w=${wh%x*}; h=${wh#*x}
  splash "$w" "$h" "$res/drawable-port-$d/splash.png"
  splash "$h" "$w" "$res/drawable-land-$d/splash.png"
done

echo "icons and splash written under $res"
