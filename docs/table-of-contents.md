# Ktor Batterypack

A modular set of reusable Ktor libraries — the batteries you need to build production-ready Kotlin backends.

## Features

- **Application bootstrap** — opinionated Ktor server wiring with Koin DI, status pages, content negotiation, and controller auto-registration.
- **Configuration loading** — type-safe config from YAML, environment variables, system properties, and active profiles via Hoplite.
- **HTTP controllers** — discover and register route controllers automatically through a single `KtorController` interface.
- **Exception handling** — global RFC 7807 `ProblemDetail` responses for validation, business, and unexpected errors.
- **Database transactions** — monitored, coroutine-friendly Exposed + Hikari transactions with Micrometer integration.
- **Redis client** — Lettuce-based Redis client for caching and event publishing.
- **Observability** — Micrometer metrics exposed in Prometheus format, plus health endpoints.
- **Request validation** — declarative request validation with Konform and optional KSP code generation.
- **Integration testing** — shared Testcontainers helpers for PostgreSQL and Redis.
- **Docker packaging** — Gradle plugin that builds layered Docker distributions and bootstraps Dockerfile / .dockerignore.

## Modules

- **ktor-batterypack-core** — config, health, exceptions, DI lifecycle, multipart utilities, Jackson, and controller auto-registration.
- **ktor-batterypack-database** — Exposed + Hikari + monitored transactions.
  - *ktor-batterypack-database-testing* — Testcontainers PostgreSQL helper for integration tests.
- **ktor-batterypack-metrics** — Micrometer registry and Prometheus scrape endpoint.
- **ktor-batterypack-redis** — Lettuce Redis client.
  - *ktor-batterypack-redis-testing* — Testcontainers Redis helper for integration tests.
- **ktor-batterypack-validation** — Konform-based request validation and runtime validator utilities.
  - *ktor-batterypack-validation-ksp* — KSP processor for generating validators from annotations.
- **ktor-batterypack-annotations** — shared annotations used across the other modules.
- **ktor-batterypack-gradle-plugin** — custom Gradle plugin with `dockerDist`, `bootstrapDockerfile`, and `bootstrapDockerignore` tasks.
- **ktor-batterypack-example** — example application demonstrating how the modules fit together.
