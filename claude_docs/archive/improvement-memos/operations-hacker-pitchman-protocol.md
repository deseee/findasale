# Hacker + Pitchman Collaboration Protocol

Created: Session 96 (2026-03-09)
Status: Active
Backlog ref: F2.5

---

## Purpose

Blue-sky threat modeling: the Pitchman thinks creatively about attack vectors
and the Hacker evaluates them technically. Together they find threats that
neither would find alone.

## When to Use

- Pre-launch security review (think beyond standard OWASP)
- After major feature ships (what new attack surface did we create?)
- Quarterly threat modeling refresh
- When Patrick says "what could go wrong with this?"

## Session Flow

1. **Orchestrator invokes Pitchman** with prompt:
   "Generate 5-10 creative attack scenarios against [feature/system]. Think
   like a motivated adversary with unlimited creativity. Don't filter for
   feasibility — that's the Hacker's job."

2. **Orchestrator reads Pitchman output** from MESSAGE_BOARD.json.

3. **Orchestrator invokes Hacker** with prompt:
   "Review these attack scenarios from Pitchman: [paste scenarios]. For each,
   assess: Is this technically feasible? What's the real-world likelihood?
   What would it take to execute? Classify as: Credible Threat / Unlikely /
   Fantasy. For credible threats, write a full finding."

4. **Orchestrator synthesizes** — credible threats go to the backlog. Unlikely
   scenarios get logged for future reference. Fantasies get discarded.

## Message Board Tags

- Pitchman posts: `type: "finding"`, `subject: "Blue-sky threat: [name]"`
- Hacker posts: `type: "finding"`, `subject: "Threat assessment: [name]"`

## Output

A joint threat report filed in `claude_docs/health-reports/threat-model-YYYY-MM-DD.md`
with:
- Pitchman's creative scenarios
- Hacker's technical assessments
- Credible threats → backlog items
- Dismissed scenarios with reasoning
