# What is Batterypack?

Ktor Batterypack is a collection of opinionated Kotlin libraries that wire the cross-cutting concerns of a Ktor backend — configuration, dependency injection, error responses, health probes, database access, Redis, metrics, request validation, integration testing, and Docker packaging — into one composition root. Your application keeps the domain logic; the batteries keep the plumbing.

It makes the parts every backend needs someone else's problem:

- **bootstrap** — one call, `configureKtorServer`, starts a server with a DI container, JSON content negotiation, global exception handling, and Kubernetes health probes,
- **typed configuration** — YAML, environment variables, and system properties bound into data classes, with profile support,
- **uniform errors** — every failure, from a rejected request body to an unhandled `Throwable`, leaves the server as an RFC 7807 `ProblemDetail`,
- **operational defaults** — Prometheus metrics, monitored connection pools, Redis streams with crash recovery, layered Docker images.

## What Batterypack is not

Batterypack does not replace Ktor — it is a set of libraries on top of it. The stack underneath stays visible and accessible: Ktor 3.4 for the server, Koin 4.2 for DI, Hoplite for configuration, Jackson 3 for JSON, Exposed + HikariCP for persistence, Lettuce for Redis, Micrometer for metrics. Coming from Spring Boot? This is not a runtime that owns your application; it is batteries you clip onto a plain Ktor server, and every battery is optional except one.

So what makes Batterypack a good fit?

## The problem: every service re-solves the same concerns

A plain Ktor project gives you an HTTP engine and a routing DSL. Everything a production service also needs is left as an exercise:

- a dependency injection container, wired to the server's lifecycle,
- JSON conventions — one shared mapper, dates, error envelopes,
- error handling — mapping every failure to a consistent JSON response,
- health endpoints — liveness and readiness, the contract Kubernetes scrapes,
- typed configuration — profiles, environment overrides, secrets outside the repo,
- metrics — a registry and a scrape endpoint,
- database access — connection pooling, readiness, cleanup on shutdown,
- Docker packaging — layering that keeps image rebuilds cheap.

None of that is hard. That is exactly the problem: it is the same not-hard work, re-decided and re-typed in every service, and every team decides it slightly differently. Two services in one company end up with different error envelopes, different config conventions, and different ideas of what "healthy" means. The cost is not any single line of boilerplate — it is the drift.

## The idea: batteries

The name is the design. A battery is self-contained, it does one job, and the device works with any subset of them:

- every module is published and versioned independently — you depend on exactly what you need, nothing else,
- all batteries clip into the same composition root — one lambda, `configureKtorServer`, is the only framework call in your code,
- features are beans: a battery joins by contributing Koin beans that implement core's extension points, so adding one is a dependency plus a single line,
- [Core](/core/) is the only required battery; it alone serves HTTP, JSON, health, and errors. [Database](/data/database), [Redis](/redis/), [Metrics](/observability/metrics), and [Validation](/validation/validation) become relevant only when the domain does.

The consequence: your build stays as light as your domain requires, and the wiring story is identical whether you run one battery or all of them. [How it Works](/introduction/how-it-works) walks the model in detail.

## Inspiration

Batterypack is heavily inspired by Spring, and it does not try to hide it. In the author's opinion, Spring is by far the most comprehensive tool in the JVM world. That comprehensiveness comes with weight, though — which is where the second influence comes in.

Vert.x feels light and fun to work with, mostly because it uses abstractions sparingly and comes with only very little framework overhead.

The goal was to combine the best of both worlds in Kotlin: the lightness and fun of Vert.x with the comprehensive, DI-centric ecosystem of Spring.

## The opinions, stated as choices

"Batteries included" here also means "choices already made". Batterypack standardizes on:

| Concern | The choice |
|---------|------------|
| DI | Koin 4.2 with annotations and component scanning |
| JSON | Jackson 3 — one shared `JsonMapper`, ISO-8601 dates |
| Configuration | Hoplite — YAML, environment variables, system properties |
| Persistence | Exposed 1.2 (v1 API) + HikariCP, tuned for PostgreSQL |
| Redis | Lettuce, with Micrometer command metrics |
| Metrics | Micrometer with a Prometheus registry |

These are choices, not options. There is no configuration to swap Jackson for kotlinx.serialization or Koin for another container, and the batteries would fight you if you tried.

The opinions stop at the border, though. Plain Koin definitions remain valid next to annotated ones, the underlying clients — `DataSource`, `RedisClient`, `MeterRegistry`, the Ktor `Application` itself — are ordinary injectable beans, and the Gradle plugin emits a plain `Dockerfile` you are expected to read and extend. When a convention does not fit, the convention is what gives way.

## Honest costs

- **Alpha.** The current release is `0.0.13-alpha`. APIs can and do shift between tags; pin an exact version and expect some migration on upgrade.
- **JDK 25.** The batteries build with a Java 25 toolchain. Older JDKs are not a supported target.
- **Opinions bind.** If your stack is kotlinx.serialization-first, or you want a different DI container, Batterypack is working against you, not for you.
- **Singletons only.** Every bean is a singleton; there is no request-scoped injection. Per-request state belongs in `call.attributes`.
- **No architectural guardrails.** The [example application](/example/) demonstrates ports & adapters, but nothing enforces it — Batterypack wires concerns, it does not police your architecture.

## What Batterypack deliberately does not do

- No request validation in core — that is the [Validation](/validation/validation) battery's job, and it is opt-in.
- No pub/sub wrappers and no caching helpers in the Redis battery — plain `GET`/`SET`, locks, and `SUBSCRIBE`/`PUBLISH` are Lettuce's job, and the client is injectable.
- No image building or pushing in the Gradle plugin — it prepares everything `docker build` needs and stops there.
- No migrations, no schedulers, no service mesh, no client-side load balancing. Those are jobs for tools that already do them well.

## When Batterypack is not the answer

- You are invested in Spring Boot, Quarkus, or Micronaut and content there. Batterypack is a Ktor-native answer, not a migration path.
- You need request-scoped beans as a core part of your programming model. The all-singleton container is a real mismatch then, not an inconvenience.
- You need long-term API stability guarantees. Alpha software moves.
- Your persistence story is not Exposed + PostgreSQL shaped — a document store or a different SQL toolkit leaves the database battery with little to offer.

## Go further

- [Get Started](/introduction/get-started) — add the core battery to a new Ktor project and ship your first controller.
- [Modules at a Glance](/introduction/modules) — the map of every battery and when to reach for it.
- [How it Works](/introduction/how-it-works) — the mental model: one lambda, features as beans.
- [Cloud Native](/introduction/cloud-native) — how the batteries map to the cloud-native contract.
- [Example Application](/example/) — a complete backend wired with every battery.
