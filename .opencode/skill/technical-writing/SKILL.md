---
name: technical-writing
description: Use when writing or rewriting documentation, READMEs, guides, or explanatory articles. Enforces intent-first structure, a direct and lightly witty voice, consequence-driven explanations, disciplined defaults, and the document-type conventions seen in the Vert.x docs.
---

# Technical Writing

Use this skill whenever creating or editing documentation, guides, READMEs, or explanatory articles in this project.

## Voice

Write to a competent peer. Be direct, precise, and willing to admit trade-offs.

- **Explain, don't sell.** Avoid words like "seamless", "powerful", or "robust" unless you immediately justify them.
- **You can be lightly witty, but only at conceptual hinges.** A witty heading or one dry line is fine when introducing a core idea. Reference sections stay dead straight.
- **Address the reader as "you".** Occasional direct asides ("The eagle-eyed among you might have noticed...") are fine if rare.
- **Name your key concepts and reuse them.** If a rule matters enough, give it a name and refer back to it.
- **Prefer blunt honesty over cheerleading.** Say when something is hard, limited, or not the right tool.

## Core principles

1. **Start with intent.** Every page must first answer why the reader is here and what problem the feature solves.
2. **Motivate before you demonstrate.** Explain why a feature exists before showing the API. Show the problem that makes it necessary.
3. **Progress from idea to specifics.** Concept → simple working example → recommended setup → edge cases and advanced.
4. **State the consequence.** Every rule, warning, or recommendation should include what happens if it is ignored.
5. **Separate simple from advanced.** Show the simplest working usage first, then the production-ready setup, then isolate optional/advanced topics.
6. **Concede costs honestly.** If a model is harder, slower, or limited, say so before the reader discovers it.

## The section opener

Most sections should open with four moves:

1. **One-line definition.** What is this thing?
2. **What it makes easy.** A short bullet list of the main capabilities.
3. **Relationship to neighbors.** If this wraps, replaces, or competes with another component, say so, and when to use each.
4. **Explicit gaps.** State what this thing deliberately does not do.

## Document structure

Prefer this order:

1. **What this is and why use it** — intent, benefit, and boundaries.
2. **The simplest working usage** — minimal setup, minimal code, fully runnable.
3. **The recommended usage** — the production-ready setup the project actually promotes.
4. **Configuration that matters** — only the options that change real behavior. Highlight required/recommended choices. Defer exhaustive reference to API docs.
5. **Advanced / optional** — custom templates, escape hatches, internals. Keep separate and clearly labeled.
6. **Security notes** — one consolidated section per manual, plus inline warnings where the feature is used.

## Explaining a concept

- **Iterative refinement.** When teaching an abstraction, first show a naive solution, name its flaw, improve it, name the new flaw, then reveal the built-in helper that solves it.
- **Decompose then recompose.** Break a multi-step flow into one tiny snippet per step with a single connective sentence, then show the fluent one-liner at the end.
- **Narrate runtime behavior, not just API.** Walk through what happens at runtime: headers sent, prompts shown, redirects followed, errors logged.
- **Anti-pattern, then fix.** Show the wrong way, explain why it fails, then show the right way.
- **Correct the wrong mental model before it forms.** If a default is surprising, say so explicitly.
- **Signpost.** Use sentences like "Let's look at...", "This brings us to...", "Now we can finish..." to carry the reader through long sections.

## Defaults, limits, and numbers

- **Always state the default.** Then show how to change it.
- **Translate defaults into human units.** "`max-age=86400` by default. This corresponds to one day."
- **Quantify instead of adjectivizing.** Prefer "a new thread eats about 1MB of memory" over "threads are expensive".
- **Limits are explicit.** "The client will follow at most 16 redirects."
- **Use real output.** Show actual log lines or exact status codes when it removes ambiguity.

## Code examples

- **Keep them minimal and self-contained.** Each snippet should illustrate exactly one point.
- **Always show both success and failure paths.** `onSuccess` and `onFailure`, or `if (succeeded())` / `else`.
- **Comments explain the non-obvious why, not the what.** Avoid `// increment counter` next to `counter++`. Prefer `// Strings are immutable so no need to copy`.
- **Show results inline when useful.** `// Request uri: /convert?amount=1234&currency=%E2%82%AC`
- **Use numbered callouts for longer examples.** Mark lines `(1)`, `(2)`, `(3)` and explain them below the snippet.
- **Prefer real names over foo/bar.** Use `icanhazdadjoke`, `Marvel API`, `Keycloak`, or `Docker socket` when it improves believability.
- **Provide try-it affordances.** Include the `docker run`, `curl`, or browser URL that lets the reader verify the example.

## Admonitions

Vert.x-style admonitions are short, standalone lines placed immediately after the code they qualify. No icon, no bullet, no box.

Good:

```
Using virtual threads requires Java 21 or above.

the directory must be **writable**.

this is only valid for the response decoded as a buffer.
```

Use them for:

- Version requirements
- Default constraints
- Gotchas that follow from the previous snippet
- Short performance or security caveats

For bigger warnings, use a single bold sentence: "**You have been warned.**"

## Security

- **Inline security guidance with the feature**, not only in a separate section. Include concrete numbers: "set `setBodyLimit` to 10MB for uploads or 100KB for JSON."
- **State the mechanism.** "With basic authentication, credentials are sent unencrypted across the wire, so it's essential that you serve using HTTPS."
- **Add a consolidated "Security notes" section to every manual** covering cross-cutting concerns.

## Scope discipline

- **Say what you are not covering and why.** "We won't list them all here; please consult the API docs."
- **Defer enumeration to API docs.** Do not build a wall of options inside a narrative doc.
- **Tell the reader when a different tool is the right answer.** If a broker, database, or third-party library is the better fit, say so and link to your own integration if you have one.
- **Cross-link instead of duplicating.** Link to dedicated pages for cross-cutting concerns instead of repeating them.

## Troubleshooting and FAQ

Phrase questions as symptoms in the reader's own words. Then follow:

1. **Mechanism** — what is happening under the hood.
2. **Consequence** — "This is why..." or "It means that..."
3. **Remedy** — the fix, with concrete commands or configuration.

Also acceptable: state what is *not* done, then the consequence, then options.

## Document types

### Manual / module doc

1. Section opener (4 moves)
2. Dependency / setup
3. Concepts in dependency order
4. Features with runnable examples
5. Configuration that matters
6. Advanced / internals
7. Security notes
8. Ops / cache / logging appendix if needed

### Get started

1. Prerequisites
2. Bootstrap
3. Code
4. Run
5. Go further / next-step cards

### How-to

1. What you will build (with screenshot or output sample)
2. What you need
3. Create a project (include both main build tools if relevant)
4. Implementation with annotated code
5. Running the application (IDE / CLI / build tool)
6. Summary: "This document covered: 1. ..., 2. ..., 3. ..."
7. See also

### Guide

1. Scope statement
2. "You want to read this guide when you want to..."
3. Stability / audience warning if needed
4. Deep sections with narrative signposting
5. Contribution / feedback note if appropriate

### Migration guide

1. What's changed at a high level
2. How to handle deprecations and removals
3. Sunset/removal tables
4. Per-component before/after diffs (`// old` vs `// new`)
5. Link to the full reference for each component

### FAQ

1. Symptom-phrased question
2. Mechanism
3. Consequence
4. Options / escape hatch

### Concept / intro article

1. Definition
2. Rhetorical pivot ("So what makes X a good fit?")
3. Status quo and its limits (quantified)
4. The alternative
5. Honest costs
6. Ecosystem / escape hatch

## Rules

- Lead with the recommended stack, generator, or module explicitly (e.g. `kotlin-server` + `jaxrs-spec`).
- Do not present optional features as required.
- Do not present advanced configuration in the main flow.
- Do not end manuals or guides with a numbered summary. How-tos may end with a short "Summary" and "See also".
- Link to dedicated pages for cross-cutting concerns instead of duplicating them.
- State defaults, limits, and consequences explicitly.
- Quantify claims.
- Use code blocks for concrete examples; keep explanatory prose short and purposeful.

## Good / bad micro-examples

### Definition and gaps

Bad:

> Vert.x Web Client is an HTTP client.

Good:

> Vert.x Web Client is an asynchronous HTTP and HTTP/2 client. It makes HTTP request/response interactions easy and provides Json body encoding, request pumping, form submissions, and unified error handling.
>
> It does not deprecate the Vert.x Core `HttpClient`; it is based on it and inherits pooling, HTTP/2 support, and pipelining. Use the Core client when you need fine-grained control over requests and responses. The Web Client does not provide a WebSocket API and does not handle cookies.

### Consequence language

Bad:

> Create the Web Client once and reuse it.

Good:

> Create the Web Client once on application startup and reuse it. Otherwise you lose connection pooling and may leak resources if instances are not closed properly.

### Defaults

Bad:

> The body size limit can be configured.

Good:

> By default, the body size is limited to 10 megabytes. You can change this with `setBodyLimit`.

### Defaults with human translation

Bad:

> The cache max age is `86400`.

Good:

> `cache-control` is set to `max-age=86400` by default. This corresponds to one day.

### Comments

Bad:

```java
// Put foo in the map
map1.put("foo", "bar");
```

Good:

```java
map1.put("foo", "bar"); // Strings are immutable so no need to copy
```

### Anti-pattern then fix

Bad:

```java
int value = counter;
value += getRemoteValue().await();
counter = value;
```

Good:

```java
int value = counter;
value += getRemoteValue().await();
// the counter value might have changed
counter = value;
```

> You should read/write fields before calling `await` to avoid this.

```java
counter += getRemoteValue().await();
```

### Admonition

Bad:

> Note: Java 21 is required.

Good:

> Using virtual threads requires Java 21 or above.

### Troubleshooting

Bad:

> Why can't I see network logs?
>
> You need to set the logger to DEBUG.

Good:

> **The `logActivity` option is enabled, but nothing is logged**
>
> When active, Netty's pipeline is configured for logging on Netty's logger at DEBUG level. This is why switching on the option is not enough. You also have to set the `io.netty.handler.logging.LoggingHandler` logger to DEBUG level in your logging framework configuration.

### Scope refusal

Bad:

> `FileSystem` supports many operations. Here is the full list...

Good:

> Many operations exist to copy, move, truncate, chmod, and more. We won't list them all here; please consult the API docs for the full list.

### Honest cost admission

Bad:

> Virtual threads make everything easier.

Good:

> Virtual thread support allows you to work with asynchronous APIs using a direct synchronous style. Using virtual threads requires Java 21 or above.

### Quantification

Bad:

> Threads are expensive.

Good:

> Threads aren't cheap: creating a thread takes a few milliseconds, and a new thread eats about 1MB of memory.
