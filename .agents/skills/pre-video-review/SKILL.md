---
name: pre-video-review
description: Review a Physics video-generation prompt, actual references and settings before approval or a changed retry. Check source coverage, the animatic-to-cinema gap, acting, cinematography, continuity and prompt clarity; no generated video is required.
---

# Pre-video review

Use on a proposed request before calling its prompt ready. A generated video is **not** required; requests to review existing footage belong to `$generated-video-review`. Review the complete request and its intended cinematic contribution, not just wording or visible input defects. Read [Cinematic conversion and source coverage](references/cinematic-review.md) before the checklist below.

## Establish the shot's cinematic job

Read the current Notion shot/scene and relevant Playbook sections. Use the project SDK first (`lib/notion.js`) for reads/files and MCP for text updates. Identify exact references/attachments, their assigned roles, actual model/platform/mode and picker bindings, full prompt including appended instructions, scene interval, generated duration/handles/in-point, output count/settings and available quote. Do not substitute saved Notion drafts for the request actually configured in a manual UI. Never save scene/shot text or prompts to local working files.

Complete the source-coverage ledger and a short conversion brief from the shared reference. Reuse verified observations only for identified, unchanged sources; state that reuse. Do not silently omit World Bible, character context, storyboard, radio or animatic from the ledger. Missing access is Unavailable, not N/A or Checked. An approved cue list may establish timing without another listening pass; it cannot establish audible delivery. A plan alone cannot prove what a rendered animatic shows.

The brief must answer:

- **Inherited:** which existing images/assets, tested staging and measured sound already settle identity, place, appearance, composition and timing?
- **Video contribution:** what necessary acting, emotional development, bodily expression, interaction or continuous physical/camera experience remains to be performed? A list of events alone is insufficient.
- **Performance:** intent/awareness → emotion and composure → visible face/body/gaze/voice cues → change or sustained state through this interval. Use cues readable at the shot scale. A state need not change just to fill an arc.
- **Cinematography:** which camera, focus, lighting and temporal decisions are inherited, deliberately flexible or still unresolved? Use the shared decision table; numerical settings and camera brands are not mandatory.
- **Essential / flexible:** distinguish story-critical information and performance from incidental production choices such as a precise grip or finishing pose. Respect Vineet's stated priorities. If a still with existing audio/editorial treatment fulfils the whole job, identify that option without unilaterally changing the shot type or breakdown.

When a matrix from `$video-prompt-creation` exists, verify its exact approved creative choices, user-set weights and scope against the request. Pending creative rows prevent final prompt readiness. Weights indicate importance, not model settings or a quality score; they cannot waive source requirements or physical/story continuity. Do not quietly substitute a reviewer's creative preference for Vineet's confirmed direction. Return material creative corrections for his check, while retaining unaffected approvals. For a legacy request without a matrix, identify the existing explicit creative approvals and unresolved choices; do not invent an approved matrix or reject it solely for lacking this document format.

The approved screenplay and approved assets remain creative authority. Storyboard is strong suggestive staging evidence. Bibles, scene arc, plans, radio and animatic supply their defined context/execution evidence; reconcile material conflicts with the approved source and Vineet. An attached candidate, a prompt or an attractive render does not become canon automatically. Read the full relevant Character Bible entry, story/setup and screenplay before proposing new performance. Do not change story or timing to make a request easier.

## Inspect the request

| Check | Review |
| --- | --- |
| Actual visual inputs | Inspect current images together at useful resolution and important regions closely. Verify identity/state, anatomy/contact, scale/count, architecture, geography, motivated light and image artefacts as in `$cinematic-image-review`. Confirm each image is actually assigned to this request. Optional absent end frames are N/A; do not create another image merely for a checklist. |
| Inherited information and conflicts | Bind each input once to a clear role. Compare actual pixels with the saved image prompts to distinguish intended information from achieved information. Do not ask the video to redesign supplied appearance. A text priority instruction cannot be counted as proof that contradictory images are resolved. Distinguish a reverse face/perspective change from incompatible construction. |
| Cinematic performance | Does the prompt direct the character's source-supported intent, emotion, intensity, composure, expression channel and development? Can the audience perceive it at this framing? A composed character can hurry; a slow camera does not imply a slow actor. Do not invent fear from audience knowledge, add decorative mannerisms or demand facial micro-expressions from a distant/rear view. |
| Camera and optics | Check subject-relative position, height/angle, shot scale/perspective, path, independent camera speed/easing, ending region, stabilisation, focus/depth of field and required background visibility. Inherit suitable choices from frames/boards. Distinguish dolly from zoom, and a 2D animatic push from a demonstrated physical path. Avoid imposing a new lens look on an established image without a reason. |
| Lighting through time | Identify practical sources, direction, character readability, intended contrast/color and spatial or temporal changes. Check night conversion and hall-to-room exposure when applicable, and phone light only where physically plausible. Inherit existing look rather than repeatedly describing it. Do not add flicker, dust, flare or handheld shake as generic cinematic decoration. |
| Motion and intermediate states | Trace camera, character, props and significant occlusions through the interval: reach, weight, support/contact, clearance, action order and feasible time. Inspect doors as whole leaf/frame/panel/hinge/knob/latch relationships. An object's physical size stays constant during rest/lift/hold even as its pixel size changes. Identify essential newly revealed states that inputs do not establish; propose the smallest useful direction/reference rather than an extra frame for every action. Scripted supernatural action is not an ordinary-physics defect. |
| Timing and handoff | Match visible actions, reactions, dialogue/mouth cues and overlaps to approved radio/cue timing and the adjoining shots. Check generated-clip versus scene-time offsets. Separate actor pace from camera pace explicitly. Keep edit-process explanations in settings when they add no model-facing direction; preserve the labelled model-facing time basis. A static reference cannot prove temporal sync. |
| Prompt clarity and redundancy | Inspect the exact text Vineet will paste, not only surrounding notes. Essential input roles, performance and camera decisions must be inside that text or genuinely configured controls. Remove redundant appearance/static setting, duplicated sequences and unnecessary finishing-pose/grip requirements. Do not impose a word limit or remove useful physical constraints merely to shorten it. Keep the eight fields and full copy aligned. |
| Whole-prompt / workflow conflicts | Check appended standard/negative instructions, reference roles and real route capabilities, including off-frame entrants and frame/reference mode differences. Verify provider capabilities from official docs or actual UI. Do not import Cinema Studio controls or Midjourney flags into a Kling route by analogy. Flag protected-block conflicts and present a precise proposed exception for approval; never silently change protected configuration. |

Do not turn a list of potential model failures into invented defects. For each finding distinguish observed conflict, missing decision, reasonable flexibility and residual generation risk. Essential unresolved evidence/decisions prevent calling the request ready; optional polish does not. A structural dry run checks technical validity, not cinematic performance or image consistency.

## Report and gates

Keep the review on the existing shot page and in chat. Include the source ledger, brief cinematic job/performance/cinematography decisions, and **check | Pass / Needs correction / Uncertain / N/A | evidence/source | smallest useful action**. Lead with whether the proposed video performs its intended cinematic job; wordsmithing is secondary. No slop percentage or guarantee of a clean generation.

Record separately:

- **AI review:** Ready for Vineet's input check / Needs correction / Insufficient evidence. State scope and any unverified modality; do not call a partial wording pass a complete cross-source review.
- **Vineet's input consistency check:** Pending / Confirmed for these exact inputs / Corrections requested. Show the actual current images together, name the findings and explicitly ask him to check them. Prompt approval or a filled media field does not supply this confirmation.
- **Exact prompt/settings/cost approval:** Pending or the explicit approval given for this request. Final prompt readiness needs the applicable checks and his input confirmation. Generation additionally needs exact paid-request approval.

After relevant input/direction changes, repeat affected checks and his check of changed images. Preserve all takes. Run free --print/--dry-run where applicable to the actual route; do not force a manual References workflow through an incompatible fal validator. Do not generate, answer spending/listening prompts, replace assets or advance Status automatically. New production-rule proposals require Vineet's review before being saved in the Playbook. Hand the brief, identified inputs and specific risks to `$generated-video-review` when footage exists.
