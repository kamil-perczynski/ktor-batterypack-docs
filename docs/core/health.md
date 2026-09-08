# Health

`ktor-batterypack-core` exposes Kubernetes-friendly health endpoints under `/actuator/health`.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/actuator/health/liveness` | Always returns `200 OK` when the application is running. |
| GET | `/actuator/health/readiness` | Returns `200 OK` when all readiness checks pass, or `503 Service Unavailable` when any check fails. |

## Readiness checks

A readiness check is any bean implementing `ReadinessCheck`. The core module already provides a disk-space check. Additional modules such as `database` and `redis` register their own checks automatically.

```kotlin
import io.github.ktor_batterypack.core.health.HealthStatus
import io.github.ktor_batterypack.core.health.ReadinessCheck
import io.github.ktor_batterypack.core.health.ReadinessResponse
import org.koin.core.annotation.Singleton

@Singleton
class MyReadinessCheck : ReadinessCheck {
    override fun check(): ReadinessResponse {
        return if (isReady()) {
            ReadinessResponse.up("myService")
        } else {
            ReadinessResponse.down("myService", "Not ready yet")
        }
    }
}
```

## Responses

### Liveness

```json
{
  "status": "UP"
}
```

### Readiness

```json
{
  "status": "UP",
  "checks": [
    { "name": "diskSpace", "status": "UP" },
    { "name": "database", "status": "UP" }
  ]
}
```

When a check fails, the endpoint returns HTTP `503` and marks the failing checks with `status: DOWN`.

## Kubernetes probes

Example Kubernetes deployment probes:

```yaml
livenessProbe:
  httpGet:
    path: /actuator/health/liveness
    port: 8080
  initialDelaySeconds: 30
  periodSeconds: 10
readinessProbe:
  httpGet:
    path: /actuator/health/readiness
    port: 8080
  initialDelaySeconds: 5
  periodSeconds: 5
```
