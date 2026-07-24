# Building Aftercast with Claude — Understanding & Setup Guide

*Two sections. Section 1 explains what Claude tooling you'll use and how it actually works — simple but detailed. Section 2 is the complete, ground-zero setup: every step, every command, every prompt, in order, explained as if you've never touched any of it.*

> Anthropic ships Claude Code features frequently and occasionally changes pricing/limits. Specifics here are current as of mid-2026; verify plan details in **Settings → Usage** (claude.ai) and with `/status` inside Claude Code. The patterns are stable even as features churn.

---

# SECTION 1 — What you'll use and how it works

## 1.1 The two Claudes, and which builds the app

You'll interact with Claude in two different places, and they play different roles:

- **Claude.ai (chat, web/mobile)** — what you're using right now. Good for thinking, specs, and documents. It cannot directly edit files on your machine.
- **Claude Code** — a tool that runs *on your computer*, inside your project folder. It can read your files, write and edit code, run terminal commands (tests, builds, git), and see the results. **This is what builds the app.**

The distinction that matters: Claude Code is *agentic*. You don't paste code back and forth. You give it a goal ("implement the scoring module with tests"), and it reads the relevant files, writes code, runs the tests, sees failures, fixes them, and reports back — a loop it runs on its own, with you as the gatekeeper.

## 1.2 Your Claude Max plan — what powers what

- Your **Max subscription** ($100/mo = "5x", $200/mo = "20x") covers both claude.ai chat **and** Claude Code. Usage is measured in tokens against a **rolling ~5-hour window plus a weekly cap, shared between chat and Code**. Check anytime with `/usage` inside Claude Code.
- **Critical mental model:** your Max plan powers *you building the app*. The **deployed app's** AI calls (post-mortems, enrichment) are billed separately on an **Anthropic API key**, pay-per-token, a few dollars a month at your scale. Two separate meters that never touch.
- One gotcha: *headless/programmatic* use of Claude Code (scripts, CI pipelines) draws from a separate monthly credit pool. **Interactive terminal sessions — how you'll work — are unaffected.**
- Budget hygiene: `/clear` between unrelated tasks, `/compact` when a long session gets bloated, keep CLAUDE.md lean (it's re-sent with every request).

## 1.3 The pieces of Claude Code, one by one

**The terminal session.** You open a terminal in your project folder, type `claude`, and get an interactive session. You type instructions in plain English; Claude reads files, proposes edits and commands, and (by default) asks permission before changing anything. You approve with a keypress. Over time you can grant standing permissions for safe operations (running tests) while keeping gates on risky ones (deleting files, git push).

**CLAUDE.md — the project constitution.** A markdown file at your repo root that Claude Code automatically reads at the start of every session. It's where you write the rules of the project once, instead of repeating them every conversation: the stack, the directory layout, the non-negotiables ("the AI never computes scores"), the commands ("run tests with `npm test`"). Keep it under ~200 lines — it's sent with every request, so bloat costs tokens and attention.

**Plan mode.** A toggle (Shift+Tab or `/plan`) where Claude *thinks and proposes without touching files*. It reads the codebase, lays out a step-by-step plan, and waits for your approval before executing. This is your main defense against Claude confidently building the wrong thing. Rule of thumb: plan mode for anything spanning multiple files; skip it for one-liners.

**Subagents.** Files in `.claude/agents/`, each defining a specialist (a name, instructions, allowed tools, optionally a different model). When Claude needs that specialty, it spawns the subagent in a *separate context* — it goes off, reads 30 files or reviews a diff, and returns just a summary. Two wins: your main session stays uncluttered, and the *reviewer isn't the writer* — a fresh pair of eyes grading work it didn't produce. You'll create two: a **scoring-verifier** (tries to refute the math) and a **security-reviewer** (audits auth and data access).

**Skills.** Folders (`.claude/skills/<name>/SKILL.md` in the project, or `~/.claude/skills/` for personal ones that follow you across projects) containing instructions — and optionally scripts and reference files — that Claude loads **only when the task matches**. The contrast with CLAUDE.md is the point: CLAUDE.md is sent with *every* request, so it must stay lean and universal; a skill costs almost nothing until triggered (Claude sees only its name and description), then pulls its full contents in exactly when relevant. Rule: **CLAUDE.md for rules that always apply; skills for expertise that applies sometimes.** For this project, two earn their keep once the pattern recurs (don't create them day 1): an `llm-calls` skill (the structured-output request shape, validate-and-repair retry, `ai_calls` logging, per-user cap — the procedure repeats on days 4–8 and in v2) and a `scoring-math` skill (the worked Brier/identity/Wilson examples as reference for anything touching `src/lib/scoring/`).

**Hooks.** Small scripts that fire automatically on events — e.g., "run the test suite whenever Claude finishes a task; if tests fail, tell it." Hooks are *deterministic* guardrails: not advice Claude might ignore, but machinery that always runs. You'll add one: tests-must-pass-before-done.

**Slash commands you'll actually use:** `/init` (generate a starter CLAUDE.md), `/plan`, `/clear` (wipe context between tasks), `/compact` (summarize a long session to free space), `/model` (switch models), `/usage` (check budget), `/agents` (manage subagents), `/security-review` (built-in security audit), `/mcp` (manage MCP connections).

**MCP servers (optional, added later).** Plugins that give Claude Code extra abilities — e.g., querying your live Postgres database or driving a browser to click through your deployed app. Skip them on day 1; add when a real friction appears.

## 1.4 Model routing — which brain for which job

Your Max plan includes multiple models; picking deliberately stretches budget and improves results:

| Model | Character | Use for |
|---|---|---|
| **Opus** | Deepest reasoning, most expensive | Architecture decisions, the scoring math, tricky debugging, reviews |
| **Sonnet** | Fast, strong, the workhorse | ~80% of the build: UI, CRUD, wiring, routine features |
| **Haiku** | Cheapest, fastest | File-finding and doc-lookup subagent chores |

Switch anytime with `/model opus` or `/model sonnet`. A good default: run the session on Sonnet; hop to Opus for the scoring engine, schema decisions, and final reviews. (The *app itself* uses Haiku via API — unrelated to this table.)

## 1.5 The workflow loop — how a feature actually gets built

Every feature, same five beats:

1. **Research** (only if needed): unfamiliar API? Have a subagent or a quick session read the docs and summarize.
2. **Plan**: plan mode → "propose the implementation of X, with tests, before writing code." Read the plan. Correct it. *This is where your engineering judgment does its work.*
3. **Execute**: approve; Claude writes code, runs tests, iterates. Don't micromanage how — judge results.
4. **Review**: demand evidence, not claims — "show me the passing test output." For critical code, spawn the verifier subagent to *attack* it. Read the diff yourself (`git diff`); you are the last gate.
5. **Commit**: small, working increments. Git is your undo button for anything Claude does.

Two habits that separate good sessions from mush: **evidence over assertion** (a green test run, a screenshot — never "it should work now"), and **fresh eyes on critical code** (the model that wrote it shouldn't be the only one grading it).

---

# SECTION 2 — Ground-zero setup, step by step

*Follow in order. Each step: what you're doing, exactly where to do it, the exact command or prompt, and what should happen. Total time: roughly 2–3 hours for Part A (accounts & installs) and Part B (project bootstrap) combined — that's your Day 1.*

## Part A — Accounts and installs (one-time)

*Before the first step, three fundamentals about the terminal, since everything below happens in one:*
- *The terminal is a text interface to your computer: you type a command, press Enter, the computer runs it and prints the result. Commands are just programs — `git`, `node`, and `claude` are programs that happen to have no windows.*
- *You are always "in" a folder (your **working directory**). Commands act relative to it. `cd foldername` moves you into a folder ("change directory"); `pwd` prints where you are; `ls` lists what's here. The `~` symbol means your home folder.*
- *If a command prints nothing, that usually means success — silence is the terminal's thumbs-up. Errors announce themselves.*

### Step A1 — Check Node.js
**What you're doing:** verifying that Node.js — the program that runs JavaScript *outside* a browser — is installed. Why it matters: JavaScript was born as a browser language; Node lets it run on your machine like any normal program. Claude Code is itself a JavaScript program (Node runs it), and Next.js's dev server, build system, and tooling are all Node programs. Nothing in this stack works without it.
**Where:** your computer's terminal (macOS: the Terminal app, in Applications → Utilities; Windows: PowerShell — though WSL2 is smoother for this stack; Linux: any shell).
```
node --version
```
**Command breakdown:** `node` invokes the Node.js program; `--version` is a *flag* — an option that modifies what a command does. Flags start with `--` (or `-` for short forms). This flag says "don't run anything, just print your version and exit." Nearly every program supports it, and it's the standard way to check "is X installed, and how old is it?"
**Expect:** something like `v22.11.0`. Anything `v18` or higher works. If you get "command not found" (the terminal has no program called `node`) or an old version: download the **LTS** installer from https://nodejs.org (LTS = "long-term support," the stable version — always choose it over "Current"), run it, then **close and reopen the terminal** (terminals only learn about newly-installed programs on restart) and re-check.
**Bonus check on Apple Silicon Macs (M1/M2/M3/M4):** run `node -p "process.arch"`. It should print `arm64`. If it prints `x64`, your Node is an Intel build running through Apple's Rosetta translation layer — it works but wastes performance; reinstall the arm64 build from nodejs.org. (`-p` means "evaluate this JavaScript expression and print the result" — you just ran your first line of JS through Node.)

### Step A2 — Check git, set identity
**What you're doing:** verifying git — the version-control system — and telling it who you are. What git *is*, in one paragraph: git records snapshots of your project (called **commits**) every time you tell it to, building a complete history you can inspect, compare, and rewind to. It's the industry standard, it's how code gets to GitHub, and — critically for this project — it's your **undo button for everything Claude Code does** (Part D5). The identity config exists because every commit is stamped with an author; git refuses to commit until it knows whose name to stamp.
```
git --version
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```
**Command breakdown, line by line:**
- `git --version` — same pattern as A1: prove it's installed.
- `git config --global user.name "Your Name"` — `git config` reads/writes git's settings; `--global` means "for every project on this machine" (without it, the setting would apply only to the current folder's project); `user.name` is the setting being written; the quoted text is its value (quotes let the value contain spaces). Use your real name — it appears on GitHub next to your commits, which recruiters may see.
- The third line is identical mechanics for your email. **Use the same email as your GitHub account** — that's how GitHub links commits to your profile (the green contribution graph).
**Expect:** the version line prints; the two config lines print *nothing* (silence = success). Verify with `git config --global user.name`, which echoes the value back.
**If git is missing:** macOS: `xcode-select --install` (installs Apple's Command Line Tools, which include git). Windows: https://git-scm.com. Linux: `sudo apt install git`. *(macOS note: if `git --version` errors about `xcrun`/incompatible architecture on an Apple Silicon Mac — common after migrating from an Intel Mac — the tools are stale Intel builds. Fix: `sudo rm -rf /Library/Developer/CommandLineTools` then `xcode-select --install` to reinstall fresh. `sudo` means "run as administrator" and will ask for your Mac password; `rm -rf` force-deletes a folder — dangerous in general, safe on exactly this path.)*

### Step A3 — Install Claude Code and sign in
**What you're doing:** installing the Claude Code program globally and linking it to your Max subscription.
**Where:** terminal, any directory (a *global* install doesn't care where you are).
```
npm install -g @anthropic-ai/claude-code
claude --version
```
**Command breakdown:** `npm` is the **Node Package Manager**, installed automatically alongside Node in A1 — it downloads JavaScript software ("packages") from a central registry, the same way an app store downloads apps. `install` is the subcommand. `-g` is the flag for **global**: install this as a machine-wide command usable from any folder, rather than as a dependency of one project (project-local installs, which you'll see in B1, live in that project's `node_modules` folder and don't pollute the machine). `@anthropic-ai/claude-code` is the package's full name — the `@anthropic-ai/` prefix is a *scope*, a namespace proving it's published by Anthropic's official account and not an imposter with a similar name. The second line confirms the install created a working `claude` command.
**Then sign in:** type `claude` to launch a session — on first run, a browser window opens asking you to log in. **Use your claude.ai account (the one with Max).** This is the step that connects the terminal tool to your subscription's token pool; there is no separate Claude Code account. Inside the session, type `/status` — it should show your plan tier. Then type `exit` (or Ctrl+C twice) to leave.
**Watch out:** if the login page offers "Anthropic Console" vs "Claude.ai" account options, pick **Claude.ai** — the Console account is the API-billing identity from A4.5, and signing in with it would bill your sessions per-token instead of using your Max plan.

### Step A4 — Create the accounts you'll wire in later
**What you're doing:** signing up for the five external services the app depends on — just creating the accounts, configuring nothing yet, so Part B never stalls on a signup page. What each one is *for*:
1. **GitHub** (github.com) — the standard host for git repositories ("repos" — projects with their history). Your code's home; also what Vercel watches to auto-deploy, and a profile recruiters actually look at.
2. **Supabase** (supabase.com) — a hosted **Postgres database** (where the app's data lives — predictions, scores) plus **authentication** (login/signup machinery) in one free service, so you build neither from scratch. Sign up *with GitHub* ("Continue with GitHub" — it reuses your GitHub identity: one click, one fewer password).
3. **Vercel** (vercel.com) — the hosting platform that runs your Next.js app on the public internet. Also sign up **with GitHub** — this matters beyond convenience: the GitHub link is literally how Vercel sees your repo and redeploys on every push.
4. **Anthropic Console** (console.anthropic.com) — the **API-billing** side of Anthropic, deliberately separate from claude.ai. This issues the API key your *deployed app* uses for its AI calls (post-mortems, enrichment), billed per-token. New accounts typically get a small free credit; later add ~$5, which outlasts the MVP. (This is the two-meters distinction from §1.2 made physical: claude.ai account = your Max plan = you building; Console account = pay-per-token = the app running.)
5. **Resend** (resend.com) — a developer email service; the app's reminder emails ("your prediction resolves today") go through it. Free tier is plenty.

### Step A5 — Collect your secrets into a scratch note
**What you're doing:** gathering the five secret values Part B will paste into the environment file — collecting them now prevents mid-flow scavenger hunts across five dashboards. A **secret** is any value that grants access: an API key is a password-for-programs, and anyone holding it can act (and spend) as you. Hence the rules: keep them in a local note for the next hour, then only in `.env.local`; **never in git, never in chat, never in a screenshot.**
1. **Supabase:** dashboard → **New project** → name it `aftercast`, pick the region nearest you (physical distance = latency), click **Generate a password** for the database and *save it in your note* → wait ~2 min while it provisions. Then **Settings → API**: copy the **Project URL** (your database's public address) and the **anon public key** (the low-privilege key browsers are allowed to hold — "anon" = anonymous-visitor permissions; it's safe-ish in public *because* Row-Level Security constrains it, which is why RLS is a hard rule in CLAUDE.md). Then **Settings → Database → Connection string**, pick **URI**: copy it — this is `DATABASE_URL`, the full-privilege address+credentials your *server* uses; note it embeds that DB password you generated (replace the `[YOUR-PASSWORD]` placeholder if shown).
2. **Anthropic Console:** **API Keys → Create key** → name it `aftercast` → copy the `sk-ant-...` value immediately — **it's shown exactly once**; lose it and you just create a new one (keys are cheap; leaked keys are not).
3. **Resend:** **API Keys → Create** → copy the `re_...` value (same shown-once rule).

---

## Part B — Project bootstrap (Day 1)

### Step B1 — Create the Next.js project
**What you're doing:** generating the entire starting project — folders, config files, a runnable placeholder site — from an official template, then proving it runs. This is *scaffolding* in the literal sense: nobody hand-creates the ~20 config files a modern web project needs; a generator does it correctly in one command.
**Where:** your project folder is `/Users/Shiv/Desktop/projects/decision_calibrator` — everything lives inside it. Navigate there first (`mkdir -p /Users/Shiv/Desktop/projects/decision_calibrator` first if it doesn't exist yet; `mkdir` = "make directory", `-p` = "create parents as needed"):
```
cd /Users/Shiv/Desktop/projects/decision_calibrator
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
npm run dev
```
**Command breakdown:**
- `cd /Users/Shiv/Desktop/projects/decision_calibrator` — move into your project folder. **Every command in Part B and every future `claude` launch assumes you're inside this folder** — it's also your Claude Code permission boundary, per D2.
- `npx` — npm's cousin: **run a package once without installing it**. Perfect for generators you'll use a single time. (`npm install` = buy the appliance; `npx` = rent it for an afternoon.)
- `create-next-app@latest` — the official Next.js project generator; `@latest` pins it to the newest release so you don't scaffold with a stale cached copy.
- `.` — "scaffold into the **current folder**" rather than creating a new subfolder. This is the one deviation from the generator's default flow, and it's what keeps everything directly inside `decision_calibrator` instead of nesting a second folder within it. The folder must be empty (or near-empty) for this to work — if the generator complains about conflicting files, list what's there (`ls -a`) and clear it out first. The generated app's internal name will be `decision_calibrator` (the folder name); the *product* is still called Aftercast — an npm package name and a product name are separate things, and only the latter appears in the UI.
- The flags are answers to questions the generator would otherwise ask interactively: `--typescript` (typed JavaScript — the compiler catches type errors before they run; the 2026 hiring baseline), `--tailwind` (the styling system: utility classes in your markup instead of separate CSS files), `--eslint` (the standard code-quality linter), `--app` (**the App Router** — modern Next.js architecture with Server Components; this is the hiring-signal idiom, versus the legacy "Pages Router"), `--src-dir` (application code lives under `src/`, cleanly separated from root-level config clutter), `--import-alias "@/*"` (lets code write `import x from "@/lib/scoring"` instead of fragile `../../../lib/scoring` relative paths — `@/` just means "from src/").
- `npm run dev` — `npm run <name>` executes a *script* defined in `package.json` (the project's manifest file — its name, dependency list, and named commands). The `dev` script starts the **development server**: a local-only web server that compiles your app on the fly and hot-reloads the browser when files change. It runs until you stop it.
**Expect:** the generator takes a minute (it's downloading dependencies into `node_modules` — a famously enormous folder; that's normal). `npm run dev` prints `Local: http://localhost:3000` — open that in a browser (`localhost` = "this machine"; `:3000` = the port, one of thousands of numbered doors a computer can serve on) and you'll see the Next.js starter page. **Ctrl+C** in the terminal stops the server (the universal "stop the running program" keystroke).

### Step B2 — Put it on GitHub
**What you're doing:** creating an empty repository on GitHub's servers and connecting your local project to it, establishing the local→GitHub pipeline that (in B7) becomes the local→GitHub→Vercel deploy pipeline. Mental model: your local git history and GitHub's copy are two separate things; `push` is the act of syncing local → remote.
**Where:** first github.com, then the terminal in the project folder. (`create-next-app` already ran `git init` — which turns a folder into a git repository by creating a hidden `.git` directory where all history lives — and made the first commit, so your local side is ready.)
On github.com: **New repository** → name `decision_calibrator` (matching your folder — repo and folder conventionally share a name) → **Private** (you control who sees it; you can flip to public or add recruiters later) → **create it completely empty** — do *not* check "Add a README": your local repo already has history, and a README created on GitHub's side would give the remote its own conflicting history, causing a rejected push and a confusing first git experience.
```
git remote add origin https://github.com/YOUR_USERNAME/decision_calibrator.git
git branch -M main
git push -u origin main
```
**Command breakdown:**
- `git remote add origin <url>` — a **remote** is a saved bookmark to another copy of the repo; `origin` is the conventional nickname for "the main remote." This line just records the address (copy the exact URL from the page GitHub shows after creating the repo).
- `git branch -M main` — a **branch** is a named line of history; `main` is the modern default name. `-M` renames the current branch to `main` (some setups still default to the older name `master`; this normalizes it — GitHub and Vercel both expect `main`).
- `git push -u origin main` — **push** uploads your commits to the remote. `-u` ("set upstream") remembers the pairing, so every future sync is just a bare `git push`. First push may open a browser window to authenticate — approve it.
**Expect:** refresh the GitHub page — your code is there. That page is now something you can put on a resume.

### Step B3 — Create the environment file
**What you're doing:** giving your app its secrets via **environment variables** — named values a program reads from its surroundings at runtime rather than from its code. This is *the* standard pattern for configuration, and it exists to solve exactly one problem: code gets shared (git, GitHub, screenshots), secrets must not. By keeping secrets in a file the app reads but git ignores, the code can say "use whatever `ANTHROPIC_API_KEY` is" without ever containing the key. It also means dev and production can differ: locally the values come from this file; on Vercel (B7) the *same names* get their values from Vercel's dashboard instead — same code, different surroundings.
**Where:** project root. The file must be named exactly `.env.local` — the leading dot makes it a hidden file (invisible to plain `ls` and to Finder by default; `ls -a` shows hidden files in the terminal, `Cmd+Shift+.` toggles them in Finder). Next.js automatically loads this filename; the default `.gitignore` already contains `.env*`, which is what keeps it out of git — verify that line exists (`cat .gitignore` and look) before pasting anything sensitive.
**How to create it** (the generator does *not* make this file — it holds your personal secrets, so that's on you). Terminal-native way, from inside the project folder:
```
touch .env.local
open -e .env.local
```
`touch` creates an empty file with exactly the name you give it — no GUI app second-guessing the leading dot. `open -e` opens it in TextEdit for pasting. (Avoid *creating* it via TextEdit/Finder directly: GUI editors often refuse dot-prefixed names or silently append `.txt`, producing `env.local` or `.env.local.txt`, which Next.js will ignore.) Paste the six lines below, substitute your real values from the A5 note, save, close. Confirm it worked: `cat .env.local` should print your lines back, and `ls -a` should show the file. (Mind that `cat` prints secrets to the screen — fine at home, not during screen shares.)
```
NEXT_PUBLIC_SUPABASE_URL=your_project_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
DATABASE_URL=your_connection_string_here
ANTHROPIC_API_KEY=sk-ant-your_key_here
RESEND_API_KEY=re_your_key_here
CRON_SECRET=any_long_random_string_you_invent
```
**Line-by-line (paste your A5 values in place of the placeholders; format is `NAME=value`, no spaces around `=`, no quotes):**
- The `NEXT_PUBLIC_` prefix is a Next.js convention with teeth: variables so named are **compiled into the browser-visible code** — so only put values there that are *designed* to be public. The Supabase URL and anon key qualify (the anon key is the deliberately low-privilege one from A5, kept honest by Row-Level Security).
- Everything *without* the prefix stays **server-only** — `DATABASE_URL` (full database credentials), the Anthropic and Resend keys (they spend money), and `CRON_SECRET`. If browser code ever tries to read these, it gets nothing — the prefix rule is the guardrail.
- `CRON_SECRET` isn't from any dashboard — **you invent it**: a long random string (30+ characters, mash the keyboard or use a password generator). Its job: the reminder endpoint (Day 9) must be callable by Vercel's scheduler but not by random internet strangers, so the scheduler will present this secret and the endpoint will check it. Any unguessable string works.

### Step B4 — Write the CLAUDE.md
**What you're doing:** writing the project constitution from §1.3 — the file Claude Code automatically reads at the start of every session. Everything in it is something you'd otherwise have to repeat in every conversation; writing it once here means every future session starts already knowing the stack, the directory layout, the phasing rules, and the non-negotiables. Notice what the content actually is: it's a compression of the spec docs — the core principle, the release phasing, and the rules are lifted straight from doc 02. That's deliberate: CLAUDE.md is the *always-loaded summary*; the full docs are what you point Claude at when a task needs the detail.
**Where:** project root (same level as `package.json`). Create and open it:
```
touch CLAUDE.md
open -e CLAUDE.md
```
Paste the block below, save, close. While you're at it, create the `.claudeignore` from D2 the same way — `touch .claudeignore && open -e .claudeignore` — and give it two lines for now:
```
.env*
node_modules/
```
(`node_modules` is auto-skipped anyway, but the `.env*` line is the one that matters: it makes your secrets unreadable even to Claude Code sessions running *inside* the project boundary.)

Now the `CLAUDE.md` content:
```markdown
# Aftercast
A web app (installable PWA) to log real-life predictions with a probability +
resolution date, resolve them when the date arrives, and score calibration over
time. Core principle: **the LLM narrates, deterministic code grades.** AI works
only on the user's own data (semantic track-record matching, reasoning-vs-outcome
post-mortems, monthly pattern insights). The AI NEVER computes a score.

## Stack
Next.js (App Router, TypeScript) · Tailwind · Supabase (Postgres + Auth + RLS +
pgvector) · Drizzle ORM · Anthropic API (Haiku 4.5, structured output; streamed
where user-facing) · Vercel (+ Cron) · Resend · Recharts

## Data-flow idiom (deliberate, current App Router style)
- Server Components for reads (dashboard, insights) via Drizzle directly
- Server Actions for mutations (create prediction, resolve)
- Route handlers ONLY for cron/webhooks and the streaming post-mortem endpoint

## Key directories
- src/app/           routes (UI + route handlers)
- src/lib/scoring/   pure scoring functions (Brier, buckets, ECE, rolling) — FULLY TESTED
- src/lib/ai/        Anthropic calls, JSON schemas, validate-and-repair
- src/db/            Drizzle schema + migrations

## Release phasing (do not build ahead)
- v1: Brier layer only (per-prediction, running, rolling + progress chart),
  calibration curve with sample-size lock, track-record panel, post-mortem
- v2: Murphy decomposition (decompose(), identity test, Boldness), Wilson
  intervals, monthly AI insight w/ hedger-vs-miscalibrated profile

## Rules
- Scoring is deterministic and unit-tested. NEVER route scoring through the LLM.
- Every LLM call uses structured output and is logged to the ai_calls table
  (tokens, cost, latency). Per-user daily cap enforced in code.
- The post-mortem is a diff engine, not a therapist: every claim must anchor to
  text the user wrote. No motive speculation.
- Resolution criteria and reasoning FREEZE at creation. Never editable after.
- Privacy: RLS on all user tables; prediction content never in URLs or logs;
  API keys server-side only.
- Write tests for scoring logic and server actions. Run `npm test` before
  declaring any task done. Show evidence (test output), don't claim success.
```

### Step B5 — Create the two subagents
**What you're doing:** defining the two specialist reviewers from §1.3 as files. Anatomy of a subagent file, since you're about to write two: the part between the `---` lines is **frontmatter** — machine-readable settings (the agent's `name`, a `description` Claude uses to decide when this specialist is relevant, `tools` it's *allowed* to use — note both agents get read/search/run tools but **not** file-editing tools, because a reviewer that can rewrite the code it's judging isn't a reviewer — and `model`, pinned to Opus because review quality is worth the premium). Everything *below* the frontmatter is the agent's instructions — its personality and marching orders, written like a job description. The adversarial phrasing ("try to REFUTE", "do not assume the code is correct") is deliberate: an agent told to *verify* tends to confirm; an agent told to *refute* actually hunts.
**Where:** create the folder and both files from the project root, then open each for pasting:
```
mkdir -p .claude/agents
touch .claude/agents/scoring-verifier.md .claude/agents/security-reviewer.md
open -e .claude/agents/scoring-verifier.md
```
(`mkdir -p` makes the folder — leading dot, same hidden convention as `.env.local`; `-p` creates the parent `.claude/` too. `touch` with two paths creates both empty files in one command. Open the first, paste its block below, save; then `open -e .claude/agents/security-reviewer.md` and paste the second.)

`.claude/agents/scoring-verifier.md`:
```markdown
---
name: scoring-verifier
description: Independently verifies correctness of scoring/calibration code
tools: Read, Grep, Bash
model: opus
---
You are a meticulous numerical-methods reviewer. Given the scoring module and its
tests, try to REFUTE correctness: Brier edge cases (0/1 outcomes, voids, empty
sets), bucket boundaries, ECE weighting, rolling-window edges; in v2, the Murphy
identity (brier ≈ uncertainty − resolution + reliability) and Wilson non-collapse
on tiny samples (3-of-3 must NOT yield [1.0, 1.0]). Run the tests. Report concrete
failures with line references. Do not assume the code is correct.
```

`.claude/agents/security-reviewer.md`:
```markdown
---
name: security-reviewer
description: Reviews auth, server actions, and cron endpoints for security issues
tools: Read, Grep, Glob, Bash
model: opus
---
You are a senior security engineer. Review for: broken row-level security / IDOR
(can one user read another's predictions, including via the pgvector similarity
search?), secrets in code or client bundles, unprotected cron routes, prediction
content leaking into URLs or logs, API keys reachable client-side, and server
actions missing auth checks. Give specific line references and fixes.
```

### Step B6 — First Claude Code session: build the skeleton
**First, put the spec docs inside the project** — the build prompts in Part C tell Claude to "read section 8 of docs/02-application-rundown.md", which only works if the docs physically live there:
```
mkdir docs
mv ~/Downloads/01-domain-primer.md ~/Downloads/02-application-rundown.md ~/Downloads/03-building-with-claude.md docs/
```
(`mv` = move; adjust the source paths to wherever you saved the three documents — `ls ~/Downloads/*.md` will show you what's actually there. Verify with `ls docs/`: all three should list.)

**Where:** terminal, project root. Type `claude`, then **Shift+Tab** to enter plan mode, then paste:

> Read CLAUDE.md first. Set up the project skeleton — no features yet:
> 1. Install and configure Drizzle ORM for Postgres using DATABASE_URL from env.
> 2. Create the schema in src/db/schema.ts per the data model I'll describe:
>    tables `predictions` (id uuid pk, user_id uuid, text, reasoning nullable,
>    plan_or_disconfirm nullable, prediction_kind 'self'|'world', confidence
>    numeric, resolution_date date, category text nullable, reasoning_type text
>    nullable, embedding vector(1536) nullable, status 'open'|'resolved'|'void',
>    outcome boolean nullable, outcome_note text nullable, brier_score numeric
>    nullable, postmortem text nullable, created_at, resolved_at nullable);
>    `ai_calls` (id, user_id, prediction_id nullable, purpose, model,
>    input_tokens, output_tokens, cost_usd, latency_ms, created_at);
>    `insights` (id, user_id, period, body_text, stats_json, created_at);
>    `base_rates` (kind pk, rate, description); `user_stats` (user_id pk,
>    n_resolved, running_brier, updated_at).
> 3. Enable the pgvector extension in the migration.
> 4. Generate and run the migration against my Supabase database.
> 5. Set up Supabase Auth with magic-link: login page at /login, auth callback,
>    middleware protecting /dashboard, and an empty /dashboard page that shows
>    the logged-in user's email and a sign-out button.
> 6. Add a PWA manifest and minimal service worker.
> 7. Set up Vitest and add one trivial passing test to prove the harness works.
> Propose the full plan first; wait for my approval before writing anything.

**What that prompt is doing, piece by piece:** it opens with "Read CLAUDE.md first" (the context anchor from D6 — never assume Claude knows what you know); items 1–4 stand up the **database layer** (Drizzle is the ORM — the typed bridge between TypeScript and Postgres; a **migration** is a generated script that transforms the database's structure to match your schema definition — schemas change via migrations, never by hand-editing the database; **pgvector** is the Postgres extension adding the `vector` column type your embeddings need); item 5 stands up **auth** (magic-link = passwordless login via emailed link; **middleware** is code that runs before every request and is what bounces logged-out visitors from /dashboard); items 6–7 are the PWA shell and the **test harness** (Vitest is the test runner; the one trivial test exists purely to prove `npm test` works before Day 2 depends on it); and the closing line forces plan mode's contract explicitly.

**What you'll actually see, in order:** Claude reads files silently, then prints a numbered plan. **Read it against the checklist** (right five tables? magic-link, not password auth? Vitest present?) — approving a plan you didn't read is skipping your only cheap veto point. After you approve, it starts executing and will pause to ask permission for consequential actions — `npm install <packages>` (adding dependencies), running the migration (touching your real Supabase database), file writes. Each pause shows exactly what it wants to run; this is the permission system from D2 working as designed. The whole session typically takes 20–40 minutes with a few check-ins. If something fails mid-run (a wrong connection string is the classic), paste the error verbatim and let it debug — that's D6's evidence rule in action.

**Verify at the end (do all four — this is your first "evidence, not assertion" moment, applied to Claude's own work):** (1) `npm run dev` → visit `http://localhost:3000/login` → enter your email → click the emailed link → land on `/dashboard` seeing your email. (2) `npm test` passes. (3) Supabase dashboard → **Table Editor** shows your five tables. (4) Sign out works.
*(If the magic-link email doesn't arrive: Supabase dashboard → Authentication → URL Configuration → ensure Site URL is `http://localhost:3000`. Also check spam.)*

### Step B7 — Deploy to Vercel
**What you're doing:** putting the app on the public internet, and wiring the pipeline so it *stays* current automatically. Vercel's model: it watches your GitHub repo; every push to `main` triggers a fresh build and deploy. You configure this once, by pointing Vercel at the repo.
**Where:** vercel.com → **Add New → Project** → it lists your GitHub repos (that's the sign-up-with-GitHub link from A4 paying off) → **Import** `decision_calibrator` → before clicking Deploy, expand **Environment Variables** and add every line from your `.env.local` — same names, same values, one by one. **Why re-enter them:** `.env.local` never left your machine (git ignores it, by design — that was the whole point of B3), so Vercel's servers have no idea what your secrets are. This dashboard is the production counterpart of that file: same variable *names*, values now supplied by Vercel's environment instead of a local file. Your code doesn't know or care which one it's running against. Then **Deploy**.
**Expect:** a ~2-minute build log scrolls by (Vercel is running the same build your machine would), ending in a live URL like `decision-calibrator-xyz.vercel.app`.
**Then two fixes:** (1) Supabase → Authentication → URL Configuration → add the Vercel URL to Site URL / Redirect URLs — magic-link emails contain a link *back to your app*, and Supabase will only build links to addresses on this allowlist; without this, production login links point at localhost and fail. (2) Test the real thing: visit the live URL, sign up, reach the dashboard.
**From now on, `git push` = automatic deploy.** That's the whole pipeline — no deploy scripts, no servers to manage.

### Step B8 — Commit and gate
**What you're doing:** saving the day's work as a git snapshot and pushing it (which, per B7, also deploys it) — then checking the Day 1 gate before allowing yourself to move on.
```
git add -A && git commit -m "Day 1: skeleton — schema, auth, PWA, deploy" && git push
```
**Command breakdown:** git commits are a two-step: first you *stage* what the snapshot should include, then you *commit* the staged set. `git add -A` stages everything — all new, modified, and deleted files (`-A` = all). `git commit -m "..."` takes the snapshot; `-m` supplies the message inline (without it, git opens a text editor, which ambushes beginners). Write messages a stranger could skim: what changed, not "stuff". `git push` uploads to GitHub (no arguments needed — B2's `-u` remembered the destination) — and thereby triggers the Vercel deploy. The `&&` chaining means each command runs only if the previous succeeded, so a failed commit can't silently push nothing.
**Day 1 gate (all must be true):** live URL works → sign-up → magic link → authenticated dashboard; five tables visible in Supabase; `npm test` green; CLAUDE.md + subagents committed (check: they're visible in the GitHub repo). If anything fails, fix it *before* Day 2 — features built on a broken skeleton compound the pain.

---

## Part C — The build rhythm (Days 2–14)

You now repeat one loop per feature, per the Day plan in doc 02 (§14). The pattern, using Day 2–3 as the worked example:

### The scoring engine — your first real feature (do this one test-first)
Open `claude`, switch models with `/model opus` (this is the math — the routing table from §1.4 in action), enter plan mode, paste:

> Read CLAUDE.md and the scoring spec in section 8 of docs/02-application-rundown.md
> (v1 functions only — do NOT build Murphy or Wilson yet; they're v2).
> Test-first: FIRST write the Vitest suite for src/lib/scoring/ covering:
> brierScore(0.9, 1) = 0.01; brierScore(0.9, 0) = 0.81; brierScore(0.5, either) = 0.25;
> runningBrier over [0.01, 0.36, 0.04] ≈ 0.1367; voids excluded everywhere;
> empty input → null; rollingBrier window=20 with fewer than 20 resolutions;
> calibrationBuckets decile boundaries (confidence exactly 0.70 lands in one
> bucket, deterministically); ECE weighting; single-prediction edge cases.
> Show me the failing test run. THEN implement pure functions in
> src/lib/scoring/index.ts until green. No database, no React — pure logic only.
> Show me the passing run.

**Why this prompt is shaped this way:** "test-first" means the tests get written *before* the implementation and shown failing — this matters doubly with an AI implementer, because the expected values in the prompt (0.01, 0.81, 0.25 — lifted straight from the worked table in doc 01 §3.1) come from *you and the math*, not from whatever the code happens to output; the tests are the spec, and Claude's job is to satisfy them, not to grade its own homework. "Show me the failing run" proves the tests actually run and actually assert something; "show me the passing run" is the D6 evidence demand. "No database, no React — pure logic only" is a scope constraint (D6 again): scoring functions that take arrays and return numbers are trivially testable; the moment a database creeps in, they aren't.

Then run the verifier: `/agents` → invoke **scoring-verifier** → it attacks the module and reports (this is the writer-isn't-the-grader principle from §1.5 — Opus reviewing code in a fresh context, briefed to refute). Fix anything real. Commit.

### The loop for every subsequent day
1. `cd /Users/Shiv/Desktop/projects/decision_calibrator` → `claude` → `/clear` (fresh context) → plan mode → paste the day's goal, always starting with *"Read CLAUDE.md and [relevant doc section]"* and always ending with *"propose a plan first."* (Launching from inside the project folder isn't just convenience — the working directory is Claude Code's permission boundary; launched here, it can touch this project and nothing else.)
2. Review plan → approve → let it execute → demand the evidence (test run, or click through the feature yourself on localhost).
3. For days touching auth/data (5, 7–8, 9): invoke **security-reviewer** before committing.
4. Commit, push (auto-deploys), `/clear`.

**Day-by-day prompts in one line each** (expand with the matching doc-02 section):
- **D4–5 capture:** "Build the capture flow per §4.5 and §7 of the doc: Server Action, form with static examples, confidence slider, date, optional reasoning fields with self/world branch, save-then-background-enrich (Haiku structured output + embedding), ai_calls logging, per-user daily cap."
- **D6 track record:** "Build the track-record panel per §9.2: debounced draft embedding, pgvector cosine similarity over the user's own resolved rows (RLS-safe), ≥3-match threshold, hit-rate computed in SQL, templated phrasing, static base-rate fallback."
- **D7–8 resolve+dashboard:** "Build resolve per §4.6: Server Action, instant deterministic Brier, then the post-mortem streamed token-by-token (route handler streaming the Anthropic response), diff-engine system prompt, store completed text. Dashboard: stats header, due-for-resolution list, open list."
- **D9 reminders:** "Vercel Cron daily route, guarded by CRON_SECRET, finds predictions due today, sends via Resend."
- **D10–11 insights:** "Calibration curve (Recharts) with diagonal + sample-size lock, rolling-Brier progress chart with needs-more-data state, category and reasoning-type breakdowns, templated monthly summary."
- **D12 polish:** "Landing page per §4.1, two-screen onboarding, empty states, mobile pass, PWA install prompt."
- **D13–14 hardening:** "Error handling pass, cost dashboard off ai_calls, README per §17, seed a demo account with ~35 resolved predictions so the curve renders." Then `/security-review` across the app, fix, final deploy.

### When something breaks (it will)
Paste the *actual error* — full text, plus what you expected — and let Claude investigate; don't pre-diagnose. If it flails after two attempts: `/clear`, restate the problem fresh with the error and the file path (long confused contexts produce worse debugging than clean restarts). Nuclear option: `git checkout .` reverts everything uncommitted — which is why you commit small and often.

### After v1 ships — the v2 release
Same rhythm, new features: Murphy `decompose()` + identity test + Boldness gauge, Wilson bars on the curve, windowed Murphy, the hedger/miscalibrated profile feeding the monthly AI insight. The scoring-verifier subagent already knows to check the identity and the 3-of-3 case — that's why its brief mentions them. Ship v1 publicly *before* starting v2; a live product with a release cadence beats a bigger unreleased one.

---

## Part D — Critical general knowledge for building with Claude Code

*Everything here applies to any project, not just Aftercast. These are the fundamentals that separate people who fight the tool from people it multiplies. Explained from zero.*

### D1 — The context window: the one resource that governs everything

Claude has a working memory called the **context window** — everything it can "see" right now: your instructions, file contents it has read, command outputs, its own prior responses. Two facts about it explain most confusing behavior:

1. **It's finite.** A long session fills it up. When it's nearly full, Claude Code automatically "compacts" — summarizes the history to free space. Summaries lose detail; the model is measurably worse right after living off a summary of what it used to know directly.
2. **Everything in it competes for attention.** Irrelevant stuff doesn't just waste space — it actively degrades focus. A session cluttered with an abandoned debugging tangent produces worse code on the next task.

Practical consequences — the three habits that matter most in the entire document:
- **`/clear` between unrelated tasks.** New feature = fresh context. It feels wasteful ("Claude forgets everything!") but CLAUDE.md reloads automatically, and a clean start beats a polluted memory every time.
- **`/compact` deliberately** at a natural pause (e.g., after a feature lands, before polish begins) rather than letting auto-compaction fire mid-task at the worst moment. You can steer it: `/compact keep the schema decisions and the failing test details`.
- **Don't paste huge things when a path will do.** "Read src/lib/scoring/index.ts" lets Claude pull what it needs; pasting 500 lines forces everything in.

`/context` shows what's currently loaded and how full you are. Check it when a session starts feeling dumb — the answer is usually there.

### D2 — The permission system: what Claude can do without asking

By default Claude Code can **read** anything in the project folder freely, but asks before **writing** files or **running** commands. Each ask offers roughly: *yes once*, *always allow this specific action*, or *no, and tell it what to do instead*. Over the first day you'll teach it a sensible profile: standing yes for `npm test`, file edits inside `src/`, `git add/commit`; keep gates on `git push`, deletions, installs, and anything touching `.env`.

Two things to know beyond the basics:
- **Settings live in files you can read:** project permissions in `.claude/settings.json` (commit this — it's the team profile) and `.claude/settings.local.json` (personal, gitignored). If Claude seems weirdly free or weirdly nagging, look there.
- **There is a bypass mode (`--dangerously-skip-permissions`).** People online recommend it ("yolo mode") because approvals feel slow. Don't, on a machine you care about — the whole safety model is that mistaken commands need your eyes. The correct speed fix is granting *specific* standing permissions, not removing the system.

Related non-negotiable: Claude Code respects `.gitignore` but add a **`.claudeignore`** for big or sensitive things it shouldn't even read into context (build output, `node_modules` is auto-skipped, data dumps, anything with secrets).

### D3 — Steering mid-flight: you're a participant, not an audience

New users watch Claude go down a wrong path for five minutes because interrupting feels rude. It's a tool; interrupt it.

- **Escape** stops the current action immediately. Claude halts and waits — nothing breaks, no state corrupts.
- **Double-Escape** opens the message history — you can rewind to an earlier point in the conversation and take a different fork, which beats arguing with a bad trajectory.
- **Course-correct in plain words:** "stop — wrong file, the schema is in src/db/schema.ts" or "simpler, no new dependency." Short and immediate beats detailed and late.
- If it's fundamentally confused, don't negotiate: Escape, `/clear`, restate the task better. A fresh, better prompt outperforms ten corrections stacked on a bad start.

### D4 — Sessions: nothing is lost when the terminal closes

Claude Code persists conversations locally. `claude --continue` (or `-c`) resumes the most recent session in that folder; `claude --resume` shows a picker of past sessions. Closing your laptop mid-feature is fine — resume tomorrow with the full context intact. Caveat: a resumed context is still a *long* context (see D1) — resuming to finish a task is great; resuming a week-old session to start a new task is how you inherit a polluted memory. New work still deserves a fresh session.

### D5 — Git is your undo button — commit like it

Claude Code has no undo. Git is the undo. This changes how often you commit compared to solo habits:

- **Commit every working increment,** even tiny ones. The rhythm is: task works → commit → next task. A commit is a save point; Claude can then experiment freely because `git checkout .` (discard all uncommitted changes) restores the last save.
- **Read the diff before committing** (`git diff`, or ask Claude to summarize its own changes and *then* skim the real diff — trust but verify). This is the single highest-value review habit: it catches the file it touched that it shouldn't have.
- Claude is genuinely good at git itself — "commit this with a sensible message," "what changed since yesterday?", "revert the last commit" are all fair delegations. Keep `git push` behind a permission gate so nothing leaves your machine without your eyes.
- For risky experiments, ask for a branch first: "create a branch, try the refactor there." Cheap insurance.

### D6 — Prompting fundamentals: the difference between meh and excellent output

The model responds to specificity the way a contractor does. The four elements of a strong task prompt:

1. **Context anchor:** where to look — "Read CLAUDE.md and src/lib/scoring/ first." Never assume it knows what you know.
2. **Concrete goal with acceptance criteria:** not "improve the dashboard" but "the dashboard should show running Brier, count resolved, and a due-today list; empty states for all three."
3. **Constraints:** "no new dependencies," "pure functions only, no DB," "don't touch the schema." Constraints prevent the most common failure — solving the problem correctly at the wrong scope.
4. **Verification demand:** "run the tests and show me the output," "then walk me through what you changed and why."

Two general techniques that pay constantly: **make it plan before it acts** for anything non-trivial (plan mode, or literally "propose your approach first, don't write code yet") — the plan surfaces misunderstandings while they're cheap; and **paste errors verbatim** — the full stack trace, not your summary of it. Your interpretation of an error is a hypothesis; the raw text is evidence, and Claude debugs evidence better.

Also useful: Claude Code accepts **images** — paste a screenshot of broken UI or a design mock directly into the prompt (drag into the terminal or Ctrl+V). "Make it look like this" with a picture beats paragraphs of description.

### D7 — The failure modes, so you recognize them early

Claude Code fails in patterns. Knowing them turns mysteries into routine fixes:

- **Confident wrongness.** It states falsehoods with the same tone as truths — an API that doesn't exist, a config key that's misspelled. Antidote: evidence over assertion, always. "Show me the passing run" catches what "done!" hides.
- **Scope creep.** Asked to fix a bug, it also "improves" three adjacent things. Sometimes nice; in a tight codebase, a diff-polluter. Antidote: constraint in the prompt ("fix only X, touch nothing else") + reading the diff.
- **The apology loop.** When stuck, it can cycle: attempt → fail → apologize → nearly identical attempt. Two failed attempts is your signal to stop the loop: Escape, `/clear`, restate with fresh framing or new information (the actual error text, the relevant doc). More attempts in the same context rarely converge.
- **Stale context.** After big manual edits or a git operation Claude didn't perform, its mental model of files may be outdated, and it will edit based on the old picture. Antidote: tell it — "I changed the schema manually, re-read src/db/schema.ts before continuing."
- **Test-gaming.** Told "make the tests pass," it will occasionally take the letter over the spirit — weakening an assertion or special-casing the test input. This is why the scoring-verifier subagent exists, and why *you* read diffs on anything that guards correctness.
- **Deletion without malice.** It can overwrite or remove code it deems obsolete. Usually it's right; the commit-often habit (D5) is what makes "usually" acceptable.

### D8 — Cost and model discipline

- `/usage` shows where you stand against the 5-hour window and weekly cap; glance at it at session start until you have a feel. Running dry mid-day means waiting for the window to roll — plan heavy Opus work accordingly.
- The cost drivers, in order: model choice (Opus is many times Sonnet's cost per token), context size (everything loaded is re-sent every turn — another reason D1's hygiene is also budget hygiene), and session length. The routing table in §1.4 is a *budget* instrument as much as a quality one.
- Long autonomous stretches multiply everything: an unattended agent burning tokens down a wrong path is the expensive version of D3's lesson. Check in on long tasks.

### D9 — Trust calibration: what to delegate vs. what to own

The meta-skill, and fittingly for this project, it's a calibration problem. A sane starting allocation:

**Delegate freely:** boilerplate, wiring, CRUD, styling, test *writing* (you specify the cases), refactors with test coverage, git mechanics, error investigation, doc lookup.
**Supervise (plan mode + diff reading):** schema changes, auth flows, anything touching money or data deletion, dependency additions, cross-file refactors.
**Own outright:** architecture decisions, the acceptance criteria themselves, what "correct" means for the core logic, security posture, and the final read of any diff that guards correctness.

The trap to avoid isn't over-trusting — it's *static* trust. Update it like a calibration curve: when Claude nails five schema migrations in a row, loosen; the first time it games a test, tighten there specifically. You are, in effect, keeping a track record on your tool — which, given what you're building, should feel familiar.

---

## The one-paragraph version

Install Node, git, and Claude Code; create the five accounts; collect the secrets. Bootstrap Next.js + Tailwind, push to GitHub, write the CLAUDE.md and two subagents, run one plan-mode session to stand up schema + auth + PWA + tests, deploy to Vercel — that's Day 1, ending with a live authenticated skeleton. Then one loop per day: fresh context → plan mode with the day's goal referencing the spec → review the plan → execute → demand test evidence → subagent review where it counts → commit, auto-deploy. Opus for math and reviews, Sonnet for the rest. Fourteen loops later you have a shipped v1 and a scoring-verifier already briefed for v2.
