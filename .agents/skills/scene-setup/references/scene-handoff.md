# Scene setup handoff

Use this reference for a new scene, a return to an existing scene, or a revision that affects downstream artifacts. The [Playbook](https://app.notion.com/p/400252f6b4ff81c0be66c3c487b394e6) supplies the production rules and the [README](../../../../README.md) supplies command flags and plan formats.

## Where each deliverable lives

| Deliverable | Source or destination |
| --- | --- |
| Approved scene and adjoining beats | [Screenplay](https://app.notion.com/p/411252f6b4ff814ca042edabbb24cc14). The [main story](https://app.notion.com/p/394252f6b4ff8082afa1fab194d0172d) gives context. |
| Identity, behaviour, set and continuity | [Character Bible](https://app.notion.com/p/3a9252f6b4ff81b99239eb8aad4ed2f2), [World Bible](https://app.notion.com/p/07f7c101cc2347058a62e29b00758374), [Asset Library](https://app.notion.com/p/6a739b18341e46e59663a3485c530700). Link relevant assets on the scene row. If an asset is missing, determine whether this stage needs it. A rough storyboard can use an approved layout or sketch. |
| Scene setup | Scene row fields include Scene No, Location, Time, Assets, Stage and Open Calls. Reuse an existing row. Use the existing Scenes database if a new screenplay scene needs a row. |
| Exposure and performance | Scene page headings **Exposure sheet** and **Character performance arc**. Exposure rows carry beat ID, scene time, action, camera and relevant sound lanes. An arc records awareness, emotion, intensity, composure, expression or delivery and how each changes. |
| Voice and sound requests | Scene row **Sound script** field. Use the README's speaker headings, Stability syntax, numbered lines and **SOUNDS** format. Lock voices through the approved records and config. |
| Approved voice lines and effects | **Voice files** and **Scene SFX audio** fields. Local takes are under `out/voice/scene-NN/` and `out/sound/scene-NN/`. |
| Radio plan and measured audio | **Radio cut plan** heading and its YAML code block. Approved audio goes in **Scene radio cut**. Local outputs are `out/radio/scene-NN/SNN-radio-cut.mp3` and `SNN-radio-cut-cues.json` beside it. |
| Storyboard prompts and panels | **Storyboard prompts** heading. Record the beat or view, ordered inputs and each reference's purpose. Approved panel files are named `SNN-sb-XX` or lettered variants such as `SNN-sb-18b`, in **Storyboard** and `out/storyboard/scene-NN/`. |
| Animatic | **Animatic plan** heading and its YAML code block. Approved render goes in **Animatic**. The local output is `out/animatic/scene-NN/SNN-animatic.mp4`. |

The scripts look for the first code block below the exact **Radio cut plan** and **Animatic plan** headings, before the next heading. Reuse those headings when updating plans. Use the Notion SDK for project reads and media upload. Use the connected Notion tools for text and plan writes. If an assistant lacks a shell or a necessary connection, hand off the exact command or text and identify what remains pending.

## Command checkpoints

Replace `N` with the scene number and `NN` with its zero-padded form. Follow the README for terminal interaction, targeted replacements and plan syntax.

- **Voices and effects.** Run `node scripts/voice.js --scene N --print` and `--dry-run` for voices and `node scripts/sounds.js --scene N --print` and `--dry-run` for effects, as applicable. Show the actual request, settings and cost before generation. Voice requests group by speaker and Stability. A one-line change can require a grouped request, so show what the command would regenerate. Have Vineet listen to the actual take. With a previously approved take, the corresponding command with `--from-takes --approved --yes` cuts/uploads voices or uploads effects. Check that the latest take is the one approved before using `--from-takes`. A dialogue-free scene can go straight to its sound requirements.
- **Radio.** Run `node scripts/radio.js --scene N --print`, then `node scripts/radio.js --scene N`. Anchor dependent cues to measured line starts or ends where the relationship matters. Keep each speaker's full line during overlaps. Check phone/distance filters for duplicate processing, and distinguish silence warnings from deliberate silence. After listening approval, upload the exact render with `node scripts/upload.js --scene N radio-cut out/radio/scene-NN/SNN-radio-cut.mp3`. Use the measured cue JSON for the exposure times.
- **Storyboard.** After Vineet selects the panels, use `node scripts/upload.js --scene N storyboard` with explicit approved filenames. A panel may cover several beats. Use lettered variants for distinct views or states within a beat.
- **Animatic.** Run `node scripts/animatic.js --scene N --print`, then `node scripts/animatic.js --scene N`. It uses the scene's attached radio and storyboard by default. For a local comparison, use `--local` after checking which files it will read in the standard folders. After viewing approval, run `node scripts/upload.js --scene N animatic out/animatic/scene-NN/SNN-animatic.mp4`.

Radio and animatic builds use fixed output names. Preserve earlier accepted renders and keep the candidate identifiable when iterating. Use explicit file paths for uploads when candidate and accepted files coexist. The renderer and review skills can establish different things. A cue list establishes timing, while Vineet's listening establishes delivery and audible balance. Record what was actually reviewed.

## Change only what the revision affects

- A new voice take, line delivery or pause can change later timing even when the text stays the same. Keep the affected beat IDs, align the revised radio plan and exposure times from measured cues, then update and review the affected animatic. Reuse panels whose staging remains valid.
- A panel change may need an animatic rebuild with the same radio cut. An ambience adjustment can leave panel times alone if it changes neither cue times nor scene duration. Check the actual render before calling it current.
- Put sound that needs finished contact or movement into the later mix when the radio stage only needs its timing mark. Leave locked motifs and intentional silences tied to the approved sound design. If an adjoining scene's handoff changes, raise the exact conflicting image or sound cue before committing it downstream.
- When a candidate replaces an approved output, record the selection and reconcile the dependent plans and attachments together. Keep local comparisons clearly identified while approval is pending.

[Scene 1](https://app.notion.com/p/3fb252f6b4ff8104aff1e148d25704e4) is a worked example. The CO-05 voice and pause revisions changed measured times, so the exposure and animatic needed the new timing. The CO-06B comparison used a distinct radio cut and animatic while the published attachments still had the earlier timing. Use the exact pair identified in the review for timing comparisons.

## Resume from a different thread

Record a short checkpoint on the scene row, using the existing notes or a review section:

- **Current stage and decision:** what Vineet approved and what still needs a decision.
- **Current inputs and outputs:** exact Notion fields or headings, filenames and local paths where relevant. Include the radio version and duration when timing depends on it.
- **Next action:** one concrete task, with the pending cue, beat, command or asset if applicable.

A fresh thread can use: “Use scene-setup for Scene N. Read its Notion row and current files, then continue from the first missing dependency through the animatic.” A different machine needs the same repo, Notion connection, and any local files that the checkpoint names. Approved Notion attachments provide shared media when the local files are absent.
