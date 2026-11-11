---
name: video-prompt-creation
description: Create Physics video prompts through a source-grounded decision matrix with assistant recommendations and user-editable importance weights. Ask Vineet to verify creative choices before drafting; then hand the prompt to pre-video-review. Does not generate video.
---

# Video prompt creation

Use when creating or materially revising a shot's video-generation prompt. Begin with a reviewable creative decision matrix, not prompt prose. Vineet owns creative direction and priorities; assistant recommendations are proposals until he confirms them. Existing explicit approvals remain usable for the same unchanged choice and scope.

Read [Cinematic conversion and source coverage](../pre-video-review/references/cinematic-review.md) and [Matrix format and weight semantics](references/decision-matrix.md). Use the shared conceptual/source framework as `$pre-video-review`; creation proposes choices and obtains direction, while the reviewer tests whether the resulting request fulfils that approved direction.

## Establish the inherited work and the actual gap

Read the current Playbook, Notion shot/scene, source screenplay and adjoining moments, relevant character and World Bible context, approved assets and saved image prompts, exposure/performance arc, actual relevant storyboard/animatic material, approved radio/cues and neighbouring shot states. Use the shared coverage ledger: identify what was checked, reused unchanged, partial, unavailable or N/A with a reason. Do not claim playback from plans, transcripts or frame samples. Use approved measured cues where they already establish timing; avoid remaking upstream work.

Use the project SDK first (`lib/notion.js`) for reads/files and MCP for text changes. Inspect the actual current reference pixels. Keep scene/shot text, matrices and prompts on their existing Notion page, not in local working files or a new database/schema. Generic skill templates are not local copies of a shot.

The approved screenplay and approved assets are creative authority. Storyboard is strong suggestive staging evidence; the animatic/radio supply tested staging and execution timing. Context does not silently override canon. Before proposing performance, read the full relevant Character Bible entry with story/setup and approved screenplay. Identify conflicts instead of solving them by inventing a new source fact.

Explain the video's specific cinematic contribution in one or two sentences: what necessary acting, expression/composure over time, physical interaction or continuous camera experience it adds beyond the already working animatic and cinematic stills. Establish the performance chain: **intent/awareness → emotion and intensity → composure → readable face/body/gaze/voice cues → change or sustained state → ending state**. A slow camera must not accidentally slow an urgent actor. Emotion may already exist in a still; motion sustains or develops it rather than always starting from neutral.

If a still with scene sound/editorial treatment already fulfils the entire job, include that as an option for Vineet. Do not silently change shot type, split/merge shots, add images, retime the exposure/radio or move a later reaction earlier. Do not invent an exact grip or final pose where flexible execution suffices.

## Build the weighted decision matrix

Save a **Video direction matrix — for creative review** on the existing shot page and show it in chat. Use the reference template. Give rows stable IDs so Vineet can change a choice or weight without rewriting the table. Each row records the source/inherited decision, the actual gap, a concrete assistant recommendation with a brief reason, proposed importance, Vineet's response and approval state. Distinguish source requirements, creative choices and technical facts. Put unresolved assumptions/conflicts in plain sight.

Cover applicable aspects without filling a quota of rows:

- Cinematic job, audience emphasis and story-critical information.
- Character intent/emotion and progression; composure; facial/gaze expression; body expression/pace. Split these when they need different priorities, especially where the face is barely visible.
- Framing/viewpoint, perspective/lens character, focus/depth of field and essential background visibility.
- Camera path, speed/easing, stabilisation and endpoint, separately from actor movement.
- Lighting sources/direction, time of day, contrast/color/readability and exposure/light changes through motion.
- Physical action/contact, prop state/scale, spatial continuity and relevant secondary motion.
- Approved timing, overlaps and visual handoff to neighbouring shots.
- Look/texture/motion rendering only when not already supplied or when a change is proposed.
- Actual workflow/input roles and technical settings; treat feasibility as facts to verify and creative consequences as decisions to review.

Combine related choices when one priority genuinely covers them; separate choices when combining would hide a disagreement or different weight. Already approved reference appearance can be one inherited row instead of a fresh wardrobe/furniture specification. N/A aspects need a short reason. Expose the decisions, not a long inventory of possible cinematic effects.

**Weights:** propose a shot-specific importance weight, normally 1–5, and explain why. These are editable creative priorities, not objective quality scores, confidence, model input weights or prompt-word allocations. They need not total 100. Vineet can change any weight, choose another scale, add/remove rows or mark a detail flexible. Do not silently normalise weights, manufacture an overall slop score or convert priority into repetition/model settings. A low weight does not waive a screenplay requirement, approved timing, basic physical coherence (subject to intentional supernatural rules), protection rule or paid approval. A proposal to change a requirement returns to the appropriate source and Vineet.

## Obtain creative direction before drafting

After presenting the concrete matrix, ask for Vineet's creative opinion and weight changes. Prefer one concise question at a time, focusing first on high-impact open choices or a real conflict. He may approve the whole identified matrix at once, or reply by row IDs; do not force a long per-row questionnaire. Show material alternatives where useful with their story/performance consequences; avoid gratuitous options for settled decisions.

- All newly proposed creative choices and weights remain **Pending** until explicitly confirmed. An assistant recommendation, a sensible default, an upload or silence is not approval.
- Reuse an earlier explicit approval only for the same identified choice, inputs and scope. Label its source rather than asking for it again. Do not reopen unchanged approved identity/set decisions merely because they appear in the matrix.
- “Okay” applies to the choice/matrix actually presented. A response about one row does not approve unrelated rows. Approval of weights alone does not approve the recommendations, and approval of recommendations does not approve a later paid run.
- Apply Vineet's edits accurately. Show revised dependent proposals where his change affects other creative decisions. Approval remains valid for unaffected rows; changed creative rows need his check. Never change the story/Bibles/locked assets automatically to reconcile feedback.
- Until creative direction and priorities are confirmed, stop at the matrix/brief. Continue independent source checks and technical feasibility work, but do not compose a model-ready prompt that embeds unapproved creative decisions. If evidence is missing, name exactly what is missing; do not hide a guess under a high weight.

Keep current decisions/status in the working matrix; put abandoned alternatives and reasons/history in the Decisions log when appropriate. This skill does not authorize new Playbook rules; those are reviewed with Vineet before being saved there.

## Translate approved direction into the prompt

Once the matrix's creative direction and priorities are confirmed:

1. Verify the selected provider/model/mode and actual supported inputs/controls in official documentation or the UI. Keep the user's route. Mark unknown picker bindings/price as unknown; do not invent a control or transfer another model's flags.
2. Bind each actual input once to its approved role. Carry settled visual information forward; write only necessary performance, physical action, camera/focus/light change and timed progression that images do not supply. An ordinary reference is not a guaranteed keyframe. Weights guide emphasis and acceptance priorities, not additional adjectives, new gestures or altered timings.
3. Use the existing eight Notion Prompt fields with distinct jobs, plus a complete copyable manual prompt where applicable. Keep them aligned with the matrix and actual inputs. Keep edit bookkeeping/settings outside model prose when unnecessary; label the relevant time basis and preserve handles/in-point calculations. All scene sound remains scene-owned; speaking prompts use approved exact words for mouth motion.
4. Write positive, visible directions at the shot's scale. Keep useful physical constraints tied to named risks. Avoid repeated appearance/environment already supplied, generic cinematic decoration and unnecessary numerical camera specifications. Do not append the matrix, weights, rationale or approval discussion to the generation prompt.
5. Append the protected standard block exactly once where required; preserve protected negatives/model/config/field names. If these conflict with a necessary creative requirement, show the precise proposed exception for approval instead of silently changing them.
6. Run `$pre-video-review` on the exact images, full prompt/settings and approved matrix. A review-driven new creative choice returns to Vineet; a reviewer cannot silently replace approved direction. Fix confirmed non-creative alignment/formatting errors within scope.
7. Show the resulting exact prompt and configured input/settings set for final approval. His creative matrix approval does not replace input-consistency confirmation or final prompt/request/cost approval. Use applicable free --print/--dry-run; never generate, answer spending prompts or select a take from this skill. Actual footage goes to `$generated-video-review` after a separately approved generation.

Handoff: approved matrix/weights and scope, source coverage, actual input roles, aligned prompt fields/full copy, settings/timing, reviewer findings and remaining approval states. Do not call a partial source check or an unapproved matrix a ready generation request.
