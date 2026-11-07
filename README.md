# physics-fal

Makes the moving clips (Kling 3.0 and Kling 4.0 on [fal.ai](https://fal.ai), one shot or section at a time) and each scene's voices and sounds (ElevenLabs) for the short film **Physics**.

Notion is the source of truth. Every run reads the shot straight from its row in the **Shots** database (the eight prompt fields, duration, start and end frames, and its characters) and the locked character images from the **Asset Library**. There are no local copies of prompts or images to keep in sync: change something in Notion and the next run uses it. The project applies the film's rules the same way every time:

- the standard **KEEP STILL** block is appended to every prompt
- the **negative prompt** is sent with every clip
- Kling's own **audio stays off** (sound is made separately)
- `@aryan`, `@priya` … become fal's `@Element1`, `@Element2` … with that character's face close-up and sheet attached
- a take is **never overwritten**, and every run is logged with its cost

## Setup (once)

Needs Node.js 20 or newer.

```bash
npm install
cp .env.example .env      # then fill in the keys
```

- `FAL_KEY`: from fal.ai → **API Keys**.
- `NOTION_TOKEN`: see Notion setup below.
- `ELEVENLABS_API_KEY`: from ElevenLabs → **API Keys**, for the voices.

`.env` is git-ignored; never commit the keys, paste them into chat, or put them in Notion.

### Notion setup

1. Go to **notion.so/profile/integrations** → **New integration**. Name it `physics-fal`, pick your workspace, type **Internal**. Give it **Read content**, **Update content** and **Insert content** (the voice script uploads line files to a scene's Voice files).
2. Copy its **Internal Integration Secret** into `.env` as `NOTION_TOKEN=`.
3. Give it access to three databases. In Notion, open each one → **•••** (top right) → **Connections** → add `physics-fal`:
   - 🎥 Shots
   - 🎬 Asset Library
   - 🎞 Film Structure — Scenes

## Making clips

```bash
# 1. Download the shot's images from Notion to this Mac (free)
npm run pull -- CO-02a

# 2. See exactly what will be sent, as read from Notion (spends nothing)
node scripts/generate.js CO-02a --print

# 3. Check the shot and its local images, and see the cost (spends nothing)
node scripts/generate.js CO-02a --dry-run

# 4. Generate (asks "Spend about $X?" before starting)
node scripts/generate.js CO-02a
```

Name several shots (`CO-02a CO-02b`), or use `--section "Cold open"` for every shot in a section whose Model is one of the fal models in `config.yaml` (shots set to another Model, like Free still, are listed and skipped; for generating, only those whose prompt is written; shots with all eight prompt fields empty are listed and skipped). Both scripts take the same shot arguments. Up to 4 clips run in parallel. Add `--takes 2` for two takes of each shot, and `--yes` to skip the question. `npm run check` is the dry run for the cold open.

**The generator never downloads from Notion.** It uploads the images to fal from this Mac. If an image isn't here (never pulled, or replaced in Notion since), it stops before the cost question and prints the `npm run pull` command to run. If the pull then reports a problem, the image is missing or unusable in Notion itself: fix it there and pull again.

Results:

- `out/<section>/<shot>-take<N>.mp4`: the clip
- `out/<section>/<shot>-take<N>.json`: exactly what was sent (prompt, Notion page and its last edit, image names, settings, request ID, cost)
- `log.csv`: one line per run, including failures

`out/` is git-ignored because video is too heavy for git. Approved clips go into Notion (the shot's **Generated clip** field).

## Making voices

The dialogue is made on [ElevenLabs](https://elevenlabs.io) one scene at a time, from the scene's **Sound script** in the Scenes database (Film Structure). Each speaker's lines in a scene go in one request, separated by `[long pause]`, so the voice stays the same from line to line; a speaker with lines at two Stability levels gets one request per level. Needs `ELEVENLABS_API_KEY` in `.env` and ffmpeg on the Mac (`brew install ffmpeg`).

```bash
node scripts/voice.js --scene 1 --print      # every line, its file name and its request, as read from Notion (free)
node scripts/voice.js --scene 1 --dry-run    # check the voices and the Phone filter, show the characters (free)
node scripts/voice.js --scene 1              # the whole flow, below
node scripts/voice.js --voices               # the voices on the account
```

A run of `--scene 1`:

1. Reads the Sound script and the scene's **Voice files**. A speaker whose line files are all there already (S01-aryan-1 … S01-aryan-9) is skipped; `--redo aryan` makes them again.
2. Asks "Use about N ElevenLabs characters?", then makes one take of each request: `out/voice/scene-01/S01-priya-all-take1.mp3`, with a `.json` of exactly what was sent.
3. Waits while you listen. Answer `y` if all are good, or name the ones to make again (`priya, hostel boy c`), or `n` to stop and come back later with `--from-takes`.
4. Cuts each approved take at its pauses into one file per line (`out/voice/scene-01/S01-priya-all-take1/S01-priya-1.mp3` …) and lists each line's length.
5. Asks, then uploads the line files to the scene's Voice files in Notion, keeping everything already there; a file with the same name is replaced.

Takes are never overwritten and every request is logged in `voice-log.csv`. `--from-takes` skips generating and carries on from the latest takes. Claude Code can't answer the questions, so from there it runs `--print` and `--dry-run`, generation with `--yes` only for a run Vineet approved, and after he has listened: `--from-takes --approved --yes`.

### How the Sound script is written

```
ARYAN (Calm 50%; …)                                  a speaker heading in capitals: name, Stability
1. [eager] सच? टिकट ले ली? कौन-सी bus है? (beat 13; …)  a line: what is sent, then the note from "(beat"
PRIYA (Calm 50%; …; Filter → Phone)                  "Filter → Phone" sends all her lines through the Phone filter
HOSTEL BOYS (off-screen)
1. Hostel boy 1 (Hostel boy A, Breaking 25%): […] …   a line naming its own voice and Stability
```

Every voice named needs an id in `config.yaml → voice.speakers`. Line files are named by scene, voice and number: `S01-aryan-3` is Aryan's third line in scene 1.

## Making a scene's sounds

Every other sound the scene needs (event sounds, movement, beds) is made on ElevenLabs Sound Effects from the **SOUNDS** section of the same Sound script, one generation per sound, and uploaded to the scene's **Scene SFX audio**. It works like the voices:

```bash
node scripts/sounds.js --scene 1 --print      # every sound, its prompt, length and loop (free)
node scripts/sounds.js --scene 1 --dry-run    # the credits it would use (about 40 per second of sound)
node scripts/sounds.js --scene 1              # generate, listen and approve (or name the ones to redo), upload
```

Sounds already in Scene SFX audio are skipped (`--redo door-bang` makes one again), and `--from-takes` / `--approved` work as for the voices. Motifs are listed but never generated here: they are made once and locked in the Asset Library. A SOUNDS line reads:

```
2. door-bang (event, 1.5 s): A wooden hostel room door flung open hard, … (beat 2)
18. room-night (bed, 30 s, loop): A small hostel room at night: … (beats 2–18)
```

The kind (event, movement, bed, motif), the length (0.5–30 s) and "loop" go in the brackets; the prompt runs up to "(beat". The file is `S01-sfx-door-bang.mp3`.

## What a shot needs in Notion

The checker stops before anything is spent unless the shot's row has:

- **Model** set to Kling 3.0 or Kling 4.0 (see below)
- **Duration (s)**: a whole number from 3 to 15
- **Start frame** (and optionally **End frame**): a png, jpg or webp image. A reused frame is uploaded to this shot's own field too, so the row says exactly what is sent.
- all eight **Prompt:** fields filled in (Characters, Setting and look, Camera, Action, Dialogue, Timing, Environment, Keep still). Keep still holds the shot's own lines only; the standard block is added automatically.
- every `@name` in the prompt linked in the shot's **Elements**, as an Asset Library row whose Class is Character and which has a **Face close-up** and a **Reference Image**

Characters are written lowercase with underscores: the Asset Library row "Auto driver" is `@auto_driver`.

### Kling 3.0 or Kling 4.0

The shot's **Model** in Notion picks the fal model; `config.yaml → models` holds each one's endpoint and price.

| | Kling 3.0 (Pro) | Kling 4.0 |
| --- | --- | --- |
| Price on fal | $0.112 per second (audio off) | $0.157 per second |
| Characters (`@aryan` with face close-up and sheet) | ✓ | ✗: fal's Kling 4.0 takes no character images |
| Negative prompt | ✓ | ✗ |
| Audio setting | off | none on fal |
| Start and end frame | ✓ | ✓ |
| Resolution | — | 1080p (`config.yaml`) |

Use **Kling 3.0** whenever a character's face has to match their sheet, above all when someone walks in from off-frame. **Kling 4.0** suits shots where everyone on screen is already in the start frame: write the people in words, without `@names`. The checker stops a Kling 4.0 shot whose prompt names a character. Clips stay 3 to 15 seconds on both (fal's Kling 4.0 allows up to 30).

**Places have no element.** On fal the room, the pond or the road comes from the start frame, so write "The hostel room at night …" rather than `@hostel_room`. Linking a place in Elements is fine; only characters are sent.

## The files

| File | What it is |
| --- | --- |
| `config.yaml` | The fal models (endpoint, price) for each Notion Model, audio off, parallel runs, the negative prompt, the standard KEEP STILL block, and the Notion field names the project reads |
| `scripts/pull.js` | Downloads shots' images from Notion into `.cache/notion/` |
| `scripts/generate.js` | The generator |
| `scripts/voice.js` | Makes a scene's dialogue on ElevenLabs, cuts it into line files and uploads them to Notion |
| `scripts/sounds.js` | Makes a scene's other sounds on ElevenLabs Sound Effects and uploads them to Notion |
| `lib/voice.js` | Reads a scene's Sound script: the voice requests and the SOUNDS list |
| `lib/audio.js` | Finds the pauses and cuts a request into line files (ffmpeg) |
| `lib/notion.js` | Reads shots, characters and scenes from Notion with the Notion SDK, downloads images (for pull) and uploads voice files |
| `lib/` (the rest) | Prompt assembly, checks and the upload cache |

## How images move

`npm run pull` downloads a shot's images from Notion into `.cache/notion/`, each named by its Notion file id. Replacing a file in Notion gives it a new id, so the generator asks for a fresh pull instead of sending the old image.

fal reads images from URLs, so the generator uploads each local image to fal's own storage the first time it's used and kept there for 30 days. The URL is remembered in `.cache/uploads.json`, keyed by the file's content: an unchanged image is never uploaded twice. `.cache/` is git-ignored and safe to delete.
