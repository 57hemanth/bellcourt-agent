# Design note: why Bell is built this way

**Problem it targets.** Two root causes from the data pack drive Bellcourt's failures:
- All 64 missed MA standard decisions were incomplete on receipt (a timeliness problem).
- 75% of QA errors came from applying the wrong rule (an accuracy problem).

Bell therefore does two jobs: complete requests faster, and pick the right rule with a citation. It does not try to automate the clinical judgement.

**The model reads; code decides.** Gemini is used only where language is the problem: reading faxes and turning clinical notes into structured facts. Its output is schema-constrained JSON, and it never sees the rules or produces a recommendation.

Rule selection (GOV-01 precedence, the policy version in effect on the date of service, plan provisions, void memos) and criteria logic are deterministic TypeScript. That makes every recommendation reproducible and testable against the QA file (120/120). It is also explainable to Riverbend auditors and immune to instructions hidden in faxes. A `null` fact always means "ask for it", never "deny".

**Knowledge graph.** "Which rule applies?" is a traversal:

```
client → plan document → provision → service → policy → version effective on the date of service, with memos that CONFLICT_WITH it marked void
```

Modelling the UM Library as a graph replaces 1,100 files with filename search with typed, dated relationships that each have an owner. An amendment like Kestrel's becomes an edge with an effective date, not an email.

Neo4j is supported, but an in-memory implementation of the same graph is the default. Two reasons: the demo must not depend on infrastructure, and Paul's four-person team should not have to run a new database on day 1. The KB holds no PHI, so Neo4j Aura is an option without extending the BAA.

**Next.js full-stack.** One TypeScript codebase serves the provider portal, the clinical console and the API, and it deploys to Azure App Service inside the BAA tenant. Streaming route handlers drive the live intake steps. Motion handles the interface animations; they always reflect real pipeline events rather than fake timers.

**Alongside PACE, not instead of it.** Bell reads the fax share, the portal webhook, the eligibility files and the PACE replica, and writes nothing to PACE. The human decision is still recorded in PACE. That respects the 2028 replacement timeline and keeps the 90-day plan realistic.

**What production adds:**
- Entra ID in place of demo personas.
- Postgres or Azure SQL in place of the JSON file store.
- Azure Document Intelligence as a second OCR for cross-checking.
- A provider phone directory for outreach escalation.
- Riverbend's 60-day notice before go-live.
- A 4-week shadow period, with nurse–Bell agreement and every disagreement reviewed by QA.
