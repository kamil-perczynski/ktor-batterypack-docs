# Exception Handling

Exception handling is part of the Core bootstrap. `configureKtorServer` installs Ktor's `StatusPages` plugin with `KtorExceptionHandler`, which turns every failure — a rejected request body, a missing resource, a broken business rule, or an unhandled `Throwable` — into an RFC 7807 `ProblemDetail` JSON response.

It makes three things easy:

- **Throwing from anywhere.** Services, repositories, and controllers throw typed exceptions; no route needs a try/catch.
- **Stable error codes.** Every response carries a machine-readable `type` field (`INVALID_USER_AGE`, `RESOURCE_MISSING`) that clients can branch on.
- **One error shape.** Every endpoint fails the same way, so client-side error handling is written once.

The handler set is built on Ktor's own `StatusPages` — Batterypack pre-configures it during bootstrap. Validation errors originate in [JsonBinder](/core/request-binding) and the [Validation](/validation/validation) module. What it deliberately does not do: message localization, and custom exception-to-response mappings — see [Advanced: discovery and limits](#advanced-discovery-and-limits).

## How it is wired

Inside `configureKtorServer` (see [Core](/core/)):

```kotlin
val ktorExceptionHandler: KtorExceptionHandler = koin.get()

install(StatusPages) {
    ktorExceptionHandler.register(this)
}
```

`register` installs seven handlers: four exception mappings, two status mappings (404 and 405), and a `Throwable` fallback. The sections below cover each of them.

Exception handling is on as soon as you bootstrap with `configureKtorServer`. There is no setup step and no configuration.

## The error response format

All error responses are `ProblemDetail` — the RFC 7807 "Problem Details for HTTP APIs" model:

| Field | Meaning |
|-------|---------|
| `type` | Stable error identifier — an `ErrorCode` code such as `INVALID_USER_AGE`, or a fixed token such as `RESOURCE_MISSING` |
| `title` | Short human summary, e.g. `"Not Found"` |
| `status` | HTTP status, repeated so problem-details clients don't need to parse headers |
| `detail` | Human-readable explanation of this occurrence |
| `instance` | URI of the failed request |
| *extensions* | Extra fields, flattened into the top level — e.g. `identifier` on missing-resource errors |

For a request to a route that doesn't exist:

```bash
curl -i http://localhost:8080/nope
```

```json
{
  "type": "about:blank",
  "title": "Not Found",
  "status": 404,
  "detail": "The requested static resource was not found",
  "instance": "/nope"
}
```

Two serialization details are worth knowing:

- Extension data is serialized with Jackson's `@JsonAnyGetter`, so it lands as top-level JSON properties — `identifier`, not `extension_data.identifier`. See the [missing resources](#missing-resources-resourcemissingexception) example below.
- `ProblemDetail` is annotated `@JsonInclude(NON_NULL)`: fields with no value are omitted entirely. Different error types produce different shapes.

`about:blank` is the RFC 7807 default for `type` — it means "no specific error code for this".

## Business rules: `ErrorCode` and `ErrorCodeException`

This is the mapping you use for your own error cases. Define the error as an `ErrorCode` — a stable `code` plus a human-readable `message` template:

```kotlin
interface ErrorCode {
    val code: String
    val message: String
}
```

The [example application](/example/) implements it on an enum. The message is a `String.format` template; the code is the enum constant name:

```kotlin
enum class UserErrorCode(override val message: String) : ErrorCode {
    INVALID_USER_AGE("User age must be greater than 0, lower than 100, current is %s");

    override val code: String get() = name
}
```

Throw it from anywhere in the call stack — here, a domain service guarding a business rule:

```kotlin
private fun checkAge(age: Int) {
    if (age !in 1..<100) {
        throw ErrorCodeException(INVALID_USER_AGE, age)
    }
}
```

`ErrorCodeException` formats the template with the arguments and carries the code:

```kotlin
class ErrorCodeException(val errorCode: ErrorCode, vararg args: Any) :
    RuntimeException(errorCode.message.format(*args))
```

Posting an age outside the allowed range:

```bash
curl -i -X POST http://localhost:8080/users \
  -H 'Content-Type: application/json' \
  -d '{"name":"Eve","age":150}'
```

```json
{
  "type": "INVALID_USER_AGE",
  "title": "Unprocessable Entity",
  "status": 422,
  "detail": "User age must be greater than 0, lower than 100, current is 150",
  "instance": "/users"
}
```

No route, controller, or handler mentions this exception — the service throws, `StatusPages` catches, the response is written.

The `type` field is your public API. Renaming `INVALID_USER_AGE` breaks every client that branches on it.

The formatted `message` is serialized verbatim into `detail` — write it for clients, not for logs.

## Missing resources: `ResourceMissingException`

Adapters throw this when a looked-up entity does not exist:

```kotlin
class ResourceMissingException(
    val clazz: Class<out Any>,
    val identifier: Any,
    val identifierType: String = "id"
) : RuntimeException("${clazz.simpleName} with $identifierType: $identifier is missing")
```

The find-or-throw pattern in the example's repository:

```kotlin
override suspend fun find(id: UInt): User {
    return suspendTransaction(database) {
        val entity = UserEntity.findById(id)
            ?: throw ResourceMissingException(User::class.java, id)
        toUser(entity)
    }
}
```

Requesting a user that was never created:

```bash
curl -i http://localhost:8080/users/99999
```

```json
{
  "type": "RESOURCE_MISSING",
  "title": "Not Found",
  "status": 404,
  "detail": "User with id: 99999 is missing",
  "instance": "/users/99999",
  "entity_type": "User",
  "identifier": 99999,
  "identifier_type": "id"
}
```

The last three fields are the exception's properties, flattened into the top level by `@JsonAnyGetter`.

The 404 for a missing entity and the 404 for a nonexistent route are distinguishable by `type`: `RESOURCE_MISSING` vs `about:blank`.

## The built-in mappings

`KtorExceptionHandler` maps the following exceptions and statuses:

| Exception | Status | `type` | Extensions |
|-----------|--------|--------|------------|
| `ResourceMissingException` | 404 | `RESOURCE_MISSING` | `entity_type`, `identifier`, `identifier_type` |
| `ErrorCodeException` | 422 | the `ErrorCode` code | — |
| `ValidationException` | 400 | `VALIDATION_ERROR` | `validation` |
| `IllegalArgumentException` | 400 | `BAD_REQUEST` | — |
| No matching route | 404 | `about:blank` | — |
| Wrong HTTP method | 405 | `about:blank` | — |
| Any other `Throwable` | 500 | `INTERNAL_SERVER_ERROR` | — |

**`IllegalArgumentException` → 400.** The standard JVM exception for unparseable input. Kotlin's `NumberFormatException` extends it, so failed conversions land on this mapping too. The example's controller parses a path parameter:

```kotlin
routing.get("/users/{id}") {
    val id = call.parameters["id"]?.toUInt() ?: throw IllegalArgumentException("Invalid ID")
    ...
}
```

`GET /users/abc` fails in `"abc".toUInt()` with a `NumberFormatException`, which produces:

```json
{
  "type": "BAD_REQUEST",
  "title": "Bad Request",
  "status": 400,
  "detail": "For input string: \"abc\"",
  "instance": "/users/abc"
}
```

**`ValidationException` → 400.** Thrown by [JsonBinder](/core/request-binding) when a validator rejects the request body or query parameters. The constraint errors ride along under `validation`:

```json
{
  "type": "VALIDATION_ERROR",
  "title": "Validation Failed",
  "status": 400,
  "detail": "Invalid request body",
  "instance": "/users",
  "validation": {
    "name": [
      { "constraint": "NotBlank" }
    ]
  }
}
```

The error tree mirrors the shape of the submitted object. See [Validation Codegen](/validation/validation-codegen#error-output-shape) for the full structure.

400 means the request itself is malformed — validation failed or an argument couldn't be parsed. 422 means the request was well-formed and the domain rejected it.

## Unexpected errors: the `Throwable` fallback

Everything not in the table above ends in the fallback. The client receives a 500 `ProblemDetail` whose `detail` carries the exception's message, or `"An unexpected error occurred"` when it has none:

```json
{
  "type": "INTERNAL_SERVER_ERROR",
  "title": "Internal Server Error",
  "status": 500,
  "detail": "…",
  "instance": "/users"
}
```

You get the full picture on the `KtorExceptionHandler` logger — the request URI plus the stack trace, at ERROR level:

```
2026-09-08 14:03:22.481 ERROR  4123 --- [DefaultDispatche] i.g.k.core.ktor.KtorExceptionHandler : Unhandled exception occurred while processing request to /users
java.lang.IllegalStateException: ...
```

Only unexpected errors are logged. The six 4xx and 405 mappings are silent — they are normal outcomes, not incidents. If you need an audit trail of those, add logging where you throw.

## Advanced: discovery and limits

`KtorExceptionHandler` is a Koin `@Singleton` in `io.github.ktor_batterypack.core.ktor`. It has no factory method in `KtorBatterypackCoreModule` — the module's `@ComponentScan("io.github.ktor_batterypack.core")` picks it up. Its `JsonMapper` is the same bean the rest of the application uses, so error bodies and success bodies serialize under identical rules.

The handler set is fixed. There is no registration point for adding your own exception-to-response mapping, and `StatusPages` is installed exactly once during bootstrap — you cannot install it again elsewhere with extra handlers.

What you can do:

- **Custom `type` codes:** implement `ErrorCode` on your own enum — the code lands in `type`, the status stays 422.
- **404s for missing entities:** throw `ResourceMissingException`.
- **Anything else:** `StatusPages` only sees exceptions you let propagate. Catch locally in the route and `call.respond` yourself — you just lose the uniform shape unless you construct the `ProblemDetail` by hand.

## See also

- [Core](/core/) — bootstrap, `configureKtorServer`, and the module overview
- [Controllers](/core/controllers) — where routes live
- [Request Binding](/core/request-binding) — where `ValidationException` originates
- [Validation](/validation/validation) — constraints, error types, `ValidationException`
- [Validation Codegen](/validation/validation-codegen) — generated validators and the error output shape
