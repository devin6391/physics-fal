# CLAUDE.md

This project generates the moving clips for **Physics**, a Hindi/Hinglish AI horror short film made by Vineet. It sends approved prompts and images to Kling 3.0 on fal.ai, one shot or section at a time. Read `README.md` for how it works.

## Where things live

Notion is the source of truth. Every run reads the shot's prompt, duration, frames and characters straight from Notion; there are no local copies of shots, prompts or images. To change a shot, change it in Notion.

- **Shots database:** one row per shot, holding the approved prompt sections, frames and clips. https://app.notion.com/p/a1d5ee3618a54315ad3564098a704a8c
- **Film Structure (Scenes):** one row per scene, with the scene's production plan and sound plan. https://app.notion.com/p/860e5425a76c43d08cd09837ac1f5272
- **Asset Library:** the locked character sheets and face close-ups. https://app.notion.com/p/6a739b18341e46e59663a3485c530700
- **Shot Production Playbook:** the full production rules. https://app.notion.com/p/400252f6b4ff81c0be66c3c487b394e6

Start and end frames are made by Vineet in Gemini (his Google AI Pro plan), not by this project. He uploads them to the shot's row in Notion. A reused frame (CO-02a starting on CO-01's image) is uploaded to the reusing shot's own Start frame field too. The project's scripts only read from Notion.

## Reading and writing Notion

- **Use the Notion SDK first.** Read shots through the project: `node scripts/generate.js <shot> --print` shows exactly what Notion holds for a shot and what would be sent, and `--dry-run` checks it. For anything the scripts don't cover, write a small script with `@notionhq/client` and `NOTION_TOKEN` (reuse `lib/notion.js`).
- **The Notion MCP is the fallback**, for what the SDK can't do: the integration is read-only, so writes (filling prompt fields, logging trials, attaching clips) go through the MCP for now, as do pages the integration hasn't been given access to.
- Never copy a shot into a local file to work from. If Notion and something local disagree, Notion wins.

## Rules that must not be broken

1. **Never spend money without Vineet's explicit OK** on that shot's prompt. Before any real run, show `--print` and `--dry-run` output; only run for real when he says so. The script's "Spend about $X?" question cannot be answered from Claude's shell, so a real run needs `--yes`; use it only for the exact run he approved (same shots, same takes, same cost), never otherwise.
2. **Shot IDs never change.** When a shot is split, the pieces get letters (CO-02 → CO-02a, CO-02b, CO-02c). Never renumber shots; edit order lives in Notion's Order field.
3. **Kling's audio stays off.** Voices, sound effects and beds are made separately and mixed in CapCut. `audio: false` in `config.yaml` applies to every shot; never change it.
4. **Never overwrite or delete a take.** `out/` keeps every take; `log.csv` keeps every run, including failures.
5. **The fal key and the Notion token live only in `.env`.** Never print it, log it, commit it, or put it in Notion or chat.
6. **Do not change the KEEP STILL standard block or the negative prompt** in `config.yaml` without asking. They were written to stop specific failures (a duplicated phone, faces drifting, people looking into the lens). The same goes for `model:` and the Notion field names in `config.yaml`: a different model changes the price and the look.
7. **Clips are 3 to 15 seconds.** Anything longer is split into lettered pieces in Notion first.
8. **One retry, then stop.** If a request fails twice, stop and report the error instead of retrying again. Whether a clip came out wrong is Vineet's call after he watches it; never re-run a shot without his OK.

## What a shot needs in Notion

- Model = Kling 3.0, a whole-number Duration (s) from 3 to 15, a Start frame image, and all eight Prompt fields: Characters, Setting and look, Camera, Action, Dialogue, Timing, Environment, Keep still (the shot's own lines only; the standard block is added automatically).
- Characters are written `@aryan`, `@priya`, `@auto_driver`, `@shopkeeper`: lowercase with underscores, matching the Asset Library row's name. Each must be linked in the shot's Elements. The script turns them into `@Element1`, `@Element2` … and attaches that row's Face close-up and Reference Image.
- **Places get no element.** The room, pond or road comes from the start frame, so write "The hostel room at night …", not `@hostel_room`.

## After each run

Every generation is a trial. Report to Vineet: which shot and take, the cost, and what to check (does the face match the sheet, is any object duplicated, does the timing match). Approved clips go into the shot's **Generated clip** field in Notion, and each trial is logged in the Tasks database under the **Trials log** task (3.T), one subtask per trial: https://app.notion.com/p/401252f6b4ff81e0822fd40e4f3cc54a

## Working with Vineet

- He uses voice input, so expect transcription errors and infer the intended meaning.
- Ask one question at a time.
- Talk about the film in story terms ("the shot where he grabs the phone"), with shot IDs as a secondary reference.
- Keep his effort low: do the work, then show the result.

## Code

- Node.js 20+, ES modules, four dependencies (`@fal-ai/client`, `@notionhq/client`, `yaml`, `dotenv`). Keep it that small.
- After any code change, run `npm run check` (the cold open's dry run) and `--print` on a shot to check that nothing broke. Problems reported as "… in Notion" (an empty field, a missing start frame, a place written as `@name`) are content to fix in Notion, not code bugs.
