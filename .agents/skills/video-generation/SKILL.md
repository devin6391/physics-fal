---
name: video-generation
description: Run an approved Physics video shot. Ask Vineet to choose manual Higgsfield or the Runway Dev API, show the exact request and wait for his live yes/no before submitting to Runway. Use video-prompt-creation when creative direction or the prompt still needs work.
---

# Generate a Physics video shot

1. For a request to generate a shot, first ask Vineet to choose **Manual in Higgsfield** or **Runway Dev API**. Use an explicit route choice he already gave for this shot. The script's default route does not choose for him.
2. Follow the Shot Production Playbook and the project's pre-video review for the chosen route. Reuse approval for unchanged creative choices and inputs. Route selection, a confirmed matrix and a prompt draft each precede the decision to spend.
3. For **Higgsfield**, give Vineet the exact prompt, attachments in order, model, mode, duration, resolution and output count. He checks the displayed price and generates in his app.
4. For **Runway**, use `npm run pull -- SHOT`. Run `npm run generate -- SHOT --provider runway --print` and repeat with `--dry-run`. When the shot is ready, start `npm run generate -- SHOT --provider runway` in an interactive terminal. The explicit provider keeps a different Notion model from routing the request to fal. In Codex, start it with a PTY and retain the session ID so you can respond to its prompt. The process shows the actual API contract, full prompt, image roles and cost before it pauses. Show Vineet the complete preview for that paused process, including the image identities and take count. Ask **Proceed with this Runway request?** and offer **Yes, submit** or **No, cancel**. After he answers, relay his choice as `y` or `n` to that same process. Leave the prompt pending while awaiting his decision. If the terminal closes or the request changes, show the new preview before taking a new decision.
5. If your shell cannot hold an interactive session, give Vineet the same command to run in his terminal so he can answer himself. Runway requires an interactive decision and rejects `--yes` and piped input. For a submitted request, capture the task ID and continue until the take has downloaded or Runway reports failure. Check the task before considering a retry. Review the result with [generated-video-review](../generated-video-review/SKILL.md).
