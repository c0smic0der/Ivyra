# 05 — How Ivyra Works, From the Ground Up

*How to read this: straight through, once. It is strictly linear — every section uses only ideas defined in earlier sections, and every term and acronym is defined the first time it appears. There is no code. Part 1 says what the app does. Part 2 introduces each piece of the system, one at a time. Part 3 — the heart of the document — walks through the six flows where the pieces work together. Part 4 covers the rules that keep the system safe and honest. Part 5 is a pocket glossary.*

---

# PART 1 — WHAT THE APPLICATION DOES

Ivyra is built around one repeating loop over one kind of record.

A user names a **decision** — something in their control, "I'm turning down the contract" — and a **success criterion**: a checkable claim about how it plays out, "they come back with a full-time offer by end of September." Both are required to save. The criterion is the part that gets scored; the decision is the choice it belongs to. They attach a confidence (a number from 50 to 99 meaning "how sure I am this happens"), a resolution date (the day they'll know the answer), and optionally their reasoning in free text. When they save, the record **freezes**: the decision, the criterion, and the reasoning can never be edited again. This is deliberate — the product's honesty depends on your past self being unable to quietly rewrite what it believed.

(Rows saved before this two-field requirement existed have no decision — just a bare checkable claim. They're historic forecasts, and they still render in the journal and still score exactly like every row that follows; that's the only place this document calls them out.)

Time passes. The resolution date arrives. The user returns and answers one question: did the criterion happen? Yes, no, or void (meaning the question stopped making sense — the project was cancelled, say). They can also write a note about what actually happened.

The moment a verdict lands, simple arithmetic — ordinary math, no artificial intelligence involved — produces a score for that prediction. Across dozens of resolved predictions, the scores form a portrait: *when you say 80%, are you actually right 80% of the time?* Every chart, email, and piece of AI-written commentary in the app is derived from this portrait.

So the system's entire job is three verbs: **capture** the record, **freeze** it honestly, and **read it back** with numbers. Every component you're about to meet exists to serve one of those three.

---

# PART 2 — THE PIECES, ONE AT A TIME

This part introduces every component in the system. Each gets three things: what it *is* (defined from zero), what *job* it does in Ivyra, and — where it helps — the AWS service you already know that plays the same role. Nothing here interacts yet; Part 3 is where they work together.

## 2.1 The client: the user's browser

A **browser** (Chrome, Safari) is a program that fetches documents from the internet and displays them. The machine asking for something is called the **client**; the machine answering is called the **server**. They talk over **HTTP** — HyperText Transfer Protocol — which is just a structured format for "here is my request" and "here is your response." **HTTPS** is the same thing encrypted, so nobody in between can read or alter the traffic. A **URL** (Uniform Resource Locator) like `ivyra.app/insights` is the address of one thing a client can ask for.

The one modern wrinkle worth knowing: a page today isn't a static document. Along with the visible content, the server can send small pieces of program code that run *inside the browser*, making parts of the page interactive — a slider that updates a number as you drag it, a chart that reacts to clicks. So think of what the user sees as two layers: the rendered page (produced by the server) and small interactive islands (running on the user's machine). Everything on the user's machine is, from a security standpoint, **untrusted** — the user, or an attacker, controls it. This single fact drives most of Part 4.

*Job in Ivyra:* display the journal, the capture form, the insights charts; send the user's inputs to the server.

## 2.2 The host: Vercel

**Hosting** means running your application's code on servers reachable from the internet. **Vercel** is a hosting company built on the **serverless** model, which you know intimately from Lambda: you don't rent machines — you upload code, and the platform runs a copy of it on demand whenever a request arrives, then throws that copy away. Nothing runs when nobody's using the app; nothing bills either.

Two consequences of serverless shape the whole design, and both will reappear in Part 3. First, **statelessness**: because each request may run on a fresh copy, the application can't remember anything in its own memory between requests — anything that must persist has to live in the database. Second, **concurrency**: two requests can run as two simultaneous copies, so anything like "count, then act" has to be done carefully (§4.4).

*AWS translation:* Lambda for the compute, CloudFront for the global delivery, CodePipeline for the deploys — fused into one product. You push code to the repository; Vercel builds and deploys it automatically.

## 2.3 The application: one program with three kinds of doors

The application itself is a single program (written in TypeScript, a typed dialect of JavaScript) built on a framework called **Next.js**. A **framework** is a pre-built skeleton that handles the plumbing — routing requests to the right handler, assembling pages — so the project's code is mostly business logic. In object-oriented terms: the framework is the abstract base class; Ivyra's code fills in the methods.

The important design idea is that this one program exposes **three kinds of entry points** — three doors requests can come through — and Ivyra assigns each a strict responsibility:

**Pages** answer "show me something." When the browser asks for a URL, a page handler runs *on the server*, fetches whatever data it needs from the database, builds the finished screen, and sends it back. Reads only — pages never change data.

**Actions** answer "do something." When the user submits the capture form or taps a resolve verdict, the browser invokes an action — a named server-side function, like a remote procedure call in the services you've built. Actions are the **only** door through which data changes: they check who the user is, validate the input, and write to the database. All writes, nothing else.

**Endpoints** answer machine callers. Some callers aren't a human's browser — the scheduler (§2.8) hitting "send the weekly emails," or the one response that must arrive in pieces rather than all at once (the AI post-mortem, §3.6). These get plain HTTP endpoints, exactly the REST handlers you've written for years.

This reads-through-pages / writes-through-actions / machines-through-endpoints separation is the application's central organizing principle. When you're lost in the codebase, the first question is always: which door is this?

## 2.4 The database: Postgres, hosted by Supabase

A **database** is the system's permanent memory. Ivyra uses **Postgres**, a relational database: data lives in **tables** (like spreadsheets), each **row** is one record, each **column** is one field, and you ask questions in **SQL** (Structured Query Language) — "give me this user's predictions, newest first." **Supabase** is the company hosting the Postgres instance, playing the role RDS played for you, and it bundles two extras Ivyra uses: the sign-in service (§2.5) and a database extension for similarity search (explained where it's needed, §3.4).

Coming from DynamoDB, the mental adjustment: you don't design the table around access patterns. You model the truth, and make specific questions fast with **indexes** — pre-sorted structures the database maintains so a common question ("this user's rows, newest first") is a direct lookup rather than a scan. Ad-hoc questions still work without an index; they're just slower.

The whole schema is small enough to state in words. The heart is one table, **predictions**, where each row holds: who owns it, the frozen claim text, the confidence, the resolution date, the frozen reasoning, an optional "what's your plan / what would change your mind" answer, a category (work, health, money — assigned automatically, §3.3), the outcome (empty until resolved, then yes/no/void), the outcome note, a fingerprint used for similarity search (§3.4), and timestamps. The one supporting table, **ai_calls**, is a ledger: one row per call the app makes to an AI service — who triggered it, for what purpose, and how much it cost. That ledger is both the billing record and the enforcement point for spending limits (§4.4).

That's the entire data model: one table of predictions, one ledger. The smallness is deliberate — several larger designs were considered and cut.

## 2.5 The sign-in service: Supabase Auth

**Authentication** is proving who a user is. Ivyra is password-free: it uses **magic links** — you type your email, receive a one-time sign-in link, and clicking it proves you control that inbox, which *is* the proof of identity.

Once proven, the user gets a **session**: a small signed pass stored in a **cookie** (a piece of data the browser automatically attaches to every request to that site). "Signed" means the pass is stamped cryptographically — anyone can read it, but nobody can forge or alter it without the server's secret key, because any tampering breaks the stamp. From then on, every request the browser makes carries the pass, and the server reads the user's identity off it without any lookup. Sessions expire; signing out deletes the cookie.

*AWS translation:* Cognito. *Job in Ivyra:* issue the passes; everything else in the system trusts the pass, never the user's claims.

## 2.6 The AI vendors: Anthropic and OpenAI

Here is the demystification that makes the rest of the document easy: **an AI service is just another third-party vendor API.** An **API** (Application Programming Interface) is a machine-to-machine contract — you send a structured request over HTTPS with a secret key proving you're a paying customer; you get a structured response. AppFabric's collector spent years calling exactly this kind of thing. The only novelty is what these two vendors return.

**Anthropic** provides a **large language model (LLM)** — a system that, given text instructions (called a **prompt**), generates text in response. Ask it to "compare this person's written reasoning against what actually happened, in two paragraphs" and it writes those paragraphs. Two properties matter for design. It's *not deterministic*: the same prompt can produce differently-worded answers, because generation involves controlled randomness. And it's *not a calculator*: it produces plausible text, including plausible-looking numbers, with no guarantee of arithmetic correctness. Both properties are why Ivyra's rule exists: **the AI writes prose; ordinary tested code computes every number.** Billing is by volume of text processed, measured in **tokens** (word-fragments, roughly three-quarters of a word each) — which makes "how much text do we send it" a cost-control question (§4.4).

**OpenAI** provides the **embedding** service — it converts a piece of text into a numerical fingerprint such that *texts with similar meaning get similar fingerprints*. That one sentence is all you need for now; §3.4 explains it properly at the moment the system actually uses it.

*Job in Ivyra:* Anthropic writes the commentary (category classification, post-mortems, insight narratives); OpenAI makes the fingerprints that power "you've made calls like this before."

## 2.7 The email service: Resend

**Resend** is an email-sending vendor — SES, exactly. Ivyra sends two unrelated kinds of mail, and keeping them separate will save you confusion later. **Sign-in mail** (the magic links) is composed and sent *by the sign-in service* (§2.5), which is configured to route through Resend so the mail comes from `@ivyra.app`. **Application mail** (the weekly prompts, the "something resolved today" notices) is composed and sent *by Ivyra's own code* calling Resend directly. Same vendor, two different senders with two different configurations — a distinction that has already caused one confusing debugging evening, which is why it gets its own sentence here.

## 2.8 The scheduler: Vercel Cron

A **scheduler** triggers work at set times with no user involved. **Vercel Cron** is EventBridge scheduled rules in Vercel clothing: "at 9am every Friday, send an HTTP request to this endpoint of the app." The endpoint checks a shared secret so only the scheduler can invoke it, then does the work — Ivyra's weekly emails and resolution-day reminders run this way (§3.7).

## 2.9 The map, now that every piece is defined

```
                         the user's browser  (untrusted; displays pages,
                                              runs small interactive islands)
                                   │
                                   │  HTTPS requests, session pass attached
                                   ▼
   ┌────────────────────  THE APPLICATION on Vercel  ────────────────────┐
   │        one serverless program with three doors:                    │
   │   PAGES (reads)   ·   ACTIONS (writes)   ·   ENDPOINTS (machines)  │
   └──────┬──────────────────┬──────────────────────┬───────────────────┘
          │                  │                      │
          ▼                  ▼                      ▼
     the DATABASE       the AI VENDORS         the EMAIL vendor
     (Postgres at       (Anthropic: writes     (Resend)
      Supabase:          prose · OpenAI:            ▲
      predictions        makes fingerprints)        │
      + ai_calls                              the SCHEDULER
      + sign-in svc)                          (Vercel Cron → endpoints)
```

Read it once more with the responsibilities attached: the browser displays and asks; the application decides everything; the database remembers everything; the vendors each do one narrow job; the scheduler wakes the application up when no human is around. No component ever reaches around the application to talk to another — the app is the hub, and that centrality is what makes the security story in Part 4 tractable.

---

# PART 3 — THE FLOWS: THE PIECES WORKING TOGETHER

This is the heart of the document. Six flows cover essentially everything the system ever does. Each is a small diagram followed by numbered steps; where a flow needs a concept not yet explained, the explanation appears right there, as a pause, so you never read ahead of your own understanding.

## 3.1 Flow one — signing in

```
browser ──▶ application ──▶ sign-in service ──▶ (email via Resend) ──▶ user's inbox
                                                                          │ click
browser ◀── session pass ◀── application ◀── link verified ◀─────────────┘
```

1. The user types their email into the sign-in page and submits. The browser invokes an **action**.
2. The action asks the sign-in service to start a magic-link sign-in for that address.
3. The sign-in service generates a one-time link and emails it (through Resend, so it arrives from `@ivyra.app`). The link's destination is fixed by configuration — it points at the production site. (This configuration once pointed at a development machine, which is why sign-in links briefly led nowhere useful; a config fix, not a code fix.)
4. The user clicks the link. It lands on a small application endpoint whose only job is to hand the link's one-time proof back to the sign-in service and receive a **session pass** in exchange.
5. The pass is stored in a cookie. From now on, every request the browser makes carries it, and every part of the system derives "who is this?" from the pass alone. The one-time link is now dead — it cannot be reused.

The design property to remember: after step 5, identity is *settled infrastructure*. No later flow re-asks who the user is; they just read the pass.

## 3.2 Flow two — opening your journal (a read)

```
browser ──GET /──▶ PAGE handler ──who is this?──▶ pass says: user 123
                        │
                        ├──"user 123's predictions, newest first, 20 of them"──▶ database
                        │◀──────────────── rows ─────────────────────────────────┘
                        ▼
                 build the finished screen ──▶ browser displays it
```

1. The browser requests the home URL, pass attached.
2. The page handler reads the user's identity off the pass.
3. It asks the database one question: *this user's* predictions, newest first, one page's worth. Note the phrase "this user's" — the ownership filter is part of every question the system ever asks the database, without exception. That habit is the core of data isolation (§4.1).
4. The database answers instantly, because an index exists shaped exactly like this question (owner + date, pre-sorted).
5. The handler builds the finished journal screen — dated entries, each showing its claim, a preview of the reasoning, and either "80% · resolves Aug 15" (still open) or its verdict and score (resolved) — and sends it to the browser. A small strip at the top ("2 ready to resolve") appears only when something is due.

Every read in the system — the insights page, the resolve queue, the history — is this same five-step shape with a different question in step 3. There is no separate "backend service" being called; the page handler *is* the backend for that screen.

## 3.3 Flow three — saving a prediction (a write, plus invisible follow-up work)

```
browser ──form data──▶ ACTION ── validate ── assign owner ──▶ database (row frozen)
                          │                                        
                          └── after saving, in the background: ──▶ AI vendors
                              (classify category · make fingerprint)   │
                                            database ◀── updates ──────┘
                                            ai_calls ◀── ledger rows ──┘
```

1. The user fills the capture form — the decision, the success criterion, confidence, date, optionally reasoning and the plan field — and hits save. Both the decision and the criterion are required; the browser won't submit with either blank. The browser invokes the save **action** with the form's contents.
2. The action treats that input as hostile until proven otherwise (it came from an untrusted machine): it checks every field against the expected shape — confidence must be a whole number from 50 to 99, the decision and the criterion must each be non-empty and bounded, the date must be a date. Garbage is rejected here, before the database ever sees it.
3. The action reads the user's identity *off the session pass* and stamps it onto the new row as the owner. The browser never gets to say who owns a record — ownership is assigned by the server. This one sentence is half the app's security model.
4. The row is written. From this instant the decision, the criterion, and the reasoning are frozen — no edit path exists anywhere in the application. The user sees their entry appear; the save is complete from their point of view.
5. *Then*, in the background, two pieces of enrichment run — background meaning the user never waits on them, and if they fail, the saved row is simply less decorated until a retry: the criterion is sent to the language model with a tightly constrained instruction ("classify into exactly one of: work, health, money, relationships, self — answer with only the category"), and the answer, after validation against that closed list, fills the row's category; and the criterion-plus-reasoning is sent to the embedding service, and the returned fingerprint is stored on the row (what that's for: next flow).
6. Each vendor call writes one row to the **ai_calls** ledger — purpose, owner, cost.

The pattern in step 5 is worth naming, because it recurs: **constrain what you ask the AI for, validate what comes back, and degrade gracefully when it fails.** The AI is a decorator here, never a gatekeeper.

## 3.4 Flow four — "you've made calls like this before" (the track-record panel)

*Pause — what an embedding actually is.* The panel must answer: has this user predicted things *like this* before? Matching words fails immediately — "we ship the redesign by the 15th" and "the launch lands on schedule" share no important words and one meaning. The solution: convert text into position. An **embedding** is a long list of numbers — think of it as coordinates placing the text as a point on a map of meaning — produced by a model trained on enormous amounts of text with one pressure applied millions of times: *texts that mean similar things must land near each other; texts that don't must land far apart.* Picture a two-coordinate toy version:

```
        health-ish ▲
                   │  ● "I run the 10k under 55 minutes"
                   │
                   │                     ● "we ship the redesign by the 15th"
                   │                    ● "the launch lands on schedule"
                   └───────────────────────────▶ deadline-ish
```

The two delivery sentences sit together despite disjoint vocabulary; the running sentence sits elsewhere. The real thing uses ~1,500 coordinates instead of 2 — meaning has many independent directions — and no individual coordinate means anything by itself; only *distance between whole points* is meaningful. "Similar meaning" has become "nearby," which a database can compute. Ivyra's database has an extension (called pgvector) that stores these points and can sort rows by their distance to a given point — that's the entire role it plays.

Now the flow:

```
user types a draft claim ──(pause in typing)──▶ ACTION: fingerprint the draft (OpenAI)
                                                       │
              "this user's RESOLVED rows, nearest to this point, top handful" ──▶ database
                                                       │◀── neighbors ───────────┘
                    plain arithmetic on the neighbors: count, hits
                                                       ▼
                     "You've said 75% or higher on 6 calls like this. 2 landed."
```

1. As the user types a new entry, the app waits for a natural pause (so it isn't reacting to every keystroke), then sends the draft off to be fingerprinted — the same embedding service, the same recipe as saved rows, which matters: points are only comparable if they were placed on the map the same way.
2. The database is asked: among *this user's resolved* predictions, which points sit nearest the draft's point? The ownership filter comes first — similarity search can never surface another user's history — and only resolved rows count, because open ones have no outcome to learn from.
3. The handful of nearest neighbors comes back, and **ordinary arithmetic** — not the AI — produces the sentence: count them, count the hits, phrase it. "You've said 75% or higher on 6 calls like this. 2 landed."
4. If the user's history is too thin to say anything honest, the panel says so plainly instead of inventing a number.

This flow is the product's best demonstration moment, and notice its division of labor: the AI's only contribution was placing points on the meaning-map; the retrieval, the counting, and the sentence are all deterministic.

## 3.5 Flow five — resolving, and the scoring that follows

*Pause — the arithmetic.* One prediction's score: write the outcome as 1 (happened) or 0 (didn't), the confidence as a decimal (80% → 0.8). The **Brier score** is the square of the gap between them:

```
said 80%, it happened:   (0.8 − 1)² = 0.04    small — good
said 90%, it didn't:     (0.9 − 0)² = 0.81    large — bad
said 50%, either way:    (0.5 − x)² = 0.25    the "coin-flip" baseline
```

Lower is better, and squaring the gap is the moral core: being *confidently* wrong costs far more than being hesitantly wrong. The 0.25 line matters because always answering 50% — pure fence-sitting — scores exactly 0.25 no matter what happens; beat it, and your stated confidence is carrying real information. This scoring rule also has a proven property worth quoting: your expected score is best when you report what you *actually* believe — shading your numbers up or down can only hurt you on average, which is why the app can promise honest measurement rather than a gameable game.

Across many predictions, three summaries emerge, all built from the same records. Group predictions by stated confidence (the 70s, the 80s, the 90s) and check how often each group came true: plotted, that's the **calibration curve**, and a well-calibrated person's 80s come true 80% of the time. Average stated confidence minus overall hit rate gives **bias** — one signed number; claimed 76% on average while 47% happened means 29 points overconfident. And **boldness** asks whether your high calls and low calls actually come true at different rates — because someone who answers 55% to everything can be perfectly calibrated and perfectly uninformative; calibration says your numbers are *truthful*, boldness says they're *useful*, and an honest diagnostic needs both. Small groups are never shown as noisy percentages — below a minimum count the app shows an honest "not enough data yet" state instead.

The flow itself is short:

1. The resolution date arrives; the entry surfaces in the due strip (and a reminder email — flow six).
2. The user opens it, picks yes / no / void, and optionally writes what actually happened. Void means the question dissolved — it's excluded from every average, because scoring a dissolved question either direction would punish or reward the *world* changing rather than the user's judgment.
3. The resolve **action** writes verdict, note, and timestamp together as one atomic change — all-or-nothing, so no half-resolved row can exist.
4. Scores and summaries are recomputed by the ordinary tested arithmetic above. The AI is nowhere in this step, by design and by rule.

## 3.6 Flow six — the post-mortem: the AI reads your frozen reasoning

The moment a prediction resolves, the most distinctive feature runs: the language model receives three things — the reasoning the user froze *before* the outcome, the note about what actually happened, and the already-computed scores — under standing instructions that say, in essence: *compare the stated assumptions against reality; report what held and what failed; never judge whether the decision was good; never produce numbers of your own.* It writes back something like: "Your confidence rested on Dana being unblocked. She never was — you noted the same stall on August 3rd and didn't revise."

Two mechanics are worth understanding at this level. First, the generated text arrives **in pieces** — the model produces words progressively over several seconds, and rather than making the user watch a spinner, the application forwards each piece to the browser as it arrives, so the analysis visibly types itself. This is the one interaction in the app that can't go through a normal action (which returns a single answer), so it uses a plain **endpoint** built for a trickling response. Second, **cost is bounded at the door**: since the journal reframe made reasoning and outcome notes long, only a capped excerpt of each is included in what's sent to the model — the spending ceiling is enforced where the request is assembled, not hoped for afterward. The finished text is saved, and one more row lands in the ai_calls ledger.

The same pattern, with a wider lens, produces the insights page's narrative: the arithmetic first decomposes *where* the user's miscalibration lives, and the model is handed those findings to explain in plain language — the numbers diagnose, the AI narrates. That division — never the reverse — is the sentence the entire system is built to make true.

## 3.7 Flow seven — the week runs itself (scheduled email)

```
Friday 9am: SCHEDULER ──(secret attached)──▶ ENDPOINT ──▶ database: who gets a prompt?
                                                 │──▶ Resend: send "what's your read on next week?"
Monday 9am: same shape ──▶ "what resolved over the weekend" digest (sends nothing if nothing's due)
```

1. The scheduler fires on its clock and calls the application's email endpoint, presenting the shared secret; without it, the endpoint refuses — the URL is public, the ability to trigger it is not.
2. The endpoint queries the database for who should receive what, composes the mail, and sends it through Resend.
3. One guard makes this safe against the scheduler's habits: schedulers occasionally deliver the same trigger twice, so each send is recorded against its period ("this user, this ritual, this week") *before* sending, with the database refusing duplicate records — a retried trigger finds the record already there and sends nothing. The property is called **idempotency**: doing it twice has the same effect as doing it once. You'll notice it's the same claim-before-act shape as the AI spending cap — same problem (an at-least-once trigger meeting a must-happen-at-most-once effect), same solution (let the database, the only shared memory, arbitrate).

Those seven flows are the entire system in motion. Everything else in the codebase is a variation: the insights page is flow two with heavier arithmetic; the resolve queue is flow two with a different question; the resolution-day reminder is flow seven with a different message.

---

# PART 4 — THE RULES THAT KEEP IT SAFE AND HONEST

The flows above mentioned security in passing; this part collects the whole model in one place. It is five rules, each one sentence of principle and one paragraph of practice — and together they are the answer to "walk me through your security model" in an interview.

## 4.1 Every question to the database is scoped to its owner

The principle: no query, read or write, is ever phrased without "…belonging to this user," where "this user" comes from the session pass. The practice: you saw it in every flow — the journal read, the similarity search, the resolve write. There is also a second, deeper layer available: Postgres itself can enforce per-row ownership rules (a feature called **row-level security** — policies attached to the table that the database applies to every query regardless of what the application asked). Ivyra's tables carry those policies, but with one honest caveat you should always volunteer rather than hide: the application currently connects to the database with an administrative credential that *bypasses* those policies — so today, isolation rests on the application's perfect discipline (verified by security review on every path), with the database-level rules as the intended future backstop once user-facing queries move to a connection that respects them. Knowing the difference between a control that exists and a control that's enforcing is a senior distinction; owning it out loud is worth more than pretending the backstop is live.

## 4.2 The browser is never trusted

The principle: everything arriving from the user's machine is treated as attacker-controlled until validated. The practice: every write crosses an action that checks each field against its expected shape and range before the database sees it, and the two most sensitive facts — who the user is and who owns the new record — are never taken from the input at all; they're derived from the session pass and stamped on server-side. A hostile client can send anything it likes; it cannot make the server *believe* anything it likes.

## 4.3 Secrets live only on the server

The principle: the keys to the database, the AI vendors, the email vendor, and the scheduler exist only in the server's environment configuration — never in code, never in anything shipped to a browser. The practice: the build system draws a hard line between server code and browser code, and the security review's job included verifying no secret crosses it. One deliberate corollary: the development-only password login (which exists solely so the seeded demo account can sign in locally) is excluded from production builds entirely, with a test asserting the exclusion — a convenience that can't exist in production can't be abused in production.

## 4.4 Spending is capped where it happens, and everything is on the ledger

The principle: no user can cause unbounded AI spend, and no AI call is invisible. The practice has two halves. Volume: every prompt is assembled from capped excerpts, so a ten-page reasoning entry can't become a ten-page bill. Frequency: before any AI call, the application claims a slot against that user's daily allowance — and because two serverless copies of the app can run simultaneously (§2.2), the claim is done as a single atomic database operation ("insert this ledger row only if the user's count today is under the cap"), letting the database arbitrate races rather than trusting two blind copies to count correctly. No slot, no call. The ai_calls ledger this produces is simultaneously the bill, the rate limiter, and the audit trail.

## 4.5 Frozen words, deterministic numbers

The principle — really the product's constitution, enforced as engineering: what the user wrote before the outcome can never be edited, and every number the user sees comes from ordinary, tested arithmetic, never from the AI. The practice: no edit path exists for frozen fields anywhere in the application; all scoring lives in one tested module that the screens merely display; and the AI's standing instructions explicitly forbid it from judging decisions or producing figures — it narrates what the arithmetic found, in prose, and nothing else. There's a matching copy rule for every human-written string in the product ("report the relationship between confidence and reality; never evaluate whether a decision was good"), so the interface can't drift into promises the math can't keep.

The rule extends past resolution. At resolve time, the user can also write a **reflection** — free text answering "knowing what you know now, was this the decision you wanted to have made?" — and pick an optional one-tap **stance**: stand by it, mixed, or wouldn't again. Both freeze the instant they're saved, exactly like the original decision and reasoning, and neither is ever scored: no arithmetic reads the stance, no chart buckets by it, and the AI is never asked to judge whether the stance was the right one. They're recorded, never graded — the user's own words about their own words.

---

# PART 5 — POCKET GLOSSARY

Every term and acronym used above, one line each, for pre-interview refresh.

**Action** — a named server-side function the browser can invoke; the only door through which data changes. **API (Application Programming Interface)** — a machine-to-machine contract: structured request in, structured response out. **Authentication** — proving who a user is. **Bias** — average stated confidence minus actual hit rate; sign gives direction of miscalibration. **Boldness** — whether different confidence levels actually come true at different rates; the "are your numbers informative" dial. **Brier score** — the squared gap between confidence and outcome; lower is better; 0.25 is the coin-flip baseline. **Calibration curve** — stated confidence plotted against how often it came true; the diagonal is perfection. **Client / server** — the machine asking / the machine answering. **Cookie** — data the browser attaches automatically to every request to a site; where the session pass rides. **Decision** — the choice a user names at capture, alongside its success criterion; required on every new entry, frozen on save, never scored. **Embedding** — a text's coordinates on a learned map of meaning; nearby points mean similar things. **Endpoint** — a plain HTTP entry point for machine callers or trickling responses. **Framework** — the pre-built application skeleton (here, Next.js) your code fills in. **HTTP / HTTPS** — the request-response protocol of the web / the same, encrypted. **Idempotency** — doing it twice has the same effect as once; required wherever retries meet side effects. **Index** — a pre-sorted structure making one shape of database question fast. **LLM (large language model)** — a service that generates text from text instructions; fluent, nondeterministic, not a calculator. **Magic link** — one-time emailed sign-in URL; inbox control as identity proof. **Page** — a read-only entry point that builds a screen server-side. **pgvector** — the database extension that stores embeddings and sorts rows by distance to a point. **Postgres** — the relational database; tables, rows, columns, SQL. **Prompt** — the text instructions sent to a language model. **Reflection** — the free-text answer, written at resolve, to "was this the decision you wanted to have made?"; frozen, never scored. **Row-level security** — per-row ownership rules enforced by the database itself. **Serverless** — code run on demand per request; stateless between requests; concurrent copies possible. **Session pass** — the signed, unforgeable token proving identity on every request. **SQL (Structured Query Language)** — how questions are phrased to a relational database. **Stance** — the optional one-tap self-report at resolve (stand by it / mixed / wouldn't again); recorded, never scored. **Success criterion** — the checkable claim that actually gets scored; confidence, resolution, and Brier all attach to this, not to the decision. **Token (AI billing)** — the word-fragment unit AI usage is measured in; ~¾ of a word. **URL (Uniform Resource Locator)** — the address of one thing on the web. **Void** — a resolution meaning the question dissolved; excluded from all scoring.

---

*Where to go from here: read this once end to end, then open the app with it beside you and match each screen to its flow — the journal is 3.2, saving is 3.3, the panel is 3.4, resolving is 3.5–3.6. When every screen maps to a flow and every flow's steps feel obvious, you understand the system. The deeper layers — the exact code, the chart internals, the vendor request formats — are each a separate conversation to have once this skeleton is solid, and they'll attach easily to it.*
