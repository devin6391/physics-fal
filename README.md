# physics-fal

Generates the Kling 3.0 clips for the short film **Physics** on [fal.ai](https://fal.ai), one scene at a time.

Notion stays the source of truth: prompts are written and approved in the **Shots** database, and the locked character sheets live in the **Asset Library**. This project takes the approved prompts and images and does the generating, so the film's rules are applied the same way every time:

- the standard **KEEP STILL** block is appended to every prompt
- the **negative prompt** is sent with every clip
- Kling's own **audio stays off** (sound is made separately)
- `@aryan`, `@priya` … become fal's `@Element1`, `@Element2` … with the right face and sheet attached
- a take is **never overwritten**, and every run is logged with its cost

## Setup (once)

Needs Node.js 20 or newer.

```bash
npm install
cp .env.example .env      # then paste your fal key into .env
```

Get the key from fal.ai → **API Keys**. `.env` is git-ignored; never commit the key, paste it into chat, or put it in Notion.

Then copy the locked images in (see `assets/README.md`).

## Making clips

```bash
# 1. See exactly what will be sent (spends nothing)
node scripts/generate.js shots/cold_open.yaml --only CO-02a --print

# 2. Check every file and see the cost (spends nothing)
node scripts/generate.js shots/cold_open.yaml --only CO-02a --dry-run

# 3. Generate (asks "Spend about $X?" before starting)
node scripts/generate.js shots/cold_open.yaml --only CO-02a
```

Leave out `--only` to run the whole scene at once (up to 4 clips in parallel). Add `--takes 2` for two takes of each shot, and `--yes` to skip the question.

Results:

- `out/<scene>/<shot>-take<N>.mp4`: the clip
- `out/<scene>/<shot>-take<N>.json`: exactly what was sent (prompt, images, settings, request ID, cost)
- `log.csv`: one line per run, including failures

`out/` is git-ignored because video is too heavy for git. Approved clips go into Notion (the shot's **Generated clip** field).

## The files

| File | What it is |
| --- | --- |
| `config.yaml` | Model, prices, audio off, parallel runs, the negative prompt and the standard KEEP STILL block |
| `elements.yaml` | The element library: each character's face close-up (frontal) and sheet (reference) |
| `shots/<scene>.yaml` | One file per scene: each clip's duration, start frame and the eight prompt sections |
| `frames/<scene>/` | Approved start and end frames, named after the shot they were made for |
| `assets/` | Local copies of the locked character images |
| `scripts/generate.js` | The generator |
| `lib/` | Prompt assembly, checks and the upload cache |

## Adding a shot

Copy the approved sections from the shot's row in Notion into the scene file:

```yaml
  - id: CO-02c
    duration: 5
    start_frame: frames/cold_open/CO-02c.png
    # end_frame: frames/cold_open/CO-02c-end.png   (optional)
    prompt:
      characters: "@aryan: ..."
      setting: ...
      camera: ...
      action: ...
      dialogue: ...
      timing: |-
        0.0–1.0 s: ...
      environment: ...
      keep_still: ...      # the shot's own lines only; the standard block is added automatically
```

Rules the checker enforces:

- duration is a whole number from 3 to 15 seconds
- the start frame (and end frame, if given) exists
- all eight sections are filled in
- every `@name` is in `elements.yaml`

**Places have no element.** On fal the room, the pond or the road comes from the start frame, so write "The hostel room at night …" rather than `@hostel_room`.

## How uploads work

fal reads images from URLs, so each local image is uploaded to fal's own storage the first time it's used and kept there for 30 days. The URL is remembered in `.cache/uploads.json`, keyed by the file's content: an unchanged image is never uploaded twice, and a changed one is uploaded again automatically.
