// Shared pitch copy. `STEPS` is the compact three-step summary used on the
// landing page. `HOW_IT_WORKS` is the full, structured copy for the standalone
// /how-it-works explainer — kept here as data (not inline JSX) so it lives in one
// place AND can be unit-tested for jargon (see howItWorks.test.ts). Emphasis is
// written with **double-asterisk** markers, which the page renders as bold.

export const STEPS = [
  {
    title: "1. Predict",
    body: "Write down what you think will happen, in your own words, with a confidence level from 1–99%.",
  },
  {
    title: "2. Resolve",
    body: "When the outcome lands, come back and mark it yes or no. Your original reasoning stays frozen — no rewriting history.",
  },
  {
    title: "3. Recalibrate",
    body: "After a handful of resolutions, Ivyra scores your calibration — plotting your stated confidence against what actually happened — so you can see where you lean over- or under-confident and know when to trust your own confidence next time.",
  },
];

export interface Why {
  question: string;
  answer: string;
}

export interface Section {
  eyebrow: string;
  title: string;
  paragraphs: string[];
  why?: Why;
}

export const HOW_IT_WORKS = {
  hero: {
    headline: "Does your confidence match reality?",
    sub: "You make judgment calls every day — this will ship on time, that hire will work out, I'll stick with the gym this year. Ivyra checks those calls against what actually happens, so you learn where your confidence is trustworthy — and where it runs ahead of the facts. No math required from you.",
  },

  metaDescription:
    "What calibration is, in plain language: whether your confidence matches reality, how Ivyra measures it, and why the math grades you while AI only explains.",

  problem: {
    eyebrow: "The problem",
    title: "We're bad at knowing how much we know",
    paragraphs: [
      'Think of the last time you were **sure** — "I\'m 90% certain we\'ll close this by Friday." Now think about how often that kind of "90% certain" actually pans out. For most of us, honestly, it\'s a lot less than 90% of the time.',
      'That gap stays invisible for one reason: we don\'t keep track. After the fact, memory quietly rewrites itself — "I always knew that was a stretch" — and the lesson evaporates. The only fix is almost embarrassingly simple: **write the prediction down, with a number, before you know the answer.** That\'s the whole mechanic here.',
    ],
    why: {
      question: "Is this just me, or is everyone like this?",
      answer:
        "It's remarkably universal — decades of research find that people are systematically overconfident, and it barely tracks with intelligence or expertise. The good news buried in that research: it's a **trainable skill**, not a fixed trait. Weather forecasters, who get scored feedback every single day, end up among the best-calibrated people on earth. Ivyra gives you that same kind of feedback.",
    },
  } satisfies Section,

  keyIdea: {
    eyebrow: "The core idea",
    title: "A probability is a claim about many cases, not one event",
    paragraphs: [
      'This is the one idea everything else rests on, and most people have never had it spelled out. Picture a weather forecaster who says **"70% chance of rain."** What would make that a good forecast?',
      'Not whether it rains today. A "70% chance" isn\'t a promise that it will rain — it\'s a claim that **on days like this, it rains about 7 times out of 10.** So she\'s exactly right if, across all the days she says "70%," it rains on about 70% of them. The dry days aren\'t her being wrong — they\'re her forecast **coming true.** Three days in ten, it was supposed to stay dry.',
      'So no single prediction can be "calibrated" or not — only a whole track record can. That\'s why Ivyra needs a little history before it can tell you much, and why it gets sharper the longer you use it.',
    ],
    why: {
      question: "Then how can a single prediction be scored at all?",
      answer:
        'A single prediction still gets an exact score for how close it landed to reality — that\'s the next section. What it **can\'t** tell you is whether your "70%" really means 70%. That only shows up once you\'ve made many of them and we can check: of all your "70%" calls, how often did they come true?',
    },
  } satisfies Section,

  loop: {
    eyebrow: "The loop",
    title: "Four steps, repeated",
    steps: [
      {
        step: "1",
        title: "Predict",
        body: "Write what you think will happen, in your own words. Add a confidence — say, 75% — and the date you'll know.",
      },
      {
        step: "2",
        title: "Resolve",
        body: "When that date arrives, we nudge you. You mark what actually happened: yes or no. Your reasoning stays frozen — no rewriting history.",
      },
      {
        step: "3",
        title: "Score",
        body: "Fixed math — never a guess, never AI — turns that prediction and outcome into an exact number for how close your confidence landed to what happened.",
      },
      {
        step: "4",
        title: "Adjust",
        body: "Do it enough times and the pattern surfaces: where your stated confidence matches how often things actually happen, and where it runs ahead of them. Then you recalibrate.",
      },
    ],
  },

  score: {
    eyebrow: "Your score",
    title: "How close your confidence lands",
    paragraphs: [
      "When a prediction resolves, we measure one thing: **how far your confidence was from what happened.** Say 90% and it happens — you were barely off. Say 90% and it doesn't — you were badly off. Average that across all your predictions and you get your score.",
      '**Lower is better**, like golf. A score of **0.25** is the "I\'m just guessing" line — exactly what you\'d get by shrugging "50/50" at everything. Beat it, and your confidence is carrying real information about the world.',
    ],
  } satisfies Section,

  bias: {
    eyebrow: "Your bias",
    title: "Which way you lean",
    paragraphs: [
      "Your score says how good your calls are. Your **bias** says which direction they're off — the gap between how confident you felt and how often you were actually right.",
      '"You run **19 points overconfident**" means that, on average, reality came in about 19 percentage points below your stated confidence. The opposite reading means you were too cautious, and things happened more often than you claimed.',
    ],
  } satisfies Section,

  curve: {
    eyebrow: "Your curve",
    title: "The whole picture in one chart",
    paragraphs: [
      "The calibration curve puts your confidence along the bottom and how often things actually happened up the side. If you're spot-on, every dot lands on the diagonal — your 70%s happen about 70% of the time.",
      "**Dots below the line mean overconfident:** things happened less often than you claimed. Above the line means underconfident — you knew more than you let on. Flip between the shapes below to see it.",
    ],
  } satisfies Section,

  boldness: {
    eyebrow: "Your boldness",
    title: "Being honest isn't enough — you also have to say something",
    paragraphs: [
      "Here's the part almost everyone misses. There are **two separate ways your confidence can fail**, and most people only know the first.",
      "**One: your numbers can be dishonest.** You say 90% and things happen 60% of the time. That's the overconfidence we've been talking about, and the curve catches it.",
      '**Two: your numbers can be empty.** Imagine answering "60%" to everything. You\'re never badly wrong — but you\'re never really saying anything either. You\'ve made yourself safe and useless.',
      "**Boldness** measures whether your confidence levels actually **tell your outcomes apart.** Do the things you call 80% really happen more often than the things you call 55%? If they do, your numbers carry information. If everything you say clusters near 50%, they don't — however honest each one looks on its own.",
      "Confidence that's **honest and decisive at the same time** moves to high and low values as the evidence earns it, and those values match how often things actually happen. Confidence that stays hedged near the middle is safe but says nothing — a hedger's 80% calls land no more often than their 55% ones.",
    ],
  } satisfies Section,

  verdictInsight: {
    eyebrow: "Reading your results",
    title: "The verdict and the insight",
    paragraphs: [
      "Your insights page gives you two different things, and it's worth knowing which is which.",
      '**The verdict** is the one-line summary at the top — "you lean overconfident," "calibrated and bold." It only ever **describes what\'s true** about your track record. Fixed math produces it; it states a fact and stops there.',
      "**The insight** goes further: it **explains why, and what to do differently.** This is the one place AI helps — it reads your own predictions and the words you wrote, names the pattern behind the numbers, and points to where you can adjust. It never touches your score.",
    ],
  } satisfies Section,

  scope: {
    eyebrow: "Recent vs. lifetime",
    title: "Zoom in on how you're doing lately",
    paragraphs: [
      'You can look at your **whole history** or just your **recent** calls — and the two can honestly disagree. Your lifetime read might say "overconfident" while your last stretch says "calibrated," because you\'ve been getting better.',
      'That\'s the point, not a glitch: recent form shows whether the training is working, while lifetime shows the deeper habit. Neither one is the "real" number — they answer different questions.',
    ],
  } satisfies Section,

  unlocks: {
    eyebrow: "Honest expectations",
    title: "Why some things show up later",
    intro:
      'Because calibration is about patterns, the richer read-outs need a bit of data before they mean anything. A curve built from eight predictions is noise — the same way a coin isn\'t "biased" for landing heads three times out of four. So Ivyra waits until a number actually means something, rather than guessing early. You get an exact score on your very first resolution; the bigger pictures arrive as you go:',
    items: [
      {
        n: "~10",
        title: "Your bias score",
        body: 'The first real read: a single number like "you run 12 points overconfident," telling you which way your judgment leans and by how much.',
      },
      {
        n: "~25",
        title: "Your progress chart",
        body: "Your score over time, so you can watch whether the training is working — your recent calls against your lifetime average.",
      },
      {
        n: "~30",
        title: "Your calibration curve and boldness",
        body: "The full picture: your confidence against reality across every level. These need the most data, because a curve from a handful of predictions is just noise.",
      },
    ],
    footnote:
      "Until each one unlocks, we show you exactly how many resolutions are left — never a blank, never a misleading half-picture.",
  },

  trust: {
    eyebrow: "What you can trust",
    title: "The math grades you. The AI only explains.",
    paragraphs: [
      "This matters, so we'll say it plainly. **Every score, every curve, every number comes from fixed math** — the same calculation for everyone, that nothing can nudge. You can't make yourself look better by sounding confident, and neither can we.",
      "**AI is used in exactly one way:** to read your own words and data and explain the patterns back to you — name the habit, suggest a fix. It never assigns a score, and it only ever sees your own data. The judgment about how good your calls are is pure arithmetic.",
    ],
  } satisfies Section,

  cta: {
    title: "Make your first prediction",
    body: "The whole loop starts with one call about something you actually care about. It takes about thirty seconds.",
    templatesIntro: "Or start from an example — you can edit it",
  },
};

/** Recursively collect every user-facing string in the copy tree — the material
 *  the jargon test scans. */
function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(collectStrings);
  return [];
}

/** Every string shown on /how-it-works. */
export const ALL_HOW_IT_WORKS_COPY: string[] = collectStrings(HOW_IT_WORKS);

/** Just the boldness explanation — held separately because a few words that are
 *  fine elsewhere on the page (e.g. "resolution" as in "resolution date") must
 *  never appear inside THIS explanation. */
export const BOLDNESS_COPY: string[] = collectStrings(HOW_IT_WORKS.boldness);
