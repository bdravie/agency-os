---
name: llm-council
description: >
  Stop Claude from being a yes man. Runs any decision through five AI advisors
  who answer independently, peer-review each other anonymously, then get
  synthesised into one honest verdict by a chairman. Use whenever you face a
  real decision and want pressure rather than agreement. Triggers on "council
  this", "run the council on X", "pressure-test this", "stress-test this", or
  "war room this". Best for ambiguous, high-stakes calls (pricing, positioning,
  hiring, pivots, copy, resource allocation). Not for factual questions,
  creative drafting, or summarising.
---

# The LLM Council

A skill that stops your AI from agreeing with you.

Ask Claude "should I launch this?" and it finds five reasons you should. Ask "is this a bad idea?" and it finds five reasons it is. A Stanford study found AI assistants affirm your decisions about 49% more often than a human would. So most of the time you ask for advice, you get your own opinion handed back with confidence.

The council fixes that. It runs your decision through five advisors with genuinely different jobs, makes them grade each other's work without knowing whose work it is, and gives you one verdict you can actually trust. It will tell you things you don't want to hear. That is the point.

## When to use it

Good fits:
- Pricing and packaging ("$97 workshop or $497 course?")
- Positioning and messaging decisions
- Hiring, firing, partnership calls
- Business pivots and big bets
- Copy and offer feedback
- "Build vs buy" and resource allocation

Bad fits (don't waste the run):
- Factual questions (just answer them)
- Creative drafting (variance doesn't help)
- Summarising or formatting

## How it works

Three stages. Run them in order.

### Stage 1 — Five independent advisors

Spawn five subagents in parallel, one per role. Each gets the same decision and the same context, and answers on its own without seeing the others. Keep their voices distinct. Do not blend them into a balanced view.

1. **The Contrarian.** Argues against the decision with no balancing upside. Lists why it fails, the worst realistic outcome, and what the user is refusing to see.
2. **The First-Principles Thinker.** Strips the problem to fundamentals. Ignores standard playbooks and asks what you'd do if no convention existed and you reasoned from the goal up.
3. **The Expansionist.** Hunts the missed upside. Asymmetric outcomes, second-order wins, what success unlocks if the bet pays off.
4. **The Outsider.** Knows nothing about the industry. Asks the obvious questions insiders stopped asking, and points at the things everyone treats as given.
5. **The Executor.** Cares only about action. The exact emails, conversations, files, and decisions for the next seven days. No theory.

Each advisor returns its full response. Label them internally as Response A through E in random order before the next stage.

### Stage 2 — Anonymous peer review

Give each advisor the other four responses, labelled only "Response A", "Response B" and so on. They do not know which role wrote which, and they cannot see their own. Each one:
- Ranks the four peers 1 to 4 on accuracy and genuine insight
- Says in one line what each got right and what each missed

Anonymity is the whole trick. When an advisor can't tell it's grading its own earlier answer, it grades honestly instead of defending itself. Don't skip the anonymising.

### Stage 3 — Chairman synthesis

A final agent reads all five responses and all the peer reviews, then writes one verdict under 250 words. It must state:
- **The call.** What to actually do.
- **Strongest rationale.** The single best reason, drawn from whichever advisor earned it.
- **Biggest risk.** The one thing most likely to make this wrong.
- **Next step within 7 days.** One concrete action.

The chairman doesn't average the advisors. It judges them, using the peer rankings to weight who was actually right, and commits to a position.

## Running it in Claude Code

When the user says a trigger phrase ("council this: should I drop the free tier?"):

1. Confirm the decision and pull any context you have (files, prior messages, project notes).
2. Spawn the five advisors as parallel subagents using the prompts above. Use the agent/Task tool so they run independently.
3. Collect the five responses, shuffle and relabel them A to E.
4. Run the anonymous peer review (one pass per advisor, or one agent reviewing all four-vs-one sets).
5. Run the chairman.
6. Return: the chairman verdict first, then the five advisor responses underneath for the user to read if they want the detail.

Lead with the verdict. The advisor detail is there to back it up, not to bury it.

## Output shape

```
VERDICT (chairman)
- The call:
- Strongest rationale:
- Biggest risk:
- Next step (7 days):

THE COUNCIL
- Contrarian: ...
- First-Principles: ...
- Expansionist: ...
- Outsider: ...
- Executor: ...
```

## Credit

Built on Andrej Karpathy's LLM Council idea: route a question through several models, have them critique each other anonymously, then synthesise. This version runs the whole thing inside one Claude Code session using subagents instead of multiple model providers.
