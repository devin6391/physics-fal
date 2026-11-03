# physics-fal

Generates the Kling 3.0 clips for the short film **Physics** on [fal.ai](https://fal.ai), one shot or section at a time.

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
cp .env.example .env      # then fill in both keys
```

- `FAL_KEY`: from fal.ai → **API Keys**.
- `NOTION_TOKEN`: see Notion setup below.

`.env` is git-ignored; never commit the keys, paste them into chat, or put them in Notion.

### Notion setup

1. Go to **notion.so/profile/integrations** → **New integration**. Name it `physics-fal`, pick your workspace, type **Internal**. It only needs **Read content**.
2. Copy its **Internal Integration Secret** into `.env` as `NOTION_TOKEN=`.
3. Give it access to two databases. In Notion, open each one → **•••** (top right) → **Connections** → add `physics-fal`:
   - 🎥 Shots
   - 🎬 Asset Library

## Making clips

```bash
# 1. See exactly what will be sent, as read from Notion (spends nothing)
node scripts/generate.js CO-02a --print

# 2. Check the shot, download its images and see the cost (spends nothing)
node scripts/generate.js CO-02a --dry-run

# 3. Generate (asks "Spend about $X?" before starting)
node scripts/generate.js CO-02a
```

Name several shots (`CO-02a CO-02b`), or use `--section "Cold open"` for every shot in a section whose Model is Kling 3.0 and whose prompt is written (shots with all eight prompt fields empty are listed and skipped). Up to 4 clips run in parallel. Add `--takes 2` for two takes of each shot, and `--yes` to skip the question. `npm run check` is the dry run for the cold open.

Results:

- `out/<section>/<shot>-take<N>.mp4`: the clip
- `out/<section>/<shot>-take<N>.json`: exactly what was sent (prompt, Notion page and its last edit, image names, settings, request ID, cost)
- `log.csv`: one line per run, including failures

`out/` is git-ignored because video is too heavy for git. Approved clips go into Notion (the shot's **Generated clip** field).

## What a shot needs in Notion

The checker stops before anything is spent unless the shot's row has:

- **Model** set to Kling 3.0
- **Duration (s)**: a whole number from 3 to 15
- **Start frame** (and optionally **End frame**): a png, jpg or webp image. A reused frame is uploaded to this shot's own field too, so the row says exactly what is sent.
- all eight **Prompt:** fields filled in (Characters, Setting and look, Camera, Action, Dialogue, Timing, Environment, Keep still). Keep still holds the shot's own lines only; the standard block is added automatically.
- every `@name` in the prompt linked in the shot's **Elements**, as an Asset Library row whose Class is Character and which has a **Face close-up** and a **Reference Image**

Characters are written lowercase with underscores: the Asset Library row "Auto driver" is `@auto_driver`.

**Places have no element.** On fal the room, the pond or the road comes from the start frame, so write "The hostel room at night …" rather than `@hostel_room`. Linking a place in Elements is fine; only characters are sent.

## The files

| File | What it is |
| --- | --- |
| `config.yaml` | Model, prices, audio off, parallel runs, the negative prompt, the standard KEEP STILL block, and the Notion field names the project reads |
| `scripts/generate.js` | The generator |
| `lib/notion.js` | Reads shots and characters from Notion with the Notion SDK, and downloads their images |
| `lib/` (the rest) | Prompt assembly, checks and the upload cache |

## How images move

Notion's file links expire within the hour, so each run downloads the images it needs into `.cache/notion/`. A file is kept there until it's replaced in Notion; replacing it gives it a new id, and the next run downloads the new one.

fal reads images from URLs, so each image is then uploaded to fal's own storage the first time it's used and kept there for 30 days. The URL is remembered in `.cache/uploads.json`, keyed by the file's content: an unchanged image is never uploaded twice. `.cache/` is git-ignored and safe to delete.
