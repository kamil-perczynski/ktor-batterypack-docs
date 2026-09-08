# Controllers

Controllers are the HTTP adapters of an application. In `ktor-batterypack-core` a controller is any Koin bean that implements `KtorController`; routes are registered automatically during server startup.

## The `KtorController` interface

```kotlin
package io.github.ktor_batterypack.core.ktor

import io.ktor.server.routing.Routing

interface KtorController {
    fun register(routing: Routing)
}
```

Implement the interface and annotate the class with `@Singleton` (or provide it as a Koin bean another way). The `register` method receives a Ktor `Routing` instance where you define your routes.

## Example

```kotlin
import io.github.ktor_batterypack.core.ktor.KtorController
import io.ktor.http.HttpStatusCode
import io.ktor.server.response.respond
import io.ktor.server.routing.Routing
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import org.koin.core.annotation.Singleton

@Singleton
class UserController(private val userService: UserService) : KtorController {

    override fun register(routing: Routing) {
        routing.route("/users") {
            get {
                call.respond(userService.findAll())
            }
            post {
                val request = call.receive<UserCreateRequest>()
                call.respond(HttpStatusCode.Created, userService.create(request))
            }
            get("/{id}") {
                val id = call.parameters["id"]!!.toUUID()
                call.respond(userService.findById(id))
            }
        }
    }
}
```

## Auto-registration

`configureKtorServer` resolves every `KtorController` bean from Koin and calls `register` for each one:

```kotlin
val controllers = koin.getAll<KtorController>()
routing {
    for (controller in controllers) {
        log.info("Registering routes for controller: {}", controller::class.simpleName)
        controller.register(this)
    }
}
```

This means you do **not** need to manually wire route classes. As long as the class is a discoverable Koin bean under your `@ComponentScan` package, its routes will appear.

## Health controller

The Core module registers `HealthController` automatically. It exposes:

- `GET /actuator/health/liveness`
- `GET /actuator/health/readiness`

See [Health](/core/health) for details.

## Best practices

- Keep controllers thin — delegate to domain services.
- Use constructor injection for dependencies; Koin will satisfy them.
- Return serializable objects and let the shared Jackson mapper handle content negotiation.
- For validated request input, use [JsonBinder](/core/request-binding).
