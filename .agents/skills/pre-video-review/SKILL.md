---
name: pre-video-review
description: Review the exact images, references, motion prompt and settings for a Physics shot before final prompt approval or a paid video retry, checking consistency, plausible transitions and missing visual evidence.
---

# Pre-video review

Use before presenting a video prompt as ready and before an approved retry whose inputs or instructions changed. Review the complete intended request, not the prose alone. The output is a short list of concrete corrections and a readiness state; it never authorizes generation or spending.

## Authority and request

- The approved **Screenplay and approved assets** are the only creative sources of truth for this review. Use locked identity/state assets and explicitly accepted cinematic references for their assigned roles; unaccepted candidate frames do not define canon.
- Treat the **storyboard as strong suggestive evidence** for staging, framing and visible relationships. It cannot add furniture, alter a character or override an approved source by accident.
- Radio/cue times, shot timing, exposure sheets, animatic, image prompts and performance notes are execution evidence or intent. Check the request against them where useful, without treating them as independent creative authorities. A material conflict returns to the screenplay/assets and Vineet; do not silently rewrite story, audio or an approved source.
- Read the current Playbook for the approval procedure. Verify current platform/mode capabilities from official documentation or the actual interface before relying on them. Different routes may accept different inputs.

Read the current Notion shot and relevant source moment. Identify the exact model/platform/mode, actual attachments and token bindings, image roles, full prompt including appended instructions, generated duration/handles, scene interval/in-point, output settings/count and available quote. Do not fabricate a missing attachment, UI control, price or approval. Use existing SDK reads/downloads first and MCP for text updates. Never copy a shot or its prompt into a local working file.

## Inspect the complete request

1. **Visual inputs:** inspect actual current frames/references together. Check identity, anatomy, grip, object scale/count, architecture and hardware, geography, light and reference artefacts as in `$cinematic-image-review`. Reuse its observations only when the exact inputs and relevant requirements are unchanged; compare the full current set again for this transition. A file attached in Notion must also be assigned to the actual intended request.
2. **Image-to-image continuity:** identify shared objects across views. Check construction and proportions, including doors' panels, hinges, latch/knob and leaf/frame relationships. Distinguish a reverse face or another door from a contradictory design. A single-detail match does not establish whole-object consistency. Optional absent keyframes are N/A, not new generation tasks.
3. **Intermediate states:** mentally trace the camera, each body/hand and each significant object between supplied states. Check reach, support, contact, clearance, grip transfer, action order and practical time. Identify newly revealed areas or prop states the images do not establish. Missing essential evidence is Uncertain; propose the smallest useful addition needed, such as one physical constraint or a suitable reference. Do not demand an extra frame for every action.
4. **Scale through motion:** an object's physical dimensions stay stable while resting, approaching the camera, being lifted and held; its apparent pixel size can change with perspective. Look for an unconstrained resting state or impossible handoff even when the final held state looks plausible.
5. **Performance:** the directed emotion, composure, visible expression, tempo and awareness must follow the screenplay. Check that the framing makes the required action readable. Do not infer character fear from audience knowledge, add mannerisms to fill a code, or reject deliberately supernatural action as an ordinary-physics failure.
6. **Prompt and timing:** write only directions missing from the supplied visuals: motion, acting, interactions, changing state/light and timing. Keep essential physical constraints where they solve a named gap. Resolve simultaneous incompatible use of one hand, contradictory destination states, unintended cuts, overlap/pauses and scene/clip-time offsets. Reference images are not guaranteed keyframes unless the mode binds them as such.
7. **Whole-prompt conflicts:** inspect appended standard/negative instructions as well as the eight fields. Flag conflicts with required text, lighting or performance. Never edit protected blocks, model configuration or field names as a silent fix; show a proposed exception for Vineet's approval. Do not claim a text instruction can cancel a contradictory input image reliably.

## Findings and approval gates

Keep the review on the existing shot page and in chat; retain all takes and current source files.

Report the exact reviewed inputs, then a compact table: **check | Pass / Needs correction / Uncertain / N/A | observed evidence and source | smallest corrective action**. Distinguish verified observations from inference, a user's video report from footage actually inspected, and essential problems from optional polish. Do not produce a percentage or slop score.

Record gates separately:

- **AI review:** Ready for Vineet's image check / Needs correction / Insufficient evidence. An essential unresolved conflict or missing required evidence prevents readiness.
- **Vineet's image consistency check:** show the same actual current images together, explain findings, then explicitly ask him to check them. Record Pending / Confirmed for these inputs / Corrections requested. Do not infer confirmation from prompt approval or a filled media field.
- **Exact prompt/settings/paid request approval:** Pending or the explicit approval actually given. Image confirmation alone does not approve a paid run. A successful structural dry run does not prove visual quality.

After a material change, repeat affected checks and ask Vineet to check changed images again. Final prompt readiness needs the visual gate; generation additionally needs approval of that exact request and cost. Run the project's free --print/--dry-run where applicable; do not generate, answer spending/listening questions, replace assets or advance approvals automatically. When unsure, state the precise missing evidence and one next action.
