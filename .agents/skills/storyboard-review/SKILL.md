---
name: storyboard-review
description: Review Physics storyboard panels for story coverage, staging, continuity and visible AI defects before animatic work, or after panels change. Judge rough drawings as staging evidence rather than finished cinematic images.
---

# Storyboard review

Use to decide whether the actual panels communicate the scene well enough to test in time. Find missing or misleading visual information before it propagates into the animatic and cinematic references. This is assistant inspection, not an automated classifier or a guarantee that every defect is detected.

## Sources and exact inputs

Read the current [Shot Production Playbook](https://app.notion.com/p/400252f6b4ff81c0be66c3c487b394e6), especially stages 2–5 and change handling. Start on the current scene row in Notion; read its review notes, Storyboard prompts, exposure sheet, performance arc, plans and attachments. Use the project Notion SDK first (`lib/notion.js`); use MCP for text updates. Resolve a local/Notion mismatch before using a local candidate as the approved panel. Do not copy scene text or prompts into local working files.

- The approved **Screenplay and approved assets** are creative authority. Read the relevant scene and adjoining moment; inspect actual locked identity/state images and accepted set references for their assigned roles. A candidate or saved prompt does not establish canon merely by being present.
- The exposure sheet, measured approved radio cut/cue times and arc explain coordination and intended performance. Check them against the screenplay rather than allowing a derived mistake to override it. Read the full Character Bible entry and story/setup before proposing new performance or delivery.
- The storyboard is **strong suggestive staging evidence** for later cinematic work. Rough faces, furniture, clothes and grayscale texture are not independent cinematic design decisions. Essential geography, distinctive story props and readable character/action relationships still matter in a sketch.

Identify exact panel filenames/attachments, their approved/candidate state, beat/view mapping and relevant source references. Use hashes when names are reused or local/attached identity is ambiguous. Do not assume numeric filenames alone establish order: lettered views and reused panels are supported. Inspect every panel in scope at readable size, then important regions and adjoining views more closely. A contact sheet is useful for orientation but does not replace inspecting small essential details.

## Inspect staging and defects

| Check | What to establish |
| --- | --- |
| Coverage | Map each required visible action, reaction, reveal and information beat to a panel or an explicitly reused view. Off-screen dialogue or sound need not get a new image. Identify missing essential states, not a requirement for one panel per beat or speaking turn. |
| Frozen moment | Each panel depicts an understandable instant: pose, gaze, hand/prop state and camera position. Distinguish deliberate motion lines from an accidental multiple-state body. A panel can suggest motion without proving the whole action. |
| Geography and mechanics | Trace entrances, bed/desk, balcony/exit, eyelines, screen direction, object support and reach across views. Compare shared door panels/hardware, free edge/hinge side and clearances when visible. A reverse view or purposeful axis change is not automatically an error; flag confusing unmotivated jumps. |
| Audience information | Is the story-critical figure, gesture, phone/call state or event actually visible at the intended framing? Do not reveal a surprise early or hide a required action. Distinguish what the audience sees from what the character notices. |
| Performance | Does pose/expression/composure fit the source moment and its change through the scene? Listening can span another speaker's line, including overlap. Do not make an unaware character afraid of a danger only the audience sees. |
| Meaningful AI defects | Duplicated people/props, contradictory limb/hand ownership, fused contacts, impossible scale, floating objects or malformed architecture that changes staging. Hidden fingers, loose pencil lines and imprecise facial detail are not production defects by themselves. |
| Reuse and boundaries | Is the same setup truly retained when a panel is reused? Are distinct states/views supplied where necessary? A storyboard panel is not automatically a production shot or separately generated clip; suggest the fewest views that communicate the scene. |
| Reference integrity | Did the drawing preserve the intended set relationship rather than introduce incidental new furniture? Compare its prompt's reference roles with actual pixels; report discrepancies without promoting sketch additions to canon. |

An approved supernatural event is not slop merely because ordinary physics would forbid it. A static panel cannot certify temporal pacing, a full door swing, or every intermediate state. Mark those as requiring animatic/video evidence rather than adding unnecessary panels. Do not demand photorealism, frame-perfect identity or lip sync from rough sketches. Review labels outside the picture are not accidental story text.

## Report, correct and hand off

Record a short **Storyboard review** on the existing scene page, using current findings only. Keep experiment history in its log. Include:

- Exact reviewed panels, source moments/references, coverage and any unreadable/missing inputs.
- Findings: **panel / beat | check | Pass / Needs correction / Uncertain / N/A | visible evidence and source | smallest useful correction**. Separate essential issues from optional polish; no percentage or slop score.
- **AI result:** Ready for Vineet's storyboard check / Needs correction / Insufficient evidence. Missing essential visual evidence prevents readiness; unavailable timing evaluation is identified as the next stage's job.
- **Human result:** Pending / Confirmed for these inputs / Corrections requested. Show/link the same actual panels and relevant references, then explicitly ask Vineet to check the named staging/continuity risks. A filled Storyboard field or prompt approval is not panel approval.

Propose targeted corrections to the affected pose/view/prompt. Preserve usable panels and existing takes. Keep exposure beat IDs and approved radio timing stable when the change is only visual; show any genuinely necessary retiming proposal for approval. Do not edit the story, regenerate, replace attachments, advance Stage/Status or authorize spending from a review verdict.

After a panel changes, recheck it and its adjacent/reused views; list the Animatic plan/output and cinematic references that may be stale. Confirm which exact files Vineet accepts before treating them as the next stage's inputs. Hand approved panels and measured timing to `$animatic-review` once an animatic exists. Any proposed new production rule goes to Vineet for review before it is saved in the Playbook; this skill does not authorize a rule change.
