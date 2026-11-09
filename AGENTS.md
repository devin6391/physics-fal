# AGENTS.md

Instructions for any AI assistant working in this project (Codex, Claude Code, Antigravity or another). `CLAUDE.md` and `GEMINI.md` only point here, so every assistant reads the same rules. Nothing in the project depends on one assistant: what any of them can do depends only on whether it has Notion connected and a shell here.

This project makes the files for **Physics**, a Hindi/Hinglish AI horror short film made by Vineet: each scene's voices and sounds (ElevenLabs), its radio cut, animatic, mix and assembled cut, and the moving clips made on fal.ai (Kling 3.0 or Kling 4.0; the shot's Model in Notion decides). The editing and mixing are done by these commands, never in an editing app, so any assistant can redo them. Read `README.md` for how each command works.

## Where things live

Notion is the source of truth. Every command reads the scene or shot it works on straight from Notion; there are no local copies of scenes, shots or prompts. To change anything, change it in Notion. The production method, stage by stage, is the **Shot Production Playbook** in Notion: read it before working on a scene.

- **Shot Production Playbook:** the nine stages of making a scene, who does what, and the rules. https://app.notion.com/p/400252f6b4ff81c0be66c3c487b394e6
- **Start page:** what to read first and where everything lives. https://app.notion.com/p/394252f6b4ff80258e5be80ce282ff3d
- **How we make the film:** the map of the stages and the words used. https://app.notion.com/p/411252f6b4ff81cba517c8d8e7f272c1
- **Screenplay (Scene-by-Scene):** the source of truth for what happens and is heard; every change starts there. https://app.notion.com/p/411252f6b4ff814ca042edabbb24cc14
- **Film Structure (Scenes):** one row per scene: its exposure sheet, Radio cut plan, Animatic plan, Mix plan and Edit plan (on the row's page), its Sound script, and its files (voices, sounds, radio cut, storyboard, animatic, assembled scene, mix). https://app.notion.com/p/860e5425a76c43d08cd09837ac1f5272
- **Shots database:** one row per shot: what it shows, its timing from the radio cut, its frames, prompts and clips. https://app.notion.com/p/a1d5ee3618a54315ad3564098a704a8c
- **Asset Library:** the locked character sheets and face close-ups, and the motifs. https://app.notion.com/p/6a739b18341e46e59663a3485c530700
- **Decisions and changes log:** what was decided and why, and what changed. The other pages say only what is true now; history and reasons go here. https://app.notion.com/p/411252f6b4ff815e81cffded396d2c9e

Start and end frames, storyboard panels and stills are made by Vineet in Gemini, from prompts the assistant writes and he approves. A reused frame (CO-02 starting on CO-01's image) is uploaded to the reusing shot's own Start frame field too.

## Setting up an assistant

Each assistant connects to Notion through Notion's MCP server, `https://mcp.notion.com/mcp`; sign in to Notion once:

| Assistant | Reads | Notion | Once |
| --- | --- | --- | --- |
| Codex | `AGENTS.md` | `.codex/config.toml` | trust the project, then `codex mcp login notion` |
| Claude Code | `CLAUDE.md` → `AGENTS.md` | `.mcp.json` | approve the server, then `/mcp` and sign in |
| Antigravity | `AGENTS.md` (and `GEMINI.md`) | its own MCP settings, not in the project: add Notion's server there once | sign in when it asks |

Skills live in `.agents/skills` (Codex); `.claude/skills` links to the same folders for Claude Code. Chat apps (ChatGPT, claude.ai) have no shell here: they write in Notion and give Vineet the commands. The full guide, with instructions to paste into a chat app, is the Notion page **Setting up an assistant**: https://app.notion.com/p/411252f6b4ff818e80f6c76d9cee7da8

## The commands, by stage

| Stage | Command | What it does |
| --- | --- | --- |
| 3. Voices | `node scripts/voice.js --scene <n>` | Makes the scene's lines from its Sound script, waits for Vineet's OK, cuts and uploads them |
| 3. Sounds | `node scripts/sounds.js --scene <n>` | Makes the scene's other sounds from the SOUNDS section, waits for his OK, uploads them |
| 3. Radio cut | `node scripts/radio.js --scene <n>` | Builds the radio cut from the scene's Radio cut plan into `out/radio/scene-NN/` |
| 5. Animatic | `node scripts/animatic.js --scene <n>` | Builds the animatic from the Animatic plan, the panels and the radio cut into `out/animatic/scene-NN/` |
| any | `node scripts/upload.js --scene <n> <stage>` | Uploads a stage's new or changed files from `out/` to the scene's row |
| 7. Frames | `node scripts/upload.js --shot <shot> <start-frame\|end-frame> <image>` | Uploads one frame image to the shot's own field; stops if a different frame is already attached |
| any | `npm run upload -- --shot <shot> --field "<Files field>" <images…>` | Uploads images to any Files field; also accepts `--scene <n>` or `--page <URL-or-ID>` |
| 7. Clips | `npm run pull -- <shots>`, then `node scripts/generate.js <shots>` | Downloads a shot's images, then generates its clip on fal |
| 7. Chained shots | `node scripts/assemble.js --scene <n> --frame <shot>` | Saves the frame where a shot is cut, for the next shot's Start frame |
| 8. Edit | `node scripts/assemble.js --scene <n>` | Assembles the scene from its shots' clips and stills, as its Edit plan says, on its mix, into `out/assembled/scene-NN/` |
| 8. Mix | `node scripts/radio.js --scene <n> --mix` | Builds the scene's mix from its Mix plan into `out/mix/scene-NN/` |

## Reading and writing Notion

- **Visual reviews:** use `.agents/skills/cinematic-image-review/SKILL.md` after creating/replacing cinematic reference images and `.agents/skills/pre-video-review/SKILL.md` before final video-prompt approval. For these reviews, only the approved screenplay and approved assets are creative authority; the storyboard is strong suggestive evidence. Inspect actual images, report concrete defects/uncertainty, then ask Vineet to check the same inputs. Timing/plans and saved prompts supply execution context, not independent creative canon.
- **Scene-stage reviews:** use `.agents/skills/storyboard-review/SKILL.md` for panels before animatic work, `.agents/skills/radio-cut-review/SKILL.md` for rendered scene audio and cue timing, and `.agents/skills/animatic-review/SKILL.md` for the rendered picture-and-sound test before layout. These apply the existing Playbook; they do not authorize new rules, media approval or generation. Inspect current Notion sources and actual media, state any playback limitations, and leave final listening/viewing decisions to Vineet.
- **Use the Notion SDK first** (`@notionhq/client` with `NOTION_TOKEN`; reuse `lib/notion.js`). `node scripts/generate.js <shot> --print` shows what Notion holds for a shot and what would be sent; `--dry-run` checks it.
- When writing a Gemini frame prompt, keep its ordered input images in the shot page's **Gemini references** YAML block (format in `README.md`). `npm run refs -- <shot> --frame start|end` downloads those images to `out/refs/<shot>/`, skipping existing files.
- The project's integration writes only files on scene and shot rows (`voice.js`, `sounds.js`, `upload.js`); it needs the Update and Insert content capabilities. `upload.js --field` accepts any existing Files field, with `--shot`, `--scene` or a checked `--page` target. Other writes (text fields, plans, prompts, trials) go through the Notion MCP server above; without it, give Vineet the exact text and where it goes.
- An assistant that builds a file for a scene outside this project writes it to `out/<stage>/scene-NN/` and gives Vineet the upload command.
- Never copy a scene or shot into a local file to work from. If Notion and something local disagree, Notion wins.

## Rules that must not be broken

1. **Never spend money or credits without Vineet's explicit OK** on that exact prompt or request. Before any real run, show `--print` and `--dry-run`; a real run's spending question can only be answered with `--yes`, used only for the exact run he approved (same shots or requests, same takes, same cost).
2. **Never generate before the prompt is approved.** The order is always: write the prompt, put it in Notion, show it, wait for his OK, then generate (or he generates), then review the result together.
3. **Shots are defined in the Shots database.** Their IDs are working labels and a scene can be re-broken whenever it changes; order lives in the Order field. A shot owns no sound: all sound lives on its scene's row.
4. **Kling's sound is never used.** All sound belongs to the scene. `audio: false` in `config.yaml` applies to every Kling 3.0 shot; never change it. Kling 4.0 always generates sound and has no switch to turn it off, so its sound is removed in the edit; in a speaking shot its prompt still gives the exact line, so the mouth moves to the right words.
5. **Never overwrite or delete a take.** `out/` keeps every take; `log.csv` keeps every run, including failures.
6. **Keys live only in `.env`** (fal, Notion, ElevenLabs). Never print, log or commit them, or put them in Notion or chat.
7. **Do not change the KEEP STILL standard block, the negative prompt, `models:` or the Notion field names in `config.yaml` without asking.** They were written to stop specific failures, and a different model changes the price and the look.
8. **Clips on fal are at most 15 seconds, handles included.** A longer shot is split in Notion first, or made by Vineet on Higgsfield, where Kling 4.0 runs up to 30 seconds.
9. **One retry, then stop.** If a request fails twice, stop and report the error. Whether a clip came out wrong is Vineet's call after he watches it; never re-run a shot without his OK.
10. **Git is Vineet's.** Never commit or push unless he asks.

## What a shot needs in Notion to generate

- Model = Kling 3.0 or Kling 4.0, a Duration (s) (the shot's length in the scene, from the radio cut; the clip is generated `clip_handles` seconds longer at each end, rounded up, at most 15 on fal), a Start frame image, and all eight Prompt fields: Characters, Setting and look, Camera, Action, Dialogue, Timing, Environment, Keep still (the shot's own lines only; the standard block is added automatically).
- Characters are written `@aryan`, `@priya`, `@auto_driver`, `@shopkeeper`: lowercase with underscores, matching the Asset Library row's name, each linked in the shot's Elements. The script turns them into `@Element1`, `@Element2` … and attaches that row's Face close-up and Reference Image.
- **Places get no element.** The room, pond or road comes from the start frame.
- **Kling 4.0 takes no character images.** A Kling 4.0 prompt describes people in words, without `@names`, and everyone on screen must already be in the start frame. If a face must match its sheet (above all, someone walking in from off-frame), recommend Kling 3.0.

## Voices and sounds

The voice rules come from the Playbook and are built into `voice.js`: one request per speaker per Stability per scene, lines separated by `[long pause]`, one take, Similarity 75%, Eleven v4. It skips speakers whose line files are already in the scene's Voice files. `sounds.js` does the same for the scene's other sounds; motifs are made once in the Asset Library, never there. Never answer the listening question for Vineet: after a run, give him the file paths, and only when he says they are good run `--from-takes --approved --yes` to cut and upload. Which voice plays which character is his call; the lines, tags and Stability are written in Notion, never edited here. Every sound used must have a licence that allows a monetised video.

## After each generation

Every generation is a trial. Report: which shot and take, the cost, and what to check (does the face match the sheet, is any object duplicated, does the timing match). Approved clips go into the shot's Generated clip field, and each trial is logged in the Tasks database under the Trials log task (3.T), one subtask per trial: https://app.notion.com/p/401252f6b4ff81e0822fd40e4f3cc54a

## Working with Vineet

- He uses voice input: expect transcription errors and infer the intended meaning.
- Ask one question at a time, and keep answers short. Say plainly whether something is good enough instead of listing optional polish.
- Talk about the film in story terms ("the shot where he grabs the phone"), with scene and shot numbers only as a secondary reference.
- Before stating what a tool, model or plan offers today (Kling, Higgsfield, ElevenLabs, Gemini, fal, Notion), look it up and give the source; these change every few weeks. If it can't be checked, say it is unverified.
- Check Notion before writing to it: he may already have changed it. Never edit the story or the Screenplay without his confirmation.
- Never write versions, dates, change logs or the reasons behind a rule into the working pages (the Playbook above all); they say only what is true now. History and reasons go in the Decisions and changes log.
- Delete Notion pages or fields only when he asks, after listing exactly what goes. Tasks are never deleted: an outdated task is closed with a note. Tasks have at most one level of subtasks.
- He runs Higgsfield and Gemini himself; the assistant writes the prompts and settings and reviews what he shares.
- He prefers one take per generation, kept or replaced, over batches of takes.
- Before writing dialogue, tags or a performance, read the story, the screenplay, the character's full Character Bible entry and the scene's setup; never add an emotion the moment doesn't support.
