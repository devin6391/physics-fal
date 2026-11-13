---
name: radio-cut-review
description: Review a Physics scene's rendered radio cut for screenplay fidelity, voice and sound artefacts, overlaps, pacing and cue timing before picture timing is locked or after audio changes. Separate technical analysis from actual listening.
---

# Radio cut review

Use to test what the scene actually sounds like and whether its rendered cue times can safely drive the exposure sheet, storyboard and animatic. Detect audible generation/editing defects and content inconsistencies; do not equate a successful build or clean waveform with a good performance. Vineet makes the final listening decision.

## Sources and input identity

Read the current [Shot Production Playbook](https://app.notion.com/p/400252f6b4ff81c0be66c3c487b394e6), especially stages 2–3, voice/sound settings and change handling. Fetch the scene's current row, Sound script, Radio cut plan, exposure sheet, performance arc, Voice files, Scene SFX audio and Scene radio cut. Use the SDK first (`lib/notion.js`), with MCP for text/plan edits. Relevant source lines are in the approved [Screenplay](https://app.notion.com/p/411252f6b4ff814ca042edabbb24cc14).

- The approved **Screenplay and approved assets** are creative authority: exact words, speakers, interruptions/overlap, pauses, event order, bed, silence and locked voice/motif identity. The Sound script, arc and plan implement that intent; they cannot override it silently. Read story/setup and full Character Bible entries before proposing new delivery or tags.
- Approved audio is execution evidence for measured duration, word timing and sound. Storyboard/animatic are strong visual suggestions, not authority to cut a line, add a sound or retime approved conversation.
- Identify which sounds are required now versus marked for later placement in the same radio cut once the picture establishes their timing. A plan's silent `mark` is not an audible cue. Do not fail an intentionally deferred motif or movement sound as missing, and do not excuse a missing required timing sound as deferred.

Record the exact audio attachment/path, duration, candidate/approved state and source cue-list identity. Hash files when needed to distinguish reused names. Current local media in `out/radio/scene-NN/` can save downloads, but must match the intended Notion input or be labelled an unuploaded candidate. Never persist a local working copy of scene text or plans.

The cue JSON describes a particular render; a fresh plan does not prove that the existing audio was rebuilt. Check relevant source file/trim/filter identities and whether cues run beyond the scene end. If provenance is missing, state uncertainty rather than declaring the file current. `node scripts/radio.js --scene N --print` reads the current plan and resolves cues without rendering the final output; it may download/process source audio. It does not verify the existing radio cut by listening. Read README for the exact format; do not run the build just to inspect an existing cut, since it writes a fixed output filename.

## Inspect technical evidence and listen

Establish the environment's actual audio inspection capability. Listen to the entire cut at normal speed when supported, then replay suspicious intervals with context and isolate relevant source lines/sounds when useful. Report coverage and the listening method. If actual audio cannot be heard here, complete available source/cue/signal checks and mark auditory judgements **Uncertain**. Provide Vineet the exact file and timestamped listening tasks. Launching a local player, emitting an audio widget, reading a transcript or running ASR is not proof that the assistant heard it. Do not use an unapproved paid transcription/analysis service.

Use ffprobe for stream/duration/decode information and ffmpeg analysis where available for peaks, loudness, silence, channel anomalies or edit discontinuities. Record measured values and window/threshold when used; near-zero samples are not automatically a defect, and peaks alone do not establish audible distortion. No invented universal loudness or silence threshold: compare the current Playbook/plan and intended moment. ASR is supporting evidence only, especially for Hindi/Hinglish, names, overlap and non-speech; verify alleged word errors by listening before treating them as facts.

| Check | What to hear or reconcile |
| --- | --- |
| Words and speakers | Every required line occurs once in the right order and voice, with correct Hindi/Hinglish pronunciation and names; no skipped/repeated syllables, invented words, spoken tags, stray narration or source pause markers left as unwanted gaps. Compare source and rendered line if an edit seems to cut it. |
| Overlap and interruption | Preserve the outgoing speaker's full sentence beneath the next voice unless the screenplay explicitly truncates it. Distinguish intended competition from accidental masking. Do not serialize voices, trim tails or add a shot per speaking turn to make review simpler. |
| Performance and arc | Voice identity, youthful/character fit, shared conversational energy, emotion, intensity, composure and transitions fit the source. Flag robotic cadence, unjustified whispering, unstable timbre, unnatural breaths, pitch warbles or synthetic garbling with timestamps. Proposed delivery changes need source support. |
| Timing and causality | Pauses, holds, ringtone stop/answer, impacts/reactions and timing sounds land on the intended words/events. Compare actual audible onsets with cue placements; cue start may include leading source silence. Keep scene time separate from a future clip's handles. |
| Sound perspective and priority | Phone/distance filtering is applied appropriately and not doubled; sources sit in the intended space. Dialogue is intelligible except where commotion/silence deliberately takes over. Beds, motif identity/treatment and transitions follow the screenplay. |
| Audible artefacts | Clicks, abrupt cut breaths/tails, pumping, clipping/distortion, loop seams, repeated/duplicate cues, comb/phase cancellation or unexplained channel changes. Inspect source versus rendered treatment before proposing regeneration. A loop's repeated waveform alone does not prove an audible seam. |
| Silence and deferred work | Required all-lane silence drops are intact; ordinary beds do not vanish unintentionally. Intentional silence, controlled overwhelm and specifically deferred cue placement are not slop. |
| Duration and handoff | Required tails and ending bridge survive; plan, render and cue list agree sufficiently for measured exposure times. Small codec padding is not automatically retiming; assess its effect on actual events. Check licensing/source evidence for used sounds without asserting a licence that was not verified. |

## Findings and approval

Save **Radio cut review** on the existing scene page: exact inputs/sources, actual listening coverage versus technical-only checks, and **scene time / cue | Pass / Needs correction / Uncertain / N/A | observation and source | smallest correction**. Separate heard defects, measured anomalies and suspicions. No numerical slop score.

- **AI result:** Ready for Vineet's listening check / Needs correction / Insufficient evidence. Required unheard/unverified content cannot be passed from metadata.
- **Human result:** Pending / Confirmed for this cut / Corrections requested. Give the exact full cut for his listening and the named risks; never answer a listening/approval prompt on his behalf. His reported decision can be recorded as his decision, without claiming the assistant listened.

Prefer a targeted trim/filter/placement/level repair using approved source audio where it preserves meaning. If a source take needs replacement, explain the issue and exact request affected; do not regenerate or change voice/tags/settings without approval. Any story/timing change needs Vineet's confirmation before upstream edits. Review the rebuilt file, not merely the corrected plan. Preserve existing outputs before an authorized build that would overwrite their fixed names; never delete/overwrite a take or upload/select a candidate automatically.

After acceptance, measured times feed the exposure sheet and picture plans. For a changed cut, list affected cue times, sheet cells, animatic, shot timing, Edit plan and assembly; do not renumber beats or silently retime pictures. Assemble with the approved current radio cut. Existing unaffected approvals remain valid. New production-rule proposals require Vineet's review before saving them in the Playbook.
