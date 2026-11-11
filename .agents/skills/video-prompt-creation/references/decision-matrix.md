# Matrix format and weight semantics

Use when presenting a shot's creative direction before writing its video prompt. Keep the real matrix on the shot's existing Notion page and show it in chat. This is a decision aid, not a scoring system or another production database.

Start with:

- **Cinematic job:** what this moving shot must contribute beyond the existing animatic/stills.
- **Inputs and inherited decisions:** exact references and their information roles, source-covered timing/staging, existing creative approvals.
- **Hard requirements / open evidence:** source-required action/information, approved timing and continuity, technical feasibility and unresolved conflicts. Give source links; don't make every assistant preference a hard requirement.
- **Creative direction:** the following matrix.

| ID | Aspect | Already supplied / source | My recommendation for the gap, and why | Proposed weight | Vineet's choice / weight | State |
| --- | --- | --- | --- | --- | --- | --- |
| D1 | Meaningful decision for this shot | Actual evidence or identified inherited approval | Concrete proposed visual/performance choice plus short rationale | 1–5, with reason | Pending | Proposed / Pending |

Use the column names flexibly for readable presentation, retaining all information. Combine the reason with the recommendation or a short note, rather than making an excessively wide table. Keep stable row IDs after reordering. Existing source-defined constraints and technical facts can sit in the brief rather than receiving meaningless creative weights. For a truly inherited row, label its existing confirmation; do not present it as newly approved.

## Default importance scale

| Weight | Intended meaning |
| --- | --- |
| 5 | Defining creative priority: this shot's effect depends on it |
| 4 | Strongly supports the intended performance or visual reading |
| 3 | Meaningful preference, with room for variation |
| 2 | Minor preference |
| 1 | Incidental creative detail; keep execution flexible |
| N/A | Aspect does not apply; state why rather than inventing a priority |

The scale is a default, not a fixed project rule. All assistant weights are proposals; Vineet may change values/scale, priorities and choices. A lower weight on an exact grip does not lower the need for believable support/contact; these are different requirements. A weight of 5 is not permission to add motion, fear, a cut, a new light or extra prompt repetitions. The number describes importance to Vineet, not how confident the assistant is that generation will work.

If he asks for percentages instead, use that representation and explain any requested total; do not silently rescale his values. Mark an unresolved source/technical conflict separately rather than numerically averaging it away. No combined quality/slop score, threshold for automatic approval or mapping to model reference strength.

## Review loop

After showing the matrix, a useful single question is: **“What would you change in these choices or weights? You can refer to the row IDs.”** For an unresolved high-impact decision, ask about that choice first and continue source/technical work independent of his answer. Do not ask him to recreate known source information.

He can say “D3: use a steadier camera, weight 4; D5: leave the exact grip flexible, weight 1,” or approve the whole matrix as shown. Those examples describe the reply format; they are not default choices for any actual shot. Reflect his wording accurately. Record each affected row as Pending, Confirmed unchanged, Confirmed by Vineet, or Corrections requested, with approval scope clear. His response to one choice does not approve the rest.

After creative confirmation, write the prompt from approved decisions and direct only the missing change. Matrix numbers, reasoning and review instructions stay outside model-facing text. The exact full prompt still goes through `$pre-video-review` and Vineet's final request approval. If review introduces a material creative change, revise the relevant row and ask him to verify it before calling the prompt ready.
