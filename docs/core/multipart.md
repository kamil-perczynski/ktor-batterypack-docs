# Multipart Uploads

`ktor-batterypack-core` provides a small helper for parsing and validating multipart file uploads.

## `MultipartParser`

`MultipartParser` reads file parts from a Ktor `MultiPartData`, validates content types and file sizes, and returns a list of `MultipartUpload` objects.

```kotlin
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

## `MultipartUpload`

```kotlin
data class MultipartUpload(
    val filename: String,
    val contentType: ContentType?,
    val bytes: ByteArray
)
```

- `filename` — the original file name from the client.
- `contentType` — the declared MIME type, or `null`.
- `bytes` — the raw file contents.

## Configuration

`MultipartProps` controls the validation rules:

```kotlin
data class MultipartProps(
    val maxFileSizeBytes: Int = 5 * 1024 * 1024,
    val allowedContentTypes: List<String> = listOf(
        "image/jpeg",
        "image/png",
        "image/webp"
    )
)
```

Configure it under `ktor.multipart` in `application.yaml`:

```yaml
ktor:
  multipart:
    maxFileSizeBytes: 10485760
    allowedContentTypes:
      - image/jpeg
      - image/png
      - application/pdf
```

## Validation behavior

`parseUploads` throws `IllegalArgumentException` (mapped to 400 by the global exception handler) when:

- more than `maxParts` file parts are received
- a part's content type is not in `allowedContentTypes`
- a file exceeds `maxFileSizeBytes`

Non-file parts are ignored and disposed.
