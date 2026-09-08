# Health

`ktor-batterypack-core` mounts two health endpoints under `/actuator/health` before you write a single route. `HealthController` — itself a [controller](/core/controllers) published by the core module — answers liveness and readiness probes the way Kubernetes expects: `200` when the service should receive traffic, `503` when it should not.

It makes three things easy:

- **liveness** — an endpoint that proves the process is up and serving,
- **readiness** — an aggregate verdict built from every `ReadinessCheck` bean in the container,
- **pluggability** — a check is a Koin bean implementing an interface; there is no registration API, the container collects implementations — the same [extension-point idea](/core/dependency-injection#extension-points-registering-a-bean-is-the-wiring) that drives [lifecycle](/core/lifecycle) beans.

What health deliberately does not do: liveness is wired to no check and cannot be (see [Kubernetes probes](#kubernetes-probes)), there is no `DEGRADED` status — one `DOWN` check flips the whole endpoint to `503` — and there is no per-check timeout, so the endpoint's latency is the sum of its checks. The endpoints are unauthenticated; see [Security notes](#security-notes).

## Endpoints

| Method | Path | Verdict |
|--------|------|---------|
| `GET` | `/actuator/health/liveness` | `200` while the application is running — always |
| `GET` | `/actuator/health/readiness` | `200` when every check is `UP`, `503` when any is `DOWN` |

The bodies are small JSON documents:

```
$ curl http://localhost:8080/actuator/health/liveness
{"liveness":"UP"}

$ curl http://localhost:8080/actuator/health/readiness
{"status":"UP","checks":{"diskSpace":"UP"}}
```

Note the field names: liveness reports under `liveness`, not `status` — a client parsing the readiness shape will miss it. `checks` is a map keyed by check name, so the response names every component it verified.

## Readiness checks

A check is any bean implementing `ReadinessCheck`:

```kotlin
interface ReadinessCheck {
    suspend fun check(): HealthCheckResult
}
```

`ReadinessEndpoint` — published by the core module — receives `List<ReadinessCheck>` from the container, runs every check, and reports `UP` only when all results are `UP`. Implementing the interface *is* the registration; annotate the class with `@Singleton` and it joins the next probe:

```kotlin
import io.github.ktor_batterypack.core.health.HealthCheckResult
import io.github.ktor_batterypack.core.health.HealthStatus
import io.github.ktor_batterypack.core.health.ReadinessCheck
import org.koin.core.annotation.Singleton

@Singleton
class RatesServiceCheck(private val ratesClient: RatesClient) : ReadinessCheck {

    override suspend fun check(): HealthCheckResult {
        return try {
            HealthCheckResult(
                name = "ratesService",
                status = if (ratesClient.ping()) HealthStatus.UP else HealthStatus.DOWN
            )
        } catch (e: Exception) {
            log.warn("Rates service check failed", e)
            HealthCheckResult("ratesService", HealthStatus.DOWN)
        }
    }
}
```

The [Database](/data/database) and [Redis](/redis/) batteries register their own checks through this same interface — the list grows with the modules you include.

## Writing a check that behaves

Two rules keep the endpoint useful. Both have consequences when ignored.

**Catch exceptions inside the check and return `DOWN`.** `ReadinessEndpoint` does not catch anything: an escaping exception travels to StatusPages and the response becomes a `500` `ProblemDetail` from [Exception Handling](/core/exceptions) — not a `503` with the checks map. The probe still fails, because kubelet treats anything but `2xx` as failure, but the response no longer says *which* component is down, and every probe interval drops a full stack trace into the logs. The example above — like the built-in disk check — models the pattern: catch, log, return `DOWN`.

**Keep checks cheap.** Checks run sequentially, on every probe, with no caching and no per-check timeout. With the kubelet default `periodSeconds: 10`, a 500 ms check runs about 6 times per minute; a 2-second check will blow the default 1-second probe timeout and fail readiness probes *by timeout*, even when every component is healthy.

Two checks reporting the same `name` overwrite each other in the response — one disappears silently. Give each check a distinct name.

## The built-in disk-space check

The core module always registers one check: `DiskSpaceReadinessCheck`, named `diskSpace`. It reports `DOWN` when the usable space on the file system holding the working directory drops to 100 MB or less — the point where log writes, temp files, and uploads start failing. On failure it logs the numbers:

```
WARN  DiskSpaceReadinessCheck - Disk space check failed. Usable space: 81234567 bytes, threshold: 104857600 bytes
```

The path and the 100 MB threshold are constructor parameters, but there is no configuration knob and no off-switch — the module publishes the check with its defaults, always. Need a different path or threshold? Write another check; it joins the list next to the built-in one.

## Kubernetes probes

The two endpoints map to the two kubelet probes, and their failure semantics are the reason both exist:

- **readiness fails** → the pod stops receiving traffic but keeps running. Broken dependency, stopped traffic, no restart.
- **liveness fails** → kubelet restarts the pod. That is why liveness is wired to no check: tie it to a broken downstream service and Kubernetes will kill and restart a perfectly healthy process, in a loop, until the dependency recovers.

```yaml
readinessProbe:
  httpGet:
    path: /actuator/health/readiness
    port: 8080
  periodSeconds: 10
livenessProbe:
  httpGet:
    path: /actuator/health/liveness
    port: 8080
  periodSeconds: 10
  initialDelaySeconds: 30
```

With kubelet defaults — 10 s period, 3 failures — a failing check stops traffic roughly 30 seconds after it starts failing. Set `initialDelaySeconds` above your startup time: the port opens only after every `InitCallback` has run, but the delay also covers slow container starts.

## Security notes

The health endpoints are mounted automatically and unauthenticated, and readiness discloses your dependency topology: the `checks` map names every component — `diskSpace`, `database`, `redis`, `ratesService` — and its state. Keep `/actuator` out of the public ingress. kubelet probes reach the pod directly; no external route to these endpoints is needed in normal operation.
