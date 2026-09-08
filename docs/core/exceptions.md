# Exception Handling

`ktor-batterypack-core` installs a global `KtorExceptionHandler` that maps common exceptions to RFC 7807 `ProblemDetail` responses. This gives clients a stable, machine-readable error format without extra work in each route.

## `ProblemDetail`

The response model follows [RFC 7807](https://datatracker.ietf.org/doc/html/rfc7807):

```kotlin
data class ProblemDetail(
    val type: String = "about:blank",
    val title: String,
    val status: Int,
    val detail: String? = null,
    val instance: String? = null,
    val extensionData: Map<String, Any>? = null
)
```

- `type` — a stable error identifier.
- `title` — a short human-readable summary.
- `status` — the HTTP status code.
- `detail` — an explanatory message.
- `instance` — the request URI that produced the error.
- `extensionData` — arbitrary extra context (rendered via `@JsonAnyGetter`).

## Built-in exception mappings

The handler registers the following mappings automatically:

| Exception / status | HTTP status | `type` | Notes |
|--------------------|-------------|--------|-------|
| `ResourceMissingException` | 404 | `RESOURCE_MISSING` | Includes `entity_type`, `identifier`, `identifier_type` |
| `ErrorCodeException` | 422 | `errorCode.code` | Uses the wrapped `ErrorCode` |
| `ValidationException` | 400 | `VALIDATION_ERROR` | Includes `validation` errors map |
| `IllegalArgumentException` | 400 | `BAD_REQUEST` | |
| `HttpStatusCode.NotFound` | 404 | `about:blank` | Static resource not found |
| `HttpStatusCode.MethodNotAllowed` | 405 | `about:blank` | |
| `Throwable` | 500 | `INTERNAL_SERVER_ERROR` | Logs the stack trace |

## Domain error codes

Define domain errors as an enum implementing `ErrorCode`:

```kotlin
import io.github.ktor_batterypack.core.exception.ErrorCode

enum class UserErrorCode(override val code: String, override val message: String) : ErrorCode {
    EMAIL_ALREADY_EXISTS("EMAIL_ALREADY_EXISTS", "User with email %s already exists"),
    INVALID_STATUS_TRANSITION("INVALID_STATUS_TRANSITION", "Cannot transition from %s to %s")
}
```

Throw them with `ErrorCodeException`:

```kotlin
import io.github.ktor_batterypack.core.exception.ErrorCodeException

throw ErrorCodeException(UserErrorCode.EMAIL_ALREADY_EXISTS, email)
```

The exception formats the message with the supplied arguments and the handler returns a 422 `ProblemDetail` whose `type` is the error code.

## Missing resources

Use `ResourceMissingException` when an entity cannot be found:

```kotlin
import io.github.ktor_batterypack.core.exception.ResourceMissingException

val user = userRepository.findById(id)
    ?: throw ResourceMissingException(User::class.java, id)
```

The handler returns a 404 response with entity type and identifier in `extensionData`.

## Custom exception handlers

To extend or replace the default handler, provide your own `KtorExceptionHandler` bean or register additional handlers in `StatusPages`. The default handler is a Koin `@Singleton`, so you can also subclass it and override `register`.

```kotlin
@Singleton
class MyExceptionHandler(jsonMapper: JsonMapper) : KtorExceptionHandler(jsonMapper) {

    override fun register(it: StatusPagesConfig) {
        super.register(it)
        it.exception<MyBusinessException> { call, cause ->
            call.respond(
                HttpStatusCode.BadRequest,
                ProblemDetail(
                    type = "MY_BUSINESS_ERROR",
                    title = "Business rule violation",
                    status = 400,
                    detail = cause.message,
                    instance = call.request.uri
                )
            )
        }
    }
}
```
