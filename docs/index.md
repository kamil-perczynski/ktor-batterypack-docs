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
      link: /introduction/get-started
    - theme: alt
      text: What is Batterypack?
      link: /introduction/what-is-batterypack
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
    link: /introduction/cloud-native
  - title: Redis
    details: Lettuce-based Redis client for caching and events, plus Testcontainers support for integration tests.
  - title: Validation
    details: Declarative request validation with KSP code generation.
  - title: Build Tooling
    details: Gradle plugin for layered Docker distributions, Dockerfile bootstrapping, and dependency caching.
---

## What is Ktor Batterypack?

A collection of opinionated Kotlin libraries that wire the cross-cutting concerns of a Ktor backend — configuration, DI, error responses, health probes, database, Redis, metrics, validation, testing helpers, and Docker packaging — so your application stays focused on domain logic.

Read [What is Batterypack](/introduction/what-is-batterypack) for the full story, browse [Modules at a Glance](/introduction/modules) for the map, or dive into [How it Works](/introduction/how-it-works) for the mental model.
