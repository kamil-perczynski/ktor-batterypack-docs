# Bootstrap Docker Files

`bootstrapDockerfile` and `bootstrapDockerignore` write a production-ready `Dockerfile` and a `.dockerignore` into your project root — tuned to the [dockerDist](/gradle-plugin/docker-dist) layout, with container-aware JVM flags baked in.

## Usage

```bash
./gradlew bootstrapDockerfile bootstrapDockerignore
```

Each task logs its output path and finishes:

```
Bootstrapped /home/you/my-app/Dockerfile
Bootstrapped /home/you/my-app/.dockerignore
```

Both tasks write to the project root and **overwrite whatever is there**. If you hand-edit the `Dockerfile` and re-run the task, your edits are gone. Regenerate first, customize second — or skip the task entirely and own the file yourself.

The `Dockerfile` expects `build/docker-dist/` to exist in the build context, so run `./gradlew build` (or at least `dockerDist`) before `docker build`. Otherwise the `COPY` instructions fail with `failed to compute cache key`.

## The generated Dockerfile

```dockerfile
FROM eclipse-temurin:25-jdk-alpine
WORKDIR /app

COPY build/docker-dist/lib lib
COPY build/docker-dist/app .

EXPOSE 8080

ENV JAVA_TOOL_OPTIONS="--enable-native-access=ALL-UNNAMED -XX:ActiveProcessorCount=4 -XX:MaxRAMPercentage=80 -XX:+UseCompactObjectHeaders"
CMD ["java", "-cp", "*:lib/*", "io.github.ktor-perczynski.MainKt"]
```

Your `CMD` carries the main class the plugin resolved for your project — see [the `ktorBatterypack` block](/gradle-plugin/#the-ktor-batterypack-block).

Instruction by instruction:

- **`FROM eclipse-temurin:25-jdk-alpine`** — an official JDK 25 build on Alpine Linux. Small base, and the JDK matches the toolchain Batterypack targets.
- **`COPY build/docker-dist/lib lib`** comes before **`COPY build/docker-dist/app .`** on purpose. Docker caches each `COPY` by content, and `lib/` changes only when your dependencies do — the expensive layer stays cached across builds, only the `app/` layer invalidates. See [Docker Distribution](/gradle-plugin/docker-dist).
- **`EXPOSE 8080`** documents the port Ktor listens on by default. It publishes nothing — `docker run` still needs `-p 8080:8080`.
- **`ENV JAVA_TOOL_OPTIONS=...`** bakes container-aware JVM defaults into the image. Each flag earns its place:
  - `--enable-native-access=ALL-UNNAMED` — Netty loads native libraries from an unnamed module; since JDK 24 (JEP 472) this is restricted, and without the flag the JVM logs warnings that will eventually become hard failures.
  - `-XX:ActiveProcessorCount=4` — pins the JVM's view to exactly 4 processors, regardless of how many cores the host or the container advertises. GC threads and the common `ForkJoinPool` are sized for 4, so memory and CPU footprint stay predictable on machines with dozens of cores.
  - `-XX:MaxRAMPercentage=80` — the heap grows to 80% of the container's memory limit, leaving the remaining 20% for metaspace, thread stacks, and Netty's direct buffers. A fixed `-Xmx` can't do this: too high and the container gets OOM-killed, too low and the memory limit is wasted.
  - `-XX:+UseCompactObjectHeaders` — objects carry smaller headers, trimming overall heap usage on JDK 25.
- **`CMD ["java", "-cp", "*:lib/*", ...]`** — a plain classpath launch: every JAR in the working directory plus everything in `lib/`, no fat JAR, no launcher script.

`JAVA_TOOL_OPTIONS` is a single environment variable. To change the flags at runtime, pass `-e JAVA_TOOL_OPTIONS="..."` — this **replaces** the baked value, it doesn't append to it.

## The generated `.dockerignore`

```
*
!build/distributions
!build/docker-dist
```

Deny everything, then admit two paths:

- `*` — every file in the project is excluded from the Docker build context by default.
- `!build/distributions` — classic Gradle distribution archives, in case your workflow reads the `distZip` output.
- `!build/docker-dist` — the layered distribution the `Dockerfile` consumes.

Deny-by-default has two consequences, both pleasant. First, the build context stays tiny — nothing gets hashed and shipped to the daemon except the actual build output, so `docker build` starts fast even in large repositories. Second, nothing leaks: your source code, `application-local.yaml`, `.env` files, and `.git` history never reach the image or the daemon.

The flip side: anything your image genuinely needs beyond `build/` is invisible. If, say, static assets live outside the packaged JAR, the `COPY` that fetches them fails at build time — you'll need a matching `!path` line in your `.dockerignore`. The generated file is a starting point; extending it is expected.

## Build and run

```bash
./gradlew build
docker build -t my-app .
docker run --rm -p 8080:8080 my-app
```

Verify the container is alive:

```bash
curl http://localhost:8080/actuator/health/liveness
```

## Security notes

- The deny-all `.dockerignore` keeps source and local configuration out of the image — but it is generated once, not enforced at build time. A manually added `!application-local.yaml` line overrides the intent silently.
- The image runs as **root**. The generated `Dockerfile` does not create a non-root user; if your platform requires one, add `USER` yourself after regenerating.
- `EXPOSE 8080` binds nothing. Ensure the Ktor port — and only that port — is published when running the image.
