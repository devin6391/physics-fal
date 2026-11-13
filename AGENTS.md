# AGENTS.md

Instructions for any AI assistant working in this project (Codex, Claude Code, Antigravity or another). `CLAUDE.md` and `GEMINI.md` only point here, so every assistant reads the same rules. Nothing in the project depends on one assistant: what any of them can do depends only on whether it has Notion connected and a shell here.

This project makes the files for **Physics**, a Hindi/Hinglish AI horror short film made by Vineet: each scene's voices and sounds (ElevenLabs), its radio cut, animatic, mix and assembled cut, and the moving clips made with Kling 4.0 on Runway Dev or Kling 3.0 on fal. The shot's Model in Notion decides. The editing and mixing are done by these commands, never in an editing app, so any assistant can redo them. Read `README.md` for how each command works.

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

Vineet captures and supplies every production Start frame, including when it is the preceding shot’s actual cut frame. Assistants never capture, extract, or export an image for use as a Start frame. They can identify the source clip and cut time, write image prompts, review Vineet’s supplied image, and attach that exact file to the shot’s Start frame field. Vineet makes end frames, storyboard panels and stills in Gemini from prompts he approves.

Assistants can help repair existing video in chat and use available tools on Vineet’s Mac to render local review copies. Keep the original take and let Vineet select any repaired copy for production.

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
| 7. Clips | `npm run pull -- <shots>`, then `node scripts/generate.js <shots>` | Downloads a shot's images, then generates its clip on the selected route |
| 7. Chained shots (Vineet) | `node scripts/assemble.js --scene <n> --frame <shot>` | Vineet can export the actual cut frame and supply it for the next shot's Start frame |
| 8. Edit | `node scripts/assemble.js --scene <n>` | Assembles the scene from its shots' clips and stills, as its Edit plan says, on its mix, into `out/assembled/scene-NN/` |
| 8. Mix | `node scripts/radio.js --scene <n> --mix` | Builds the scene's mix from its Mix plan into `out/mix/scene-NN/` |
| 7–8. Face repair | `npm run face-repair -- --shot SHOT --clip VIDEO --reference IMAGE --from SECONDS --to SECONDS` | Uses the approved Face close-up to repair a flagged shot interval locally on Mac and makes review copies |

## Reading and writing Notion

- **Scene setup:** use `.agents/skills/scene-setup/SKILL.md` to start or resume a scene from its existing Notion row through the approved animatic. Leave the current decision, exact artifacts and next action on that row for the next thread. Production shot layout starts after the animatic handoff.
- **Visual reviews:** use `.agents/skills/cinematic-image-review/SKILL.md` after creating/replacing cinematic reference images and `.agents/skills/pre-video-review/SKILL.md` before final video-prompt approval. For these reviews, only the approved screenplay and approved assets are creative authority; the storyboard is strong suggestive evidence. Inspect actual images, report concrete defects/uncertainty, then ask Vineet to check the same inputs. Timing/plans and saved prompts supply execution context, not independent creative canon.
- **Video reviews:** `pre-video-review` checks a proposed prompt/request without needing generated footage; `.agents/skills/generated-video-review/SKILL.md` checks an actual take. Both use the cinematic-conversion brief and source-coverage ledger linked from their skills: inherited information, required acting/emotional development, cinematography and physical/timing continuity. State which actual sources/media were checked and which remain unverified. A wording check is not a complete cinematic review.
- **Face continuity:** after each scene is assembled, use the generated video review to check every readable face against its approved Asset Library Face close-up, including turns, approaches and shot joins. If Vineet or the reviewer finds visible identity drift during shot or scene review, use the local face repair command on the affected shot interval. Show the comparison and get Vineet’s decision before using the repair in an edit.
- **Video prompt creation:** use `.agents/skills/video-prompt-creation/SKILL.md` to propose a source-grounded creative decision matrix with recommendations, reasons and editable importance weights. Vineet verifies creative choices and priorities before prompt drafting. Keep the matrix on the existing shot page; then use `pre-video-review` on the exact prompt/request. Matrix approval does not authorize generation or spending.
- **Video generation:** use `.agents/skills/video-generation/SKILL.md` when Vineet asks to generate a shot. First ask him to choose manual Higgsfield or the Runway Dev API if he has not chosen a route for this shot.
- **Scene-stage reviews:** use `.agents/skills/storyboard-review/SKILL.md` for panels before animatic work, `.agents/skills/radio-cut-review/SKILL.md` for rendered scene audio and cue timing, and `.agents/skills/animatic-review/SKILL.md` for the rendered picture-and-sound test before layout. These apply the existing Playbook; they do not authorize new rules, media approval or generation. Inspect current Notion sources and actual media, state any playback limitations, and leave final listening/viewing decisions to Vineet.
- **Use the Notion SDK first** (`@notionhq/client` with `NOTION_TOKEN`; reuse `lib/notion.js`). `node scripts/generate.js <shot> --print` shows what Notion holds for a shot and what would be sent; `--dry-run` checks it.
- When writing a Gemini frame prompt, keep its ordered input images in the shot page's **Gemini references** YAML block (format in `README.md`). `npm run refs -- <shot> --frame start|end` downloads those images to `out/refs/<shot>/`, skipping existing files.
- The project's integration writes only files on scene and shot rows (`voice.js`, `sounds.js`, `upload.js`); it needs the Update and Insert content capabilities. `upload.js --field` accepts any existing Files field, with `--shot`, `--scene` or a checked `--page` target. Other writes (text fields, plans, prompts, trials) go through the Notion MCP server above; without it, give Vineet the exact text and where it goes.
- An assistant that builds a file for a scene outside this project writes it to `out/<stage>/scene-NN/` and gives Vineet the upload command.
- Never copy a scene or shot into a local file to work from. If Notion and something local disagree, Notion wins.

## Rules that must not be broken

1. **Never spend money or credits without Vineet's explicit OK** on that exact prompt or request. Show `--print` and `--dry-run` before a real run. Runway displays the full API contract, prompt, files and cost at a mandatory live `y/n` pause. Show that preview and relay Vineet's answer to the same paused process, or let him answer in his terminal. Runway rejects `--yes` and piped input. For other commands that support `--yes`, use it only for the exact run he approved.
2. **Never generate before the prompt is approved.** The order is always: write the prompt, put it in Notion, show it, wait for his OK, then generate (or he generates), then review the result together.
3. **Shots are defined in the Shots database.** Their IDs are working labels and a scene can be re-broken whenever it changes; order lives in the Order field. A shot owns no sound: all sound lives on its scene's row.
4. **Kling's sound is never used.** All sound belongs to the scene. `audio: false` in `config.yaml` applies to every Kling 3.0 shot; never change it. Kling 4.0 always generates sound and has no switch to turn it off, so its sound is removed in the edit; in a speaking shot its prompt still gives the exact line, so the mouth moves to the right words.
5. **Never overwrite or delete a take.** `out/` keeps every take; `log.csv` keeps every run, including failures.
6. **Keys live only in `.env`** (Runway, fal, Notion, ElevenLabs). Never print, log or commit them, or put them in Notion or chat.
7. **Do not change the KEEP STILL standard block, the negative prompt, `models:` or the Notion field names in `config.yaml` without asking.** They were written to stop specific failures, and a different model changes the price and the look.
8. **Clips on Runway Dev are at most 30 seconds and clips on fal are at most 15 seconds, handles included.** Resolve longer shots in the shot plan before generation.
9. **One retry, then stop.** If a request fails twice, stop and report the error. Whether a clip came out wrong is Vineet's call after he watches it; never re-run a shot without his OK.
10. **Git is Vineet's.** Never commit or push unless he asks.

## What a shot needs in Notion to generate

- Model = Kling 3.0 or Kling 4.0, a Duration (s) (the shot's length in the scene, from the radio cut; the clip is generated `clip_handles` seconds longer at each end, rounded up), a Start frame image, and all eight Prompt fields: Characters, Setting and look, Camera, Action, Dialogue, Timing, Environment, Keep still (the shot's own lines only; the standard block is added automatically).
- Characters whose images should be sent are written `@aryan`, `@priya`, `@auto_driver`, `@shopkeeper`: lowercase with underscores, matching the Asset Library row's name, each linked in the shot's Elements. The script attaches that row's Face close-up and Reference Image as separate Runway references or as fal `@Element1`, `@Element2` … on Kling 3.0.
- **Places get no element.** The room, pond or road comes from the start frame.
- **Runway Dev is the default for Kling 4.0.** The command uses 1080p with a start frame, an optional end frame and up to ten images in total including character references. Check the exact prompt and image list with `--print`. The older frames-only fal route is available with explicit `--provider fal` for Kling 4.0.

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
