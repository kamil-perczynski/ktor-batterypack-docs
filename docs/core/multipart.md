# Multipart Uploads

`ktor-batterypack-core` provides `MultipartParser` — a small helper that turns a raw Ktor `MultiPartData` into a list of validated, in-memory files. You hand it the multipart body and a part-count limit; it enforces the content-type allow-list and the size cap from configuration, and every violation leaves as a plain `400` from the global handler.

It replaces the hand-rolled `forEachPart` loop that every Ktor application eventually writes — content-type checks, size checks, part disposal. What it deliberately does not do: form fields (the parser is file-only, see below) and streaming (files land in memory as `ByteArray`s).

## The parser

```kotlin
import io.github.ktor_batterypack.core.ktor.KtorController
import io.github.ktor_batterypack.core.multipart.MultipartParser
import io.ktor.server.application.call
import io.ktor.server.request.receiveMultipart
import io.ktor.server.response.respond
import io.ktor.server.routing.Routing
import io.ktor.server.routing.post
import org.koin.core.annotation.Singleton

@Singleton
class UploadController(private val multipartParser: MultipartParser) : KtorController {

    override fun register(routing: Routing) {
        routing.post("/upload") {
            val multipart = call.receiveMultipart()
            val uploads = multipartParser.parseUploads(multipart, maxParts = 5)

            for (upload in uploads) {
                storeFile(upload.filename, upload.bytes)
            }

            call.respond(mapOf("uploaded" to uploads.size))
        }
    }
}
```

```
$ curl -F "file=@photo.jpg" http://localhost:8080/upload
{"uploaded":1}
```

Each returned `MultipartUpload` carries the client's `filename` (falling back to `"upload"` when absent), the declared `contentType`, and the file `bytes`.

## Limits

Three limits protect the endpoint. Every violation is an `IllegalArgumentException`, which the global handler maps to a `400` `ProblemDetail` — see [Exception Handling](/core/exceptions) for the response shape.

| Limit | Default | Violation message |
|-------|---------|-------------------|
| Part count | per call — `parseUploads(multipart, maxParts)` | `Too many files uploaded. Maximum allowed is 5.` |
| File size | 5 MB (`5242880` bytes) | `File size exceeds the maximum allowed size of 5242880` |
| Content type | `image/jpeg`, `image/png`, `image/webp` | `Unsupported content type: text/plain` |

The part count is an argument rather than configuration on purpose: how many files an endpoint accepts is an endpoint decision. Size and content types are deployment-wide, so they come from the `ktor.multipart` tree — and reach the parser through the `KtorProps` bean, the usual convention that beans consume props, never files ([Dependency Injection](/core/dependency-injection)):

```yaml
ktor:
  multipart:
    maxFileSizeBytes: 10485760   # 10 MB
    allowedContentTypes:
      - image/jpeg
      - image/png
      - image/webp
```

The allow-list replaces the default wholesale — an empty list rejects every part that declares a content type. Content types are compared by type and subtype, case-insensitively; a part with no content type passes, because Ktor cannot always infer one.

## What it does not do

- **Files only.** Form fields are not returned — the parser logs a warning per field (`Received unsupported part type: FormItem`) and disposes it. A multipart body can be read once, so if you need files *and* fields, iterate the parts yourself instead of calling the parser.
- **Memory, not disk.** Each file is fully read into memory before the size check runs — the cap bounds what the parser *accepts*, not what the JVM buffers. Worst case per request is `maxParts × maxFileSizeBytes` of heap: with `maxParts = 5` and the default 5 MB cap, 25 MB. A request-size limit at the reverse proxy (nginx `client_max_body_size`, for example) keeps hostile uploads away from the JVM.
- **Client data stays client data.** `contentType` is the declared header, not verified magic bytes — a renamed text file passes as `image/jpeg`. And `filename` is client-supplied: never use it as a filesystem path without sanitizing it first.
