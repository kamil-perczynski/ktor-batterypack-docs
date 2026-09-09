# Cloud Native

You know the drill: cloud-native workloads treat infrastructure as disposable — provisioned, scaled, and destroyed on demand — and lean on orchestration rather than machines you nurse back to health. [The Twelve-Factor App](https://12factor.net/) is the standard methodology for the application's half of that contract: externalized configuration, disposable processes, attached backing services, telemetry, container packaging. Need a recap? [What is Cloud Native?](https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/definition) on Microsoft Learn is the best explanation of the topic we've read.

This page is not another introduction. It maps the factors onto the pack: which ones the batteries hand you, and which remain your job.

## Which battery covers which factor

| Factor | Covered by |
|--------|------------|
| I. Codebase | **Yours.** Batteries are plain libraries in your build — no scaffolding, no generated repo |
| II. Dependencies | The [version catalog](/version-catalog/) (`batterypackLibs`) pins every battery and stack version explicitly |
| III. Config | **Strong** — `loadConfig<T>` with Hoplite, environment-first ([below](#configuration-lives-in-the-environment)) |
| IV. Backing services | **Strong** — `DatabaseProps` / `RedisProps` attach PostgreSQL and Redis by URL and credentials |
| V. Build, release, run | **Strong** — `dockerDist` + `bootstrapDockerfile` produce the immutable artifact ([below](#immutable-packaging)) |
| VI. Processes | **Strong** — durable state lives in PostgreSQL and Redis; Redis Streams consumer state is server-side |
| VII. Port binding | `DeploymentProps` — the listen port is typed configuration (`ktor.deployment.port`, 8080 by default) |
| VIII. Concurrency | Hikari pool per replica — `poolSize` defaults to 2; the database sees N × poolSize connections |
| IX. Disposability | **Strong** — `InitCallback` fail-fast startup, `AutoCloseable` graceful shutdown, health probes ([below](#disposable-by-default)) |
| X. Dev/prod parity | **Strong** — `PostgresTestContainer` / `RedisTestContainer` run the real engines in tests ([below](#dev-prod-parity)) |
| XI. Logs | Recommended: Logback with `logstash-logback-encoder` — structured JSON to stdout ([below](#what-batterypack-doesnt-do-for-you)) |
| XII. Admin processes | **Not covered.** One-off tasks are separate processes |

## The strong matches

### Configuration lives in the environment

Factors III and IV in practice. Every value is bound through Hoplite with one precedence, highest first:

1. environment variables (`UPPER_CASE_WITH_UNDERSCORES`),
2. system properties (`config.override.*`),
3. `application-{profile}.yaml`, profile-specific,
4. `application.yaml` — committed defaults.

Active profiles come from `app.profiles` or the `APP_PROFILES` environment variable. The default is `local`, and `application-local.yaml` is typically gitignored — machine-specific overrides never reach the repo.

The consequence: the same image runs in every environment. Promoting from staging to production is an env-var change, not a rebuild. Pointing the [Database](/data/database) or [Redis](/redis/) battery at a different instance is the same move — both attach purely through their props (`DatabaseProps`, `RedisProps`), never through code. [Configuration](/core/config) documents the loader.

### Disposable by default

Factor IX is where the lifecycle conventions earn their keep:

- Startup is fail-fast — a failing `InitCallback` aborts boot with an `IllegalStateException`, so a half-initialized instance never takes traffic.
- Shutdown is graceful — every `AutoCloseable` bean is closed, failures are logged and skipped, and shutdown always proceeds.
- The orchestrator contract is pre-wired — liveness and readiness endpoints exist before you write a route. Any `ReadinessCheck` reporting `DOWN` flips `/actuator/health/readiness` to `503`: the orchestrator stops routing traffic but the process keeps running; only a failing liveness probe triggers a restart.

The [Lifecycle](/core/lifecycle) and [Health](/core/health) pages document the exact sequences.

### Dev/prod parity

Factor X: tests run against the real engines, not mocks:

- `PostgresTestContainer` starts a real PostgreSQL 17 (`postgres:17-alpine` by default),
- `RedisTestContainer` starts a real Redis 8 (`redis:8-alpine`),
- Redis streams tests publish and consume over the same machinery production uses — nothing is mocked.

What remains different between environments is the platform, not the store. See [Database Testing](/data/database-testing) and [Redis Testing](/redis/redis-testing).

### Immutable packaging

Factor V: `dockerDist` assembles a distribution with separate `app` and `lib` layers, so a code-only rebuild ships a thin layer — the dependency layers stay cached. `bootstrapDockerfile` writes a production-ready `Dockerfile` you can read and extend. The release is the image tag; rolling back is re-deploying an older tag.

The plugin deliberately stops there — no Docker daemon, no push. Build and release belong to your CI/CD. See [Docker Distribution](/gradle-plugin/docker-dist).

## Beyond twelve

The Microsoft reference extends the methodology with three modern factors. Two map directly:

- **API first (13).** Every controller is a service; the [OpenAPI Generator](/core/openapi-generator) derives request and response DTOs — with their validators — from the spec.
- **Telemetry (14).** The reference observes that on a workstation you have deep visibility into your application — in the cloud you don't. The [Metrics](/observability/metrics) battery serves `/actuator/prometheus`, and the other batteries feed the same registry: Hikari pool gauges and Redis command latencies land in one scrape output.
- **Authentication (15).** Not covered — there is no auth battery. Bring Ktor's authentication plugin and your identity provider.

## What Batterypack doesn't do for you

- **Logging** — Batterypack adds no logging battery and stays out of the way. The recommendation is Logback with [`logstash-logback-encoder`](https://github.com/logfellow/logstash-logback-encoder), emitting structured JSON to stdout for the platform to collect:

  ```xml
  <appender name="STDOUT" class="ch.qos.logback.core.ConsoleAppender">
      <encoder class="net.logstash.logback.encoder.LogstashEncoder"/>
  </appender>
  ```
- **Admin one-off processes** (Factor XII) — data cleanup and analytics jobs are separate processes; `InitCallback` is for startup, not admin.
- **Cross-service resiliency** — retries and circuit breaking between services are not in the pack; that is client code or a service mesh.
- **Secrets management** — environment variables are the transport; a vault is external infrastructure.

## References

- [What is Cloud Native? — Microsoft Learn](https://learn.microsoft.com/en-us/dotnet/architecture/cloud-native/definition) — the definition this page leans on
- [The Twelve-Factor App](https://12factor.net/) — the methodology
- [CNCF cloud-native definition](https://github.com/cncf/toc/blob/main/DEFINITION.md) — the upstream wording
