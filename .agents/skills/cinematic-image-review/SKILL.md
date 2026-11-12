---
name: cinematic-image-review
description: Review a newly created cinematic reference image, start frame, end frame or production still in Physics for visible AI artefacts, story fit and continuity before it is accepted or used in video generation.
---

# Cinematic image review

Use after creating or replacing a cinematic image. The result is an evidence-based correction list and a request for Vineet to check the same actual images. This is visual inspection by an assistant, not a numerical detector or a guarantee of a clean generation.

## Authority and inputs

- Read the relevant approved **Screenplay** moment and the approved **assets** needed for this image. These are the only creative sources of truth for this review. Assets include locked identity/state images and explicitly accepted cinematic references, each for its assigned role. A candidate image is not authoritative merely because it is attached in Notion.
- Use the **storyboard as strong suggestive evidence** for staging, framing and visible relationships. Its incidental furniture, faces and sketch style do not override the screenplay or approved assets.
- Shot fields, image-generation prompts, performance notes, radio cues and the animatic explain intent or execution context. They cannot independently introduce or overrule story/visual canon. Locate a claimed requirement in the screenplay or an approved asset; otherwise label it an assumption. Read the Playbook for procedure, not as extra creative canon.
- If approved sources conflict or the authoritative role is unclear, report the conflict and ask Vineet to choose. Do not silently promote a convenient image to canon or redesign a source.

Start with the current shot/scene in Notion. Use the project SDK/download commands first where possible, with MCP for text updates. Identify the target image, its exact attachment/file identity, its role and the relevant source images. Read saved image prompts for intended reference roles, then inspect the actual current pixels at a useful resolution. Inspect important details at a closer view when necessary. Missing or unreadable required visual evidence is **Uncertain**, not Pass; do not claim to have seen it.

## Inspect the image and its relationships

Apply the relevant checks; avoid demanding invisible details or optional frames.

| Area | Look for |
| --- | --- |
| Story moment | Correct action state, gaze, pose, expression/composure, awareness and prop state from the screenplay; a still depicts an instant rather than a sequence. |
| Identity | Match the appropriate approved face, body, wardrobe/state and distinctive accessories. A reference prompt describes intent; accepted asset pixels establish the actual look. |
| Anatomy and contact | Plausible visible hands/fingers, joints, grip, weight, occlusion and contact; limbs separate from props. Distinguish anatomical sides using viewpoint and reliable markers. Do not call a naturally hidden finger missing. |
| Prop scale and support | Object dimensions relative to a hand, body, mattress or furniture; stable construction, count and support; plausible screen/casing, reflections, shadow and local emitted light. |
| Architecture | Shared door/window/furniture identity, proportions, trim/panels, materials, hardware, hinge/latch and attachment points. Distinguish separate objects and reverse faces; foreshortening and a different view alone are not drift. |
| Continuity | Compare the candidate with the relevant paired frame, approved reference and adjacent shot: geography, object placement, hands/props, state and motivated lighting. Identify which changes are intentional. |
| Image integrity | Warped or fused forms, duplicate objects, melted texture, floating items, inconsistent reflections/perspective, illegible story-critical text, accidental labels/grids/watermark and unsuitable crop/detail. |

For a shared door, identify the leaf and which face the camera sees. Compare the latch edge at a close view against an approved frame that shows the hardware. Check the knob or handle, latch, hinge side and swing as parts of the same door. A visible pull handle does not establish that the expected knob is present. Record the hardware finding separately from whether the door belongs in frame. Apply this comparison even when the door appears unexpectedly at the edge of the image. If a relevant part is hidden or no approved reference shows the needed face, record what is unverified. For a correction or a new image that intentionally shows the hardware, use an approved reference that actually depicts it or preserve the intended crop if the shot calls for the door to stay outside frame.

Judge physical plausibility against the screenplay: a deliberately supernatural event is not an error merely because it violates ordinary physics. Distinguish a visible defect from a creative preference. Do not mark an image defective for harmless texture variation or an irrelevant occluded detail.

## Report and handoff

Record a short review on the existing shot/scene page; do not keep a local copy of its prompt or source text. Use:

- **Reviewed inputs:** exact current files/attachments and their roles; authoritative screenplay moment and approved assets; storyboard evidence where useful.
- **Findings:** check, Pass / Needs correction / Uncertain / N/A, concrete visible observation (image/region), source or physical reasoning, and smallest useful correction. Separate essential fixes from optional polish. Never invent a confidence percentage or an overall slop score.
- **AI result:** Ready for Vineet's image check / Needs correction / Insufficient evidence. Essential unresolved findings prevent readiness.
- **Human result:** Pending / Confirmed for these inputs / Corrections requested. Show the same actual images together and explicitly ask Vineet to check consistency and the named risks. An assistant's Pass or approval of wording does not supply his confirmation.

After an image changes, repeat affected checks and the human check. Do not approve an image, advance status, replace an asset or start a generation on the strength of this review. Propose a targeted correction; preserve the accepted parts and existing files. If approved images are to feed a video, hand the current inputs and findings to `$pre-video-review`.
