# Yuma, Arizona: promotional film

A 92-second promotional film about Yuma, Arizona: real photographs of the city and the country
around it, a narrated script, and a light acoustic score.

| File | What it is |
|---|---|
| `yuma-arizona-promo.mp4` | The film. 1920x1080, 30 fps, H.264 with AAC stereo, about 32 MB |
| `yuma-arizona-promo.srt` | Captions timed to the narration |
| `narration.txt` | The script |
| `audio/narration.mp3` | The recorded narration |
| `film.json` | The edit: every shot, camera move, title and narration cue |
| `CREDITS.md` | Source, photographer and rights for each photograph |
| `build/` | Scripts that fetch the photographs, write the music, mix the sound and render the picture |

## Narration

> Some places wait for a sunny day. Yuma, Arizona, wakes up to one almost every morning. It holds the world record for sunshine. More than four thousand hours of it, every single year.

> The Colorado River made this town. For centuries, this was the crossing, where travelers found their way west. And that history is still here to touch. The Ocean-to-Ocean Bridge, built in 1915. The Territorial Prison on the hill, where the Old West did its time. And a Main Street that still feels like one.

> Past the edge of town, winter looks a lot like spring. From November to March, these fields grow about 90 percent of the leafy greens on America's tables. And in the date groves, Medjool dates ripen slow and sweet.

> Then, there's the wild side. Golden dunes, rolling to the horizon. The rugged Kofa Mountains, home to desert bighorn sheep. And a river made for slow afternoons.

> Warm days. Wide open skies. Sunsets that stop you mid-sentence. This is Yuma, Arizona. Come for the sunshine. Stay for everything else.

## Shots

| In | Picture | On-screen text |
|---|---|---|
| 0:00.0 | Sunrise over the Colorado River (1972) |  |
| 0:04.5 | Colorado River at sunrise, 30 miles north of Yuma (1972) |  |
| 0:08.2 | Countryside around the Territorial Prison |  |
| 0:11.0 | Orange grove outside Yuma | 4,000+ hours of sunshine a year |
| 0:15.2 | Irrigated fields outside Yuma | Yuma / Arizona / The Sunniest City on Earth |
| 0:20.5 | The Colorado River at Yuma | The Colorado River |
| 0:23.2 | Train on the railroad bridge at Yuma (archive) | Yuma Crossing / Archive photograph |
| 0:27.8 | Sally port, Yuma Territorial Prison |  |
| 0:30.7 | Ocean-to-Ocean Bridge at dusk | Ocean-to-Ocean Bridge / Built 1915 |
| 0:34.2 | Main cellblock, Yuma Territorial Prison | Yuma Territorial Prison / Opened 1876 |
| 0:38.5 | Downtown Yuma sign, Main Street | Historic Main Street / Downtown Yuma |
| 0:42.4 | Tractors working a winter field |  |
| 0:46.0 | New lettuce, Yuma County |  |
| 0:49.2 | Leafy greens outside Yuma | 90% of America's winter leafy greens |
| 0:52.3 | Medjool date grove | Medjool date groves |
| 0:57.2 | Kofa Mountains in low sun |  |
| 0:59.8 | Imperial Sand Dunes | Imperial Sand Dunes / 20 minutes west |
| 1:02.8 | Kofa Mountains | Kofa National Wildlife Refuge / An hour north |
| 1:04.8 | Desert bighorn sheep, Kofa National Wildlife Refuge |  |
| 1:06.6 | The Colorado River at Yuma |  |
| 1:10.6 | Sky over the Imperial Sand Dunes |  |
| 1:14.0 | Sunset toward the Castle Dome Mountains | Yuma, Arizona / Come for the sunshine. Stay for everything else. Then credits |

## Facts behind the script

- **Sunshine.** Guinness World Records lists Yuma under "Most sunshine": 91 percent of possible
  daylight hours, a mean of 4,055 hours out of 4,456 a year
  ([Guinness](https://www.guinnessworldrecords.com/world-records/66545-most-sunshine)).
- **The crossing.** "The crossing point attracted many over the centuries because of the natural
  narrowing and calming of the Colorado River" ([National Park Service](https://www.nps.gov/articles/yuma.htm)).
- **Ocean-to-Ocean Bridge.** Built in 1915, the first highway crossing of the lower Colorado
  ([Arizona DOT](https://azdot.gov/adot-blog/history-behind-yumas-ocean-ocean-bridge)).
- **Territorial Prison.** The first seven inmates arrived on July 1, 1876
  ([Arizona State Parks](https://azstateparks.com/yuma-territorial)).
- **Winter greens.** The Yuma area supplies about 90 percent of the nation's leafy vegetables
  from November to March ([Library of Congress caption](https://www.loc.gov/pictures/item/2018701530/),
  [Yuma Fresh Vegetable Association](https://www.yumafreshveg.com/yuma-ag-water)).
- **Kofa.** The refuge was established in 1939 to protect desert bighorn sheep
  ([U.S. Fish and Wildlife Service](https://www.fws.gov/refuge/kofa)).

The drive times on screen ("20 minutes west", "An hour north") are approximate. The Imperial Sand
Dunes are across the river in California.

## How it was made

- **Picture.** 22 stills, each given a slow camera move and cross-dissolved. `build/render.py`
  draws every frame with Pillow and pipes them to ffmpeg. Titles are set in Playfair Display and
  Montserrat.
- **Narration.** A synthetic voice (ElevenLabs v4, generated through Higgsfield). The audio was
  transcribed afterwards to confirm every line and to time the cuts.
- **Music.** Written for this film and synthesized by `build/music.py`: fingerpicked guitar, a
  soft pad, bass and a sparse melody in D major, 28 bars at 73 bpm, ending on the final frame.
- **Mix.** `build/mix.py` places each narration paragraph, lowers the music by 10.5 dB under the
  voice and masters to -16 LUFS with peaks below -1 dBFS.

## Rebuilding

```
bash build/build.sh
```

This needs python3 with Pillow and numpy, ffmpeg, and network access to Wikimedia Commons, the
Library of Congress image server and raw.githubusercontent.com (for the fonts). It writes a
high-bitrate master to `out/`. The committed web copy is a two-pass 2.6 Mbit/s encode of that
master. `build/align.py` (optional, needs faster-whisper) transcribes a narration take with word
timings.
