---
name: animatic-review
description: Review a Physics scene's rendered animatic for story readability, staging, emotional progression, picture/sound timing and assembly artefacts before shot production or after panels, audio or the plan change.
---

# Animatic review

Use to test whether the scene works in time with its approved audio before investing in production pictures. Catch missing information, mistimed reactions, misleading holds and stale assembly as well as visible defects. The result guides a specific panel/plan correction or production-shot decision, not a demand for finished animation in a rough animatic.

## Sources and exact render

Read the current [Shot Production Playbook](https://app.notion.com/p/400252f6b4ff81c0be66c3c487b394e6), especially stages 3–6 and change handling. Fetch the scene row, current review notes, Animatic plan and Animatic attachment, Storyboard panels/prompts, exposure sheet/arc and approved Scene radio cut/cue list. Reuse project SDK reads/downloads (`lib/notion.js`); MCP handles text edits. Do not save source scene/shot text or plans to local working files.

- The approved **Screenplay and approved assets** are creative authority. Read the relevant action, words and adjoining moments. The storyboard is strong suggestive staging evidence; rough faces/furniture/style do not redefine cinematic canon.
- Approved radio audio and measured cues govern existing execution timing. Exposure, arc, panels and plans implement the screenplay, not an independent story. A conflict is a finding to resolve with Vineet, not permission to rewrite approved audio or character knowledge. Read story/setup and the full Character Bible entry before proposing a new performance.
- Identify the exact video file/attachment, its candidate/approved state, duration, size/fps, embedded audio and the panel/radio inputs claimed by its plan. Hash when names can refer to different bytes. Files in `out/animatic/scene-NN/` are useful only after their relation to Notion is established; a local candidate is not an accepted attachment.

Check input/render freshness. The current plan or newly attached panel can differ from the video still attached under the same name. `node scripts/animatic.js --scene N --print` resolves the current plan and timing without rendering video; it does not prove the existing video contains those changes. Read README for format and selection behaviour. Inspect the intended attachment instead of rebuilding it for review: the build writes a fixed output path. Ambiguous multiple audio/video candidates need resolution; do not choose by directory order or filename alone.

## Watch, hear and cross-check

Review the entire render at normal speed with its sound when the environment supports this. Then inspect critical transitions, reveals and suspicious intervals, using nearby frames/panels and exact cue times. Note scope and actual modality available. Contact sheets or sampled frames support coverage checks but cannot establish rhythm, smooth motion, lip sync or full-frame continuity. If only samples/technical checks are possible, label those judgements **Uncertain** and request Vineet's playback of the exact intervals. Never claim to have watched/heard the scene merely because a player was launched, a widget emitted or ffmpeg decoded it.

Use ffprobe/ffmpeg as available to inspect streams, duration, decoding, black/frozen intervals and frame samples. Avoid arbitrary global thresholds: a held panel, black interval, fade, static opening or red ending can be intentional. Compare the actual interval with the current plan and screenplay. Where necessary, compare embedded audio with the approved radio cut using listening and alignment/signal evidence; differing file hashes across codecs do not prove altered content. Codec padding alone is not a meaningful sync error. No unapproved paid analysis/transcription service.

| Check | What to establish |
| --- | --- |
| End-to-end meaning | The order of actions/reactions and cause/effect are clear. Required information and reveals are visible when intended; the audience can read the fall, glance, phone state or other story-critical change. Distinguish character awareness from audience knowledge. |
| Coverage and timing | Map rendered intervals to beats/panels and radio events. No unexplained gaps, omitted required views, stale/wrong panels or accidental extra holds. A panel may span several beats or voices, including overlap; there is no one-panel/shot-per-speaking-turn rule. |
| Sound and sync | Embedded audio is the intended radio cut, without unexplained offset, truncation, duplication, replaced take or stretch. Action/reaction/reveal timing agrees with the actual heard cue, not just a plan number. Record scene time, not a generated clip's handle time. |
| Performance arc | Changes in pose, gaze, expression, composure and energy fit the source and have time to read. Listening holds are legitimate. Rough held faces need not animate or mouth every word; flag an informationally misleading held state, not the absence of final performance. |
| Camera and continuity | Intended pushes, framing, screen direction, eyelines and spatial transitions are understandable. Crops must retain required hands/props/reveals. Check object/door/hand state between panels, distinguishing intentional cut/reverse view from a confusing jump. A 2D panel push suggests camera intent but does not prove a feasible physical 3D path. |
| Rhythm and visibility | Are essential gestures/reactions too brief, or holds misleadingly long for their job? Give the exact evidence and smallest visual repair. Do not prescribe motion or a new cut simply because a hold exists. Preserve approved timing when a visual repair is enough. |
| Assembly/AI defects | Unintended black frames, flash frames, broken dissolves, wrong sequence, stretched geometry, damaging crop, duplicated/vanishing story elements or unreadable critical text. Distinguish drawing looseness, temporary review labels and intentional fades from defects. Use `$storyboard-review` for a panel problem; cinematic polish belongs later. |
| Production handoff | Identify which staging decisions can feed manageable production shots, and which unresolved transitions need attention. Panels, beats, animatic cuts and generated-shot boundaries are different things. Propose a merge/split only when it preserves essential information/performance and addresses a concrete production need; do not create rows automatically. |

Apply `$radio-cut-review` to a suspected audio problem without changing the audio to accommodate a weak picture. An intended supernatural event is not a physics defect. Do not require every cinematic reference or final clip before this rough planning stage can pass.

## Findings and next step

Keep **Animatic review** on the existing scene page. Include exact inputs, references, freshness status and actual watch/listen coverage. Findings use **scene interval / beat / panel | Pass / Needs correction / Uncertain / N/A | observed evidence and source | smallest correction**. Separate defects in the source panel, the plan, the render and the audio; name the owner so the repair happens at the right stage. No fabricated percentage/slop score.

- **AI result:** Ready for Vineet's animatic check / Needs correction / Insufficient evidence. Unavailable required playback evidence remains explicit; a structural check alone cannot pass pacing or sync.
- **Human result:** Pending / Confirmed for this render / Corrections requested. Give the exact video, relevant panels/references and named timestamps; explicitly ask Vineet to watch/check those same inputs and the complete scene. Approval of the plan or an older export is not approval of changed media.

Propose the smallest correction, retaining good panels, story beat IDs and approved radio timing. Show any essential retiming or story change for approval first. Do not edit the screenplay, upload/select a render, advance Stage/Status, generate new assets or spend from this review. Preserve existing outputs before an authorized rebuild to a fixed filename; a changed plan is not a repaired video until rebuilt and reviewed.

After acceptance, carry tested staging and measured intervals into the working rows in the Shots database, with unresolved production risks explicit. After changes, recheck affected intervals and joins, plus whole-scene flow, and identify stale shot/frame/prompt/edit dependencies. Keep current findings on working pages and history in its log. New production-rule proposals go to Vineet for review before being saved in the Playbook.
