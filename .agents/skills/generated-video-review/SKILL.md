---
name: generated-video-review
description: Review an actual generated Physics video take for cinematic performance, cinematography, story/timing fit, physical continuity and AI artefacts before selection or a retry. Prompt-only checks belong to pre-video-review.
---

# Generated video review

Use when Vineet shares a generated take or asks to review existing footage. Judge whether cinematic conversion succeeds, not merely whether the video is attractive or artefact-free. For a prompt that has not been generated, use `$pre-video-review` without asking for a video.

Read [Cinematic conversion and source coverage](../pre-video-review/references/cinematic-review.md) and the current Playbook's Clip review and repair section. Reuse the pre-video brief only where identified sources and approved intent are unchanged. Missing preflight notes are not permission to invent a new performance or treat a draft as the actual generation request.

## Identify footage, baseline and coverage

- Locate the exact candidate supplied by Vineet, or current relevant Notion media. A Downloads file can be reviewed without already being attached to Generated clip. Do not assume the newest filename is this shot or an old take is the newly reported result. If the target is absent/ambiguous, ask for the file/path while making any independent source checks possible.
- Record shot/take if known, file/path or attachment identity and hash where useful, dimensions/frame rate/duration, actual request/settings/cost if provided, usable in-point/out-point/handles and corresponding scene times. Mark unknown metadata as unknown; current Notion settings do not prove what generated a take.
- Read current Notion sources through the project SDK first (`lib/notion.js`) and use MCP for text updates. Identify screenplay moment, approved identity/set assets, relevant full character context, World Bible rules, scene arc/exposure, storyboard, approved radio/cues, rendered animatic and adjacent shots using the shared coverage ledger. Do not keep local copies of scene text/prompts.
- State the cinematic job and the intended performance/cinematography before judging the take. Separate essential meaning and visible performance from flexible choices. Do not fail an otherwise usable take for an exact hand pose/grip Vineet has said is unimportant; still flag material contact, scale, story or edit-continuity failures. A still need not become motion unless its essential job requires it.
- If an approved `$video-prompt-creation` matrix exists, use Vineet's confirmed creative choices and weights to prioritise viewing findings. Report failure of a defining performance priority before minor polish. Weights are not quality/confidence scores or permission to ignore required story, timing or physical coherence. Do not infer approval for pending rows, retrofit the matrix to excuse the output, or rewrite his priorities during review. Lack of a matrix for an older take is not by itself a footage defect.

## Inspect actual temporal evidence

Watch the entire usable interval at normal speed with its approved scene audio when supported, then inspect suspect moments more closely. Review adjoining boundaries and required handles. The take's generated audio is not the film's sound: discard it in the edit and assess visual timing against the scene radio/mix with the proper offset.

Use available ffprobe/ffmpeg or equivalent tools for stream/decoding information, time-labelled frame extraction and suspicious transitions. Preserve originals; analysis frames/crops are not replacement production media. Use accurate frame/clip timestamps. Contact sheets and samples orient the review; inspect important regions at original detail and increase temporal sampling around suspected morphs/cuts/contacts. Do not claim normal-speed playback, smoothness, auditory quality or full lip-sync verification from sparse stills. A dense timestamped sequence can substantiate a particular deformation without establishing the entire viewing experience.

If actual playback/listening is unavailable, say which modalities and intervals were inspected and mark the remaining checks Partial/Uncertain. Launching a player, emitting a widget, extracting a waveform, transcription or successful decoding does not establish that the assistant watched/heard it. Vineet may provide a viewing/listening judgement; attribute it to him rather than presenting it as independent observation. Do not use paid analysis services without authorization.

## Compare result with its cinematic job

| Area | What to assess in the usable interval |
| --- | --- |
| Story and performance first | Does the video realise the animatic's intended moment with convincing acting? Intent/awareness, emotion, intensity, composure and their development must match approved source context. Read face/body/gaze/tempo/breathing where visible; do not confuse a slow camera with a leisurely actor, or a composed face with lack of urgency. A character must not react to information only the audience knows. A beautiful shot that performs the wrong emotion is a substantive failure. |
| Cinematography | Does framing and camera height/path/speed/stabilisation support the performance and reveal? Check perspective, parallax, focus/depth of field and visibility of essential background events. Does lighting/exposure remain motivated while the camera/actor enters another space or a screen is lifted? Separate observed execution from a desired lens/preset name. Avoid default demands for handheld shake, bokeh, grain or slow motion. |
| Physical continuity and slop | Door leaf/frame/hinge/latch/knob/panels retain coherent construction through rotation and camera passage. Props keep physical size while resting, lifting and being held; support/contact/occlusion and body weight make sense. Check melting/morphing, sliding feet, floating objects, merged hands, duplication/disappearance, face/costume/set drift, unstable textures/light/shadows and wrong story-critical text. Account for viewpoint, perspective, reverse faces and intentional supernatural events before declaring errors. |
| Timing and information | Compare gestures, reactions, reveals, pauses and visible speaking/listening states with the approved exposure and audio cues. Measure actual event times, including breathing room and overlaps. Keep clip time distinct from scene time. If the take finds better pacing, propose timing changes using the procedure below. |
| Edit and neighbouring shots | Can the selected interval join the previous/next shot with correct geography, light, awareness, performance and prop/call state? Inspect actual cut states. A defect wholly outside the usable interval need not fail the take, but a trim cannot quietly remove required action or change approved timing. |
| Image/export integrity | Unwanted cuts, black/flash frames, damaged crop/stretch, watermark/accidental layouts, framing/resolution and usable handles. Judge defects at intended viewing size as well as close inspection; do not demand invisible identity detail or treat optional polish as essential. |

Locate each claim at a timestamp/range and cite its source requirement or physical reasoning. Distinguish observed defect, plausible inference, user report and uncertainty. Endpoint images alone cannot prove an intermediate phone/door state; one attractive frame cannot certify the take. Do not invent confidence percentages or slop scores.

## Verdict, repair and records

Keep current findings on the shot page: exact inputs/take, source coverage, actual watch/listen/frame coverage, cinematic job, and **clip time / scene time | check | Pass / Needs correction / Uncertain / N/A | evidence | smallest useful action**. Show relevant sequence evidence to Vineet, not an unlabelled isolated frame.

Recommend **Keep / Keep with a named edit repair / Needs correction / Insufficient evidence**. Give the performance/story reason before minor cosmetics. Record Vineet's actual decision separately: Pending / Accepted for this exact take / Corrections requested. Only his viewing decision selects production media; assistant review or upload does not mean Clip approved.

For a problem, identify whether its cause is observed or inferred and where to intervene: source/reference, performance direction, camera/light decision, timing, generation execution or edit. Propose the smallest repair that preserves essential action/performance/information and the approved audio. A cosmetic prompt change cannot be assumed to fix contradictory geometry. Do not claim a crop, cut, local repair or regeneration will work without evidence; a free reversible preview can demonstrate a proposed edit when authorized, with originals preserved.

### When the take finds better timing

When picture timing differs from the exposure sheet or radio cut, consider whether the take improves the performance or whether the picture itself needs correction. A natural breath, reaction or pause can justify more scene time. Report the current and proposed times in both clip and scene time, with the actual evidence and the new voice-file lengths where relevant. Identify which exposure beats, radio cues and overlaps would move, the resulting shot and scene duration, and the effect on adjoining shots and the animatic. Preserve story order, required actions and deliberate overlaps.

Offer a continuous-picture preview with the proposed radio cues when feasible. Use generated sound only to locate cues and use scene audio in the preview. If changing cue placement alone leaves visible speech out of sync, flag it separately. After Vineet approves the timing, update the exposure sheet and radio cut plan together, rebuild and review the radio cut with `$radio-cut-review`, then update dependent shot boundaries and the animatic from the measured audio and review them. Keep the existing production timings until the proposed revision is approved.

Every generated take is a trial: find/reuse its existing trial record or log the actual request/take/cost and outcome under the scene's Trials log task, at most one subtask level. Mark unknown cost/settings explicitly. Working pages hold current results; reasons/history go to the trial or Decisions log. Do not overwrite/delete takes, replace approved assets or set approval status automatically.

A retry needs Vineet's approval of the exact revised request and cost and a fresh affected `$pre-video-review`. Preserve the project's one-retry/stop safeguards; do not autonomously rerun or switch to a paid fallback. If a proposed fix changes story, performance intent, radio timing or protected configuration, obtain the relevant approval first. New production-rule proposals require review before saving them in the Playbook.
