# Docker Distribution

`dockerDist` produces a Docker-friendly distribution in `build/docker-dist`: your application JAR in an `app` layer and every runtime dependency in a `lib` layer.

## Why layers

The straightforward way to package a JVM app for Docker is one fat JAR — or a single directory with all JARs piled together. It works, until you look at what `docker build` actually does with it. Docker caches each `COPY` instruction by content: change one byte, and that layer — and everything after it — rebuilds. With a fat JAR, every code change invalidates the entire payload: your ~200 KB of application code drags ~50 MB of dependencies through the build cache on every build.

`dockerDist` splits the two:

- `lib/` holds the runtime classpath — it changes only when your dependencies change.
- `app/` holds your JAR — it changes on every build.

The generated [Dockerfile](/gradle-plugin/bootstrap-docker-files) `COPY`s them in exactly that order, so the dependency layer stays cached across builds and only the small `app` layer invalidates.

## Usage

```bash
./gradlew dockerDist
```

You rarely run it by hand: the plugin makes `assemble` depend on `dockerDist`, so a plain `./gradlew build` already produces the distribution. The `Sync` is incremental — when the outputs are current, it costs nothing.

## What you get

```
build/docker-dist/
├── app/
│   └── my-app-0.1.0.jar
└── lib/
    ├── exposed-core-1.5.0.jar
    ├── hikaricp-7.0.2.jar
    ├── ktor-server-netty-3.4.0.jar
    └── ...
```

- `app/` contains the output of the `jar` task, under its normal Gradle name: `<project-name>-<version>.jar`.
- `lib/` mirrors your `runtimeClasspath` — every JAR your application needs at runtime, including transitive dependencies.

`dockerDist` is a `Sync`, not a `Copy`: the output directory is synchronized with the current classpath on every run. Remove a dependency from your build, and its JAR disappears from `lib/` — stale JARs never linger in the image.

The layout is deliberately dumb — no scripts, no launcher, no entrypoint. That's the bootstrap tasks' job: the [generated Dockerfile](/gradle-plugin/bootstrap-docker-files) does the launching with a plain `java -cp`.
