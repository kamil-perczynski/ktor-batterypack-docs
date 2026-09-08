---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "Ktor/ Batterypack"
  tagline: Reusable batteries for building production-ready Ktor backends.
  image:
    src: /icon-x.webp
    alt: Ktor Batterypack icon
  actions:
    - theme: brand
      text: Get started
      link: /table-of-contents
    - theme: alt
      text: GitHub
      link: https://github.com/kamil-perczynski/ktor-batterypack

features:
  - title: Simple, efficient & fun
    details: Minimal boilerplate and a modular design let you pick only the libraries you need, keeping the stack light and productive.
  - title: Config & DI
    details: Type-safe Hoplite configuration and Koin annotation-based dependency injection with automatic module scanning.
  - title: Web Layer
    details: Controller auto-registration, global exception handling, RFC 7807 ProblemDetail responses, and multipart support.
  - title: Kubernetes ready
    details: Layered Docker images, health endpoints, Prometheus metrics, and stateless design make it ready to deploy on container orchestrators.
  - title: Redis
    details: Lettuce-based Redis client for caching and events, plus Testcontainers support for integration tests.
  - title: Validation
    details: Declarative request validation with KSP code generation.
  - title: Build Tooling
    details: Gradle plugin for layered Docker distributions, Dockerfile bootstrapping, and dependency caching.
---

## What is Ktor Batterypack?

Ktor Batterypack is a collection of opinionated Kotlin libraries that solve common backend concerns so you can focus on domain logic. It includes modules for configuration, dependency injection, HTTP routing, database access, Redis, metrics, validation, testing helpers, and Docker packaging.

## Modules at a Glance

| Module | Purpose |
|--------|---------|
| `ktor-batterypack-core` | Bootstrap, config, health, exceptions, DI lifecycle, Jackson, and controller auto-registration |
| `ktor-batterypack-database` | Exposed + Hikari + monitored transactions |
| `ktor-batterypack-database-testing` | Testcontainers PostgreSQL helper |
| `ktor-batterypack-metrics` | Micrometer + Prometheus |
| `ktor-batterypack-redis` | Lettuce Redis client |
| `ktor-batterypack-redis-testing` | Testcontainers Redis helper |
| `ktor-batterypack-validation` | Konform-based request validation |
| `ktor-batterypack-validation-ksp` | KSP processor for validators |
| `ktor-batterypack-annotations` | Shared annotations |
| `ktor-batterypack-gradle-plugin` | Docker packaging tasks |
| `ktor-batterypack-example` | Example application |

Each module is published independently, so you can include only the batteries you need.
