# Reused libraries

The lockfile pins the installed dependency graph. The root is AGPL-3.0-only. The application reuses maintained libraries rather than implementing binary formats, XML, compression, authentication, charts or maps itself.

| Library               | License       | Use                                                                 |
| --------------------- | ------------- | ------------------------------------------------------------------- |
| fit-file-parser 5.0.2 | MIT           | FIT decoding, including developer fields retained in originals      |
| sax 1.6.1             | BlueOak-1.0.0 | Incremental TCX/GPX records, strict syntax and DTD/entity rejection |
| @zip.js/zip.js 2.11.2 | BSD-3-Clause  | ZIP reads with checksum, header, overlap and output-size checks     |
| fflate 0.8.3          | MIT           | Streaming ZIP exports and synthetic archive fixtures                |
| convex-test 0.0.56    | Apache-2.0    | Backend authorization tests                                         |
| csv-parse 7.0.2       | MIT           | Strava migration CSV with quoted/multiline fields                   |
| Svix 2.3.0            | MIT           | Signed Resend webhook verification                                  |
| @vercel/otel 2.1.3    | Apache-2.0    | Server request tracing                                              |
| Zod                   | MIT           | Canonical and query validation                                      |
| AWS SDK               | Apache-2.0    | Private R2 objects and short-lived signed access                    |
| Barlow, Source Sans 3 | OFL-1.1       | Locally served typefaces                                            |

Versions and licenses were checked through npm metadata and installed package files on 6 September 2026. A complete transitive license inventory and release SBOM remain release checks. Garmin's proprietary SDK was not added; its special license would need separate review.

`sax` 1.6.1 was checked against npm metadata and its installed license on 6 September 2026. The package was updated in July 2026 and supports Node >=11. Its [Blue Oak Model License 1.0.0](https://blueoakcouncil.org/license/1.0.0) grants use, modification and distribution with the license text or link. This replaces the full-tree XML dependency; no second XML parser remains. `@types/sax` supplies development types.

`@zip.js/zip.js` 2.11.2 supports Node >=18 and was published in September 2026. Its installed BSD-3-Clause license permits reuse with the license and notices retained. ZIP imports use its strict reader with CRC-32 verification and no web workers. [Reader options](https://gildas-lormeau.github.io/zip.js/api/interfaces/EntryGetDataOptions.html) document the checks. Actual decompressed writes are bounded independently of the ZIP size fields. Gzip activity members use Node's zlib CRC/length validation with a maximum output size.
