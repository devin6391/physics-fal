# physics-fal

Makes the files for the short film **Physics**: each scene's voices and sounds (ElevenLabs), its radio cut, animatic, mix and assembled cut (ffmpeg), and the moving clips made on [Runway Dev](https://dev.runway.com) (Kling 4.0) or [fal.ai](https://fal.ai) (Kling 3.0), one shot or section at a time. The editing is done here, by commands, not in an editing app.

Notion is the source of truth. Every run reads the shot straight from its row in the **Shots** database (the eight prompt fields, duration, start and end frames, and its characters) and the locked character images from the **Asset Library**. There are no local copies of prompts or images to keep in sync: change something in Notion and the next run uses it. The project applies the film's rules the same way every time:

- the standard **KEEP STILL** block is appended to every prompt
- the **negative prompt** is sent with every clip
- Kling's own **sound is never used**: off on Kling 3.0, and removed in the edit for Kling 4.0, which always makes it
- `@aryan`, `@priya` … bind a character's face close-up and sheet as Runway references or fal Elements
- a take is **never overwritten**, and every run is logged with its cost

## Production review skills

| Skill | Use it for |
| --- | --- |
| `$radio-cut-review` | Rendered audio: screenplay fidelity, voice/sound defects, overlap, perspective and measured cue timing |
| `$storyboard-review` | Actual rough panels: required coverage, staging, sightlines, geography and meaningful visual defects |
| `$animatic-review` | Rendered picture and sound: readability, timing, performance arc, transitions and stale/mismatched inputs |
| `$cinematic-image-review` | Cinematic reference images, start/end frames and production stills |
| `$video-prompt-creation` | Propose a weighted creative decision matrix; obtain Vineet's choices before drafting a video prompt |
| `$video-generation` | Ask Vineet to choose manual Higgsfield or Runway, then handle the live Runway approval for the exact request |
| `$pre-video-review` | Before generation: source coverage, cinematic contribution, performance, cinematography, actual inputs and full prompt/settings |
| `$generated-video-review` | After generation: the actual take's acting, camera/light/focus, temporal continuity, AI artefacts and fit with scene audio |

For example: `Use $radio-cut-review on scene 1's current radio cut`,
`Use $storyboard-review on scene 1's current panels`, or
`Use $animatic-review on scene 1's current rendered animatic`.
The three scene-stage reviews follow the existing Playbook. Rough sketches and
held animatic panels are judged for their story/staging job, not as finished
cinematic footage. Audio overlaps do not require extra panels or shots.

The review skills read current Notion sources and inspect the actual media available. A cue
list, waveform or successful decode does not substitute for listening; sampled
frames do not establish full playback quality. Each review states its coverage,
concrete findings and uncertainty, then asks Vineet to check the exact media.
Final listening/viewing decisions remain his. New production rules require his
review before they are saved in the Playbook.

The two video reviewers share the conversion/source checklist at
`.agents/skills/pre-video-review/references/cinematic-review.md`. They establish
what the assets, storyboard, radio cut, animatic and cinematic frames already
supply, then check the necessary performed moment: intent, emotion/composure,
readable face/body expression, camera movement, focus, lighting and continuity.
Each relevant source is recorded as checked, reused unchanged, partial,
unavailable or not applicable with a reason. Existing approvals can be reused;
review does not mean redoing every upstream stage.

For example: `Use $pre-video-review on CO-01's proposed generation request`
requires no generated video. `Use $generated-video-review on this CO-01 take`
requires the actual candidate file. The latter reports timestamped findings and
a keep/repair/correction recommendation for Vineet's viewing decision.

Use `Use $video-prompt-creation on CO-01; show the creative matrix first` to
prepare a new prompt. The matrix shows inherited information, remaining creative
choices, assistant recommendations/reasons, proposed importance weights and
Vineet's decisions. Weights normally use 1–5 and are editable; they are not model
parameters, quality scores or permission to omit story requirements. New creative
choices and weights stay pending until confirmed. After confirmation, the skill
drafts the eight fields/full prompt and hands them to `pre-video-review`; the
exact prompt, inputs/settings and paid request still need their own approvals.

Use `$cinematic-image-review` after creating or replacing a cinematic reference,
start/end frame or production still. Use `$pre-video-review` on the complete
images/reference/prompt/settings set before final video-prompt approval or a
changed retry. Their instructions live in `.agents/skills/`; Claude's skill paths
link to the same files.

These are visual reviews performed by an assistant. They check artefacts,
identity, scale, construction, hand/prop states, continuity and feasible motion,
and report observed evidence and uncertainty. Only the approved screenplay and
approved assets are creative authority; storyboards are strong suggestive
evidence. Plans and saved image prompts provide execution context.

For example: `Use $cinematic-image-review on CO-01's current end frame`, then
`Use $pre-video-review on CO-01's current generation request`. Each review ends
with findings and a request for Vineet to check the same actual images. An AI
review does not approve an asset or a paid generation. Reviews are kept on the
existing Notion shot/scene page, not as local copies of scene/shot text.

## Setup (once)

Needs Node.js 20 or newer.

```bash
npm install
cp .env.example .env      # then fill in the keys
```

- `RUNWAYML_API_SECRET`: from Runway Dev → **API Keys**, for Kling 4.0.
- `FAL_KEY`: from fal.ai → **API Keys**, for Kling 3.0 or an explicit fal run.
- `NOTION_TOKEN`: see Notion setup below.
- `ELEVENLABS_API_KEY`: from ElevenLabs → **API Keys**, for the voices.

`.env` is git-ignored; never commit the keys, paste them into chat, or put them in Notion.

### Runway Dev setup

Create a project and API key in [Runway Dev](https://dev.runway.com), then add `RUNWAYML_API_SECRET=<your key>` to the existing `.env`. Check the key and the project's API credit balance with:

```bash
npm run generate -- --runway-check
```

This reads the balance without generating. Add API credits in the developer portal when you are ready to run an approved shot. The generator estimates the published 1080p still-input rate and returns to list price when Runway's discount ends. [Runway API pricing](https://docs.dev.runwayml.com/guides/pricing/)

### Notion setup

1. Go to **notion.so/profile/integrations** → **New integration**. Name it `physics-fal`, pick your workspace, type **Internal**. Give it **Read content**, **Update content** and **Insert content** (the voice script uploads line files to a scene's Voice files).
2. Copy its **Internal Integration Secret** into `.env` as `NOTION_TOKEN=`.
3. Give it access to three databases. In Notion, open each one → **•••** (top right) → **Connections** → add `physics-fal`:
   - 🎥 Shots
   - 🎬 Asset Library
   - 🎞 Film Structure — Scenes

## Gemini reference images

Download the exact input images for a shot's Gemini frame prompt, in upload order:

```bash
npm run refs -- CO-01 --frame end --print  # inspect the reference list (no downloads)
npm run refs -- CO-01 --frame end          # out/refs/CO-01/end/
npm run refs -- CO-04 --frame start        # another shot's configured start-frame inputs
```

This command uses the Notion SDK and `NOTION_TOKEN` only. It does not use AI,
MCP, Gemini or generation credits. The existing `pull` command is for fal's
clip inputs; `refs` is for the images Vineet uploads to Gemini.

The shot page holds a YAML code block under **Gemini references**. Each `start`
or `end` list matches the numbered uploads in that frame's prompt. An entry has
`label` (a short filename label), `page` (Notion page ID or URL), `field` (the
exact files-property name), and `file` (the exact attachment name). Example:

```yaml
end:
  - label: storyboard-panel
    page: <scene-page-id>
    field: Storyboard
    file: <exact-panel-filename.png>
  - label: character-face
    page: <character-asset-page-id>
    field: Face close-up
```

`file` can be omitted only if the field contains exactly one attachment. The
command stops for a missing or ambiguous reference instead of guessing. When
an assistant writes or changes a frame prompt, it must keep this list in sync
with the prompt's upload order. Reused cut frames must exist in their specified
Notion field before the command can download them. The command reports a
missing list rather than trying to interpret prose.

Files are numbered `01-…`, `02-…` in `out/refs/<shot>/<start|end>/`; upload the
current files listed by the command in that order. Existing non-empty files
are skipped. Filenames include a source identity, so a replacement attachment
gets a new filename and older copies are preserved. Old files can remain in
the folder: use the command's current list, not every file in the directory.
Only images are saved locally, not copies of the shot, prompt or reference plan.
Notion remains the source of truth. CO-01's end-frame list is configured there.

## Generating frame candidates with Google Cloud

1. Claim the [Google Developer Program credit](https://developers.google.com/profile/help/benefits?hl=en#google-cloud-credits) and check that it is applied to the Cloud billing account linked to your project. Enable the [Vertex AI API](https://console.cloud.google.com/apis/library/aiplatform.googleapis.com) for that project.
2. Install the [Google Cloud CLI](https://docs.cloud.google.com/sdk/docs/install-sdk) and run `gcloud auth application-default login`. If needed, set the quota project with `gcloud auth application-default set-quota-project YOUR_PROJECT_ID`. [Local authentication setup](https://docs.cloud.google.com/docs/authentication/set-up-adc-local-dev-environment)
3. Add `GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID` to the existing `.env` and run `npm ci`.

```bash
npm run frame -- CO-05 --frame start --print
npm run frame -- CO-05 --frame start --dry-run
```

The command reads the shot's **Start frame prompt** or **End frame prompt** and the corresponding ordered **Gemini references** list from Notion. For new prompts, put the exact model text in the field. If the field includes upload instructions, put a standalone `GEMINI PROMPT` line before the model text. The existing CO-05 download preamble is also supported.

The dry run checks the input images and prints the exact `--yes --request …` command. Run that command after approving the shown prompt, inputs and estimated cost. The request ID checks the current prompt, reference bytes and billing project against the preview. Preview modes make zero Google generation calls. The real run sends one request with SDK retries disabled.

The command requests one 16:9, 1K image on Vertex AI. It defaults to Gemini 3.1 Flash Image. Select Nano Banana Pro (Gemini 3 Pro Image) with `--model pro`, for example `npm run frame -- CO-05 --frame start --model pro --dry-run`. The printed estimate covers the reference images and image output at published standard global rates. Text and any thinking tokens are billed separately. Check the [current rates](https://cloud.google.com/model-garden/pricing) and your credit balance before a paid run.

Each attempt gets a folder under `out/frames/scene-NN/` with its own `log.csv`. Review the saved candidate with its references, then use the upload command printed by the script when you select it.

## Making clips

```bash
# 1. Download the shot's images from Notion to this Mac (free)
npm run pull -- CO-02a

# 2. See exactly what will be sent, as read from Notion (spends nothing)
node scripts/generate.js CO-02a --print

# 3. Check the shot and its local images, and see the cost (spends nothing)
node scripts/generate.js CO-02a --dry-run

# 4. For a Kling 4.0 shot, review the Runway request in a terminal and answer y/n
node scripts/generate.js CO-02a --provider runway
```

When you ask an assistant to generate a shot, it uses `$video-generation` and asks whether you want to run it manually in Higgsfield or use the Runway Dev API, unless you already specified the route.

For Runway, the live command prints the HTTP method, endpoint, API version, JSON body, full prompt, media roles and file checksums, duration, take count and estimated cost before asking for `y/n`. It resolves the displayed media slots to temporary upload URIs after approval. Entering `n`, leaving the answer blank or closing the session cancels the request. You can answer in your terminal or have the assistant show you the preview and relay your decision to that same terminal session. Runway rejects `--yes` and piped input.

Name several shots (`CO-02a CO-02b`), or use `--section "Cold open"`. The generator lists and skips unsupported models and unwritten prompts in section runs. Notion's Model routes Kling 4.0 to Runway Dev and Kling 3.0 to fal. Add `--provider fal` to explicitly use the prior fal route for Kling 4.0. Up to four clips run in parallel. Add `--takes 2` for two takes per shot. `--yes` is available for exact, preapproved fal runs. `npm run check` is the dry run for the cold open.

The generator uploads the images to the selected provider from this Mac after approval. If an image is missing locally, it prints the `npm run pull` command before the cost question. If the pull reports a problem, check the attachment in Notion.

Results:

- `out/<section>/<shot>-take<N>.mp4`: the clip
- `out/<section>/<shot>-take<N>.json`: prompt, Notion page and its last edit, image names, provider, request ID, estimated cost and take status
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

Takes are never overwritten and every request is logged in `voice-log.csv`. `--from-takes` skips generating and carries on from the latest takes. An assistant running it in its own shell (Codex, Claude Code, Antigravity) can't answer the questions, so it runs `--print` and `--dry-run`, generation with `--yes` only for a run Vineet approved, and after he has listened: `--from-takes --approved --yes`.

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

## Building the radio cut

`scripts/radio.js` lays every approved voice line and sound of a scene on one timeline and mixes it into the scene's radio cut. Nothing is generated and nothing is spent.

```
node scripts/radio.js --scene 1 --print   # every cue and its time, as read from the plan
node scripts/radio.js --scene 1           # out/radio/scene-01/S01-radio-cut.mp3 and S01-radio-cut-cues.json
node scripts/upload.js --scene 1 radio-cut   # after listening
```

It reads the scene's **Radio cut plan**: a YAML code block under the heading "Radio cut plan" on the scene's row page in the Scenes database. The voices and sounds come from the row's Voice files and Scene SFX audio. `--plan file.yaml` uses a local plan instead, to try a change before writing it into Notion.

### The radio cut plan

```yaml
length: priya-15.end + 9.0      # where the cut ends (seconds, or a cue reference)
fade_out: 1.5                   # seconds of fade at the end
loudness: -16                   # LUFS of the finished cut
filters:                        # named ffmpeg audio filters
  phone: highpass=f=320,lowpass=f=3300
templates:                      # settings shared by many cues (use: priya)
  priya: { filter: phone, level: rms -21, fade: [0.01, 0.06], lane: Phone }
cues:
  - { file: S01-priya-1, use: priya, at: 14.0, what: "Priya 1" }
  - { file: S01-aryan-1, level: rms -20, at: priya-1.end + 0.55 }
  - { file: S01-aryan-7, level: rms -20, at: priya-9.start + 2.70 }    # comes in over her line
  - { file: S01-sfx-ringtone, at: 5.0, loop: 13.5, trim: [4.5, 12.5], level: rms -24 }
  - { file: S01-sfx-screams, at: priya-12.start + 4.78, level: rms -19, gain: "0:-20 0.35:0 12:-14 20:-90" }
  - { mark: Motif B goes here at the mix, at: distant-thud.start }
```

- **file:** the file's name (without extension) in Voice files or Scene SFX audio. A cue's **id** is the file name without `S01-` and `sfx-` (`priya-1`, `distant-thud`), or set `id:` yourself when one file is used twice.
- **at:** seconds, or another cue's `.start` / `.end` plus or minus seconds. Chaining lines to the line before keeps the gaps when a line is regenerated with a new length; an overlap is a start relative to the other line's start.
- **level:** `rms -20` sets the loudness of the sounding parts; `peak -16` sets the loudest point. A file that is silent is left out, with a warning.
- **filter**, **loop** (repeat the file to this many seconds), **trim** (`[from, to]` seconds of the file), **fade** (`[in, out]` seconds), **gain** (one number in dB, or a list `time:dB` across the cue; `-90` is silence), **lane** and **what** (for the cue list), **mark** (a timing mark with no sound).

The cue list beside the radio cut gives every cue's time; the shots' Timing tables and the animatic are cut from it.

## Building the animatic

`scripts/animatic.js` cuts the scene's storyboard panels onto its radio cut.

```
node scripts/animatic.js --scene 1 --print   # every cut, as read from the plan
node scripts/animatic.js --scene 1           # out/animatic/scene-01/S01-animatic.mp4
node scripts/animatic.js --scene 1 --local   # use the panels and radio cut in out/ instead of Notion's
node scripts/upload.js --scene 1 animatic    # after watching
```

It reads the scene's **Animatic plan** (a YAML code block under "Animatic plan" on the row page), the panels in the row's Storyboard field and the sound in its Scene radio cut.

### The animatic plan

```yaml
size: 1280x720
fps: 24
end: radio                     # the radio cut's length (or seconds)
fade: { color: "#460406", from: 101.2, to: 102.6 }    # optional fade to a colour
panels:
  - { at: 0.00, panel: S01-sb-01, beat: "1" }
  - { at: 5.00, panel: S01-sb-02, beat: "2", zoom: [1.0, 1.10], focus: [0.45, 0.55] }
  - { at: 21.60, panel: S01-sb-06, beat: "8 (holds 6)" }
  - { at: 94.84, panel: S01-sb-18b, beat: "18b", dissolve: 0.5 }
```

Each panel is held from its **at** until the next one. **zoom** pushes in (or out) across the hold, toward **focus** (the point of the panel, 0 to 1 across and down); **dissolve** fades in from the panel before over that many seconds. A panel can be used again (a hold). Times come from the scene's exposure sheet (its Time column), which is taken from the radio cut. A strip along the bottom shows the time, the beat and the panel, for review notes.

## Building the mix

The mix is built the same way as the radio cut, from the scene's **Mix plan** (a YAML code block under "Mix plan" on the row page), once the pictures are in place: the radio cut's cues with the follow-picture sounds matched to the picture, the motifs at their marks, and the levels finished.

```
node scripts/radio.js --scene 1 --mix --print   # every cue and its time
node scripts/radio.js --scene 1 --mix           # out/mix/scene-01/S01-mix.wav and S01-mix-cues.json
node scripts/upload.js --scene 1 mix            # after listening
```

### The mix plan

```yaml
include: Radio cut plan          # start from the radio cut's cues, filters and templates
loudness: -16
drop: [footsteps-in]             # cues of the radio cut left out (by id)
cues:
  - { id: footsteps-in, file: S01-sfx-footsteps-in, at: 6.1, level: peak -16, lane: Movement }   # same id: replaces it, matched to the picture
  - { asset: Motif A, at: priya-15.end + 7.0, level: peak -12, lane: Motif, what: "Motif A, one drop" }
```

Everything in the radio cut plan works here. **include** names another plan on the same page; a cue with the same id replaces that plan's cue, **drop** removes cues, every other cue is added, and settings written here (length, loudness, filters, templates) win. **asset** takes the sound from that Asset Library row's Reference Image (motifs are locked there, never per scene; `file:` picks one file when the row has several). The mix is a 24-bit wav, since the edit and the film pass build on it.

## Assembling a scene

`scripts/assemble.js` puts the scene's shots on its sound, as the edit plan says. Each clip's own sound is dropped; the sound is the scene's mix (or its radio cut, before the mix exists).

Saved locally: [Scene 1 partial cut through CO-04](out/assembled/scene-01/S01-CO01-to-CO04-partial-cut-20261110.mp4), 14 seconds with the scene radio cut. This checkpoint preserves the continuous-entry CO-01 repair; its original timestamped review and source takes are retained. Media under `out/` stays local and is not tracked by Git. The current rebuild plan remains on the [scene's Notion page](https://app.notion.com/p/3fb252f6b4ff8104aff1e148d25704e4); run `node scripts/assemble.js --scene 1 --review` to build from that current plan without overwriting this checkpoint.

```
node scripts/assemble.js --scene 1 --print         # every cut and the picture it will use
node scripts/assemble.js --scene 1                 # out/assembled/scene-01/S01-assembled.mp4
node scripts/assemble.js --scene 1 --frame CO-07   # out/frames/CO-07-cut.png: the frame where CO-07 is cut
node scripts/upload.js --scene 1 assembled         # after watching
```

### The edit plan

A YAML code block under "Edit plan" on the scene's row page:

```yaml
size: 1280x720
fps: 24
audio: mix                     # the Scene mix; "radio" uses the Scene radio cut
end: audio                     # the sound's length (or seconds)
grade: grades/physics.cube     # optional: one LUT (a .cube file in the project) over the whole scene
label: true                    # optional: a strip with the time and the shot, for review
fade: { color: "#460406", from: 101.2, to: 102.6 }
shots:
  - { at: 0.00, shot: CO-01 }                        # a STATIC shot: its start frame, held
  - { at: 5.00, shot: CO-02, from: 1.2 }             # its clip from 1.2 s in
  - { at: 13.80, shot: CO-03, still: true, zoom: [1, 1.04] }   # hold the start frame, with a slow push
  - { at: 21.60, shot: CO-05, panel: S01-sb-06 }     # no picture yet: the storyboard panel holds its place
  - { at: 94.84, shot: CO-13, dissolve: 0.5 }
```

Each shot is held from its **at** until the next. Its picture is its **Final shot** if it has one, else its **Generated clip**, played from **from** seconds in (default `clip_handles`, 1 s, past the start of the generated handle; 0 for a Final shot), else its **Start frame** held as a still. **still: true** holds the start frame even when a clip exists (a clip that won't behave). **zoom**, **focus** and **dissolve** work as in the animatic. A clip shorter than its cut holds its last frame, with a warning. The times come from the exposure sheet's Time column and the shots' Timing tables, so the edit stays on the radio cut.

Vineet can run `--frame CO-07` to export CO-07’s actual cut frame and supply it for the next shot’s Start frame. The assistant can identify the cut time, review the supplied image, and attach the exact file.

For an incremental review cut, set `review: true` and a numeric `end` in the Notion Edit plan, then run `node scripts/assemble.js --scene 1 --review --print` before building with `--review`. An unselected take can be named on its cut as `candidate: out/cold_open/CO-04-higgsfield-eb38a1b0.mp4`, with an explicit `from`. Candidates must be existing videos under `out/` and require `--review`; they do not fill the shot's selected media fields or approve it. Review outputs use unique `S01-review-<timestamp>.mp4` names, leaving the assembled production file alone. `audio: radio` keeps the radio cut continuous, including its existing overlaps; all source-clip audio is discarded.

Use `--heading "CO-01 repair plan"` to read a separate named plan from the scene page when testing a repair without replacing its main Edit plan.

## Local face repair

At each assembled-scene review, compare every readable face with its approved Asset Library **Face close-up**. When Vineet or the reviewer flags identity drift, test the affected interval of the shot with `npm run face-repair`. The Node.js command projects detail from the supplied close-up onto the tracked face. A small native helper uses Apple Vision to locate facial landmarks. It runs locally without API calls or generation credits.

Use the project’s Node.js setup on macOS with Apple Command Line Tools and FFmpeg.

```sh
npm run face-repair -- --shot CO-08 \
  --clip out/cold_open/CO-08-foreground-match-review.mp4 \
  --reference "$HOME/Downloads/aryan-face-closeup.jpg" \
  --from 20.5 --to 22.3 --protect-side left
```

Use clip time in seconds for `--from` and `--to`. Select a continuous interval with one intended subject. `--region x,y,width,height` limits face selection in a multi-person shot. Coordinates are in source pixels from the top left. `--protect-side left` or `right` reduces the blend near a phone or hand on that side of the screen. Input clips must be upright, progressive 8-bit SDR yuv420p at a constant frame rate.

Each successful run writes a full-length `review.mp4` and a silent `comparison.mp4` of the selected interval under `out/face-repair/<shot>/review-*/`. The original is on the left in the comparison. The script skips ambiguous or untracked faces and checks the review clip’s frame count, frame rate and audio. Judge identity, eye line, expression, edge stability and occlusion at normal speed. Strong profile, occlusion and motion blur can limit the repair. Use the repaired clip in a scene after Vineet selects it.

## Local lip-sync timing repair

Use this when a take already shows the correct words and their visible timing differs from the radio cut. Start with the exact standalone shot preview that contains the intended scene audio. Identify the first and last visible syllables for each affected line and pair them with the same moments in the radio cut. Use clip seconds for both times. Add a pair at a clear pause or word boundary when it helps. Equal times can pin a reaction or return the shot to its original pace.

```sh
npm run lip-sync -- --shot SHOT --clip out/path/to/shot-radio-review.mp4 \
  --anchor 3.00:5.63 --anchor 4.65:6.84 --anchor 8:8 --dry-run
```

Each anchor is `audio:picture`. `3.00:5.63` moves the picture at 5.63 seconds to the radio cue at 3.00 seconds. Keep both columns increasing. After checking the map, omit `--dry-run` to render. FFmpeg eases the picture timing between anchors and interpolates motion. The command preserves the exact audio and checks the output frame count, frame rate and dimensions. It writes a full shot `review.mp4` and a `comparison.mp4` with shared radio audio under `out/lip-sync/<shot>/review-*/`. The original is on the left.

Review the syllables and the motion at normal speed before using the result. The retime also affects gestures inside the repaired interval. Use an audio-driven mouth repair when the take shows different words or the mouth shapes do not match.

## Uploading files to Notion

`scripts/upload.js` puts a stage's files into the right field on the scene's row in the Scenes database, so nothing is dragged in by hand.

```
node scripts/upload.js --scene 1 storyboard            # every file in out/storyboard/scene-01/ → Storyboard
node scripts/upload.js --scene 1 animatic              # out/animatic/scene-01/ → Animatic
node scripts/upload.js --scene 1 radio-cut             # out/radio/scene-01/ → Scene radio cut
node scripts/upload.js --scene 1 storyboard out/storyboard/scene-01/S01-sb-05.png   # only this file
node scripts/upload.js --scene 1 storyboard --dry-run  # what it would upload
node scripts/upload.js --scene 1 storyboard --force    # upload again even where Notion already has the file
```

The stages and their folders: `radio-cut` (out/radio), `storyboard` (out/storyboard), `animatic` (out/animatic), `assembled` (out/assembled) and `mix` (out/mix), each in a `scene-NN/` folder; `sfx` (out/sound/scene-NN/approved) and `voice` (name the files), which `sounds.js` and `voice.js` already upload after you approve.

- Only new or changed files are uploaded: a file Notion already has, unchanged since this script uploaded it, is skipped; a changed file replaces the one of the same name. What was uploaded is remembered in `.cache/notion-uploads.json`.
- A file that is in Notion but was put there another way (by hand) is skipped unless `--force`.
- Nothing already in the field is removed, and the field stays sorted by file name (S01-sb-2 before S01-sb-10, 13a before 13b).
- JSON files are never uploaded. Files over 20 MB go up in parts. A free Notion workspace takes files up to 5 MB.

For a shot's start or end frame, name the shot and one image file:

```bash
node scripts/upload.js --shot CO-01 end-frame out/frames/scene-01/CO-01-end-frame.jpg --dry-run
node scripts/upload.js --shot CO-01 end-frame out/frames/scene-01/CO-01-end-frame.jpg
```

Use `start-frame` for the shot's Start frame field. This uses the Notion SDK,
keeps the image in `out/frames/scene-NN/`, and leaves shot statuses unchanged.
An identical upload is skipped. A populated frame field stops the command rather
than replacing an existing image or adding an ambiguous second frame. `--force`
applies only to scene uploads. Choosing a replacement is a separate review.

For any image Files field on a shot or scene row, use its exact Notion field name:

```bash
npm run upload -- --shot CO-01 --field "End frame" out/frames/scene-01/CO-01-end-frame.jpg
npm run upload -- --scene 1 --field "Master still" out/frames/scene-01/master.jpg
npm run upload -- --page "https://app.notion.com/p/CO-01-411252f6b4ff81019444d1c7b2ca76dc" --field "End frame" out/frames/scene-01/CO-01-end-frame.jpg --dry-run
```

Choose exactly one target: `--shot`, `--scene`, or `--page` (a Notion URL or page
ID). Direct page targets are checked against the project's configured Shots and
Scenes databases. `--field` accepts any existing Files property without adding it
to `config.yaml`; text and other property types are rejected. Name one or more
PNG, JPG, JPEG or WebP files. Add `--dry-run` to preview without uploading.

Custom image uploads append new filenames and preserve existing attachments.
Identical files previously uploaded by this script are skipped; a conflicting
filename stops the run, including a matching name with another extension.
Use a distinct filename to keep another image. Shot Start frame and End frame
fields still take one image and retain the single-frame safeguard above.
`--force` is unavailable with `--field`. The script uploads the files from their
given paths; save production images in `out/` before uploading.

## What a shot needs in Notion

The checker stops before anything is spent unless the shot's row has:

- **Model** set to Kling 3.0 or Kling 4.0 (see below)
- **Duration (s)**: the shot's length in the scene, cut from the radio cut. The generated length includes `clip_handles` seconds (currently 1) at each end and rounds up to whole seconds. The cap is 30 on Runway Dev and 15 on fal, handles included. `--print` shows both lengths.
- **Start frame** (and optionally **End frame**): a png, jpg or webp image. A reused frame is uploaded to this shot's own field too, so the row says exactly what is sent.
- all eight **Prompt:** fields filled in (Characters, Setting and look, Camera, Action, Dialogue, Timing, Environment, Keep still). Keep still holds the shot's own lines only; the standard block is added automatically.
- every `@name` in the prompt linked in the shot's **Elements**, as an Asset Library row whose Class is Character and which has a **Face close-up** and a **Reference Image**

Characters are written lowercase with underscores: the Asset Library row "Auto driver" is `@auto_driver`.

### Kling 3.0 or Kling 4.0

The shot's **Model** in Notion picks the route. `config.yaml → models` holds the fal settings and `lib/runway.js` holds the Runway request settings.

| | Kling 3.0 Pro on fal | Kling 4.0 on Runway Dev |
| --- | --- | --- |
| Generated length including handles | 3–15 s | 3–30 s |
| Character images for a linked `@aryan` | fal Element | Face close-up and sheet as separate references |
| Negative prompt | Configured negative prompt | Continuity directions in the main prompt |
| Audio | Off | Native audio, removed in the edit |
| Frames | Start and optional end | Start and optional end |
| Resolution | Pro | 1080p |

On Runway, `--print` shows the final grouped prompt and named reference files. The **DIALOGUE AND TIMING** section uses the shot's existing action, dialogue and timing text. Write exact visible lines next to their timed beats in Notion. The script appends the standard KEEP STILL block once. Runway accepts up to 10 images total across frames and references.

Use `@names` only for the characters whose assets should be sent. Places are established by the shot's frame and prompt. The explicit fal Kling 4.0 route takes frames only and its checker rejects character tags.

## The files

| File | What it is |
| --- | --- |
| `config.yaml` | The fal models (endpoint, price) for each Notion Model, Kling 3.0's audio off, the clip handles, parallel runs, the negative prompt, the standard KEEP STILL block, and the Notion field names the project reads |
| `scripts/pull.js` | Downloads shots' images from Notion into `.cache/notion/` |
| `scripts/generate.js` | The generator |
| `lib/runway.js` | Runway Dev request, ephemeral uploads, polling and price estimate |
| `scripts/voice.js` | Makes a scene's dialogue on ElevenLabs, cuts it into line files and uploads them to Notion |
| `scripts/sounds.js` | Makes a scene's other sounds on ElevenLabs Sound Effects and uploads them to Notion |
| `scripts/radio.js` | Builds a scene's radio cut, or with `--mix` its mix, from the plan on its row page |
| `scripts/animatic.js` | Builds a scene's animatic from its storyboard panels and radio cut |
| `scripts/assemble.js` | Assembles a scene from its shots' clips and stills, on its mix |
| `scripts/upload.js` | Uploads scene assets or a shot's start/end frame to Notion |
| `lib/video.js` | The picture side of the animatic and the assembled scene (ffmpeg) |
| `lib/voice.js` | Reads a scene's Sound script: the voice requests and the SOUNDS list |
| `lib/audio.js` | Finds the pauses and cuts a request into line files (ffmpeg) |
| `lib/notion.js` | Reads shots, characters and scenes from Notion with the Notion SDK, downloads images (for pull) and uploads voice files |
| `lib/` (the rest) | Prompt assembly, checks and the upload cache |

## How images move

`npm run pull` downloads a shot's images from Notion into `.cache/notion/`, each named by its Notion file id. Replacing a file in Notion gives it a new id, so the generator asks for a fresh pull instead of sending the old image.

fal reads images from URLs, so the generator uploads each local image to fal's own storage the first time it's used and kept there for 30 days. The URL is remembered in `.cache/uploads.json`, keyed by the file's content: an unchanged image is never uploaded twice. `.cache/` is git-ignored and safe to delete.

Runway uses ephemeral uploads valid for 24 hours. Shared images upload once per command. The generator records the task ID after submission so you can check its status in Runway Dev if a download or polling call fails.
