# Modules at a Glance

This page is the map of the pack: every battery, what it gives you, and when to reach for it. It stays a map — each module has a manual of its own, linked from every entry.

[Core](/core/) is the only required battery. Everything else is optional and grouped by concern below.

## The required base

### `ktor-batterypack-core`

Bootstraps the server. One call — `configureKtorServer` — resolves configuration profiles, starts the Koin container, installs global exception handling and Jackson content negotiation, mounts liveness and readiness endpoints, and discovers your route controllers. It also defines the extension points every other battery plugs into.

[Core manual →](/core/)

## Build tooling

### `ktor-batterypack-gradle-plugin`

Three Gradle tasks: `dockerDist` produces a Docker distribution with separate `app` and `lib` layers, while `bootstrapDockerfile` and `bootstrapDockerignore` write production-ready Docker files. The plugin also applies KSP automatically and generates configuration metadata for IDE autocompletion in `application.yaml`. It never talks to a Docker daemon — it prepares what `docker build` needs; running the build stays your job.

[Gradle Plugin manual →](/gradle-plugin/)

## Data

### `ktor-batterypack-database`

A HikariCP-backed `DataSource` bean with typed `DatabaseProps` configuration, automatic pool cleanup on shutdown, a database readiness check, and Hikari metrics through Micrometer. Designed for Exposed and PostgreSQL.

[Database manual →](/data/database)

### `ktor-batterypack-database-testing`

`PostgresTestContainer` — a Testcontainers PostgreSQL (`postgres:17-alpine` by default) for integration tests, with the JDBC URL and credentials ready to wire into your configuration.

[Database Testing manual →](/data/database-testing)

## Redis

### `ktor-batterypack-redis`

A Lettuce `RedisClient` with Micrometer command latency metrics, a shared connection bean, and a readiness check. Registering `KtorBatterypackRedisStreamsModule` instead adds the streams toolkit on top: publishing, declarative listeners, consumer groups, crash recovery, and lag monitoring. It wraps neither pub/sub nor caching — for plain `GET`/`SET`, locks, or `SUBSCRIBE`/`PUBLISH`, inject the connection and use Lettuce directly.

[Redis manual →](/redis/)

### `ktor-batterypack-redis-testing`

A Testcontainers Redis plus a test-only stream fetcher that captures published messages. Integration tests publish and consume over the same streams machinery production uses — nothing is mocked. For unit tests without Redis, call your listeners' `onMessage` directly.

[Redis Testing manual →](/redis/redis-testing)

## Observability

### `ktor-batterypack-metrics`

A `PrometheusMeterRegistry` bound as `MeterRegistry`, Ktor metric filters registered before any metric is recorded, a `MetricsController` serving `/actuator/prometheus`, and helpers for timing method invocations. Other batteries feed the same registry — Hikari pool metrics and Redis command latencies land in the same scrape output.

[Metrics manual →](/observability/metrics)

## Validation

### `ktor-batterypack-validation`

Runtime validation utilities: `ValidationResult<T>`, `ValidationException`, a `Constraints` helper object (`NotBlank`, `Size`, `Min`, `Max`, `Email`, `Past`, `Future`, …), and structured error models that map onto RFC 7807 responses. Usable on its own.

[Validation manual →](/validation/validation)

### `ktor-batterypack-validation-ksp` + `ktor-batterypack-annotations`

The KSP code generator. Annotate a DTO with `@Validator` or `@JsonValidator` — the annotations live in the tiny `annotations` module — and the compiler emits the validator for you. The recommended pipeline for request and response DTOs.

[Validation Codegen manual →](/validation/validation-codegen)

## The reference application

### `ktor-batterypack-example`

Not a library but the monorepo's example backend: all batteries combined, a ports & adapters structure, Redis-backed domain events, and integration tests that spin up PostgreSQL and Redis once per JVM. Read it when you want to see everything wired together.

[Example Application →](/example/)

## Which battery do I need?

| When you need… | Reach for |
|----------------|-----------|
| HTTP, JSON, uniform errors, health probes | [core](/core/) — always |
| PostgreSQL persistence with pooling and readiness | [database](/data/database) |
| Events between domains or services | [redis streams](/redis/redis-streams) |
| Caching, locks, pub/sub | [redis](/redis/) client — Lettuce directly |
| Prometheus metrics | [metrics](/observability/metrics) |
| Declarative request validation | [validation](/validation/validation) + [validation-ksp](/validation/validation-codegen) |
| Docker packaging with cheap rebuilds | [gradle-plugin](/gradle-plugin/) |
| Integration tests against real PostgreSQL / Redis | [database-testing](/data/database-testing) / [redis-testing](/redis/redis-testing) |

Every battery is published independently, so reaching for one is a Gradle dependency plus a line in your `@KoinApplication` — [How it Works](/introduction/how-it-works) shows the mechanics.
