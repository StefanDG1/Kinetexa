# Reused libraries

The lockfile pins the installed dependency graph. The root is AGPL-3.0-only. The application reuses maintained libraries rather than implementing binary formats, XML, compression, authentication, charts or maps itself.

| Library                | License    | Use                                                            |
| ---------------------- | ---------- | -------------------------------------------------------------- |
| fit-file-parser 5.0.2  | MIT        | FIT decoding, including developer fields retained in originals |
| fast-xml-parser 5.11.1 | MIT        | TCX/GPX parsing, with DTD/entity rejection before parsing      |
| fflate 0.8.3           | MIT        | Bounded ZIP and gzip decompression                             |
| convex-test 0.0.56     | Apache-2.0 | Backend authorization tests                                    |
| csv-parse 7.0.2        | MIT        | Strava migration CSV with quoted/multiline fields              |
| Svix 2.3.0             | MIT        | Signed Resend webhook verification                             |
| @vercel/otel 2.1.3     | Apache-2.0 | Server request tracing                                         |
| Zod                    | MIT        | Canonical and query validation                                 |
| AWS SDK                | Apache-2.0 | Private R2 objects and short-lived signed access               |
| Barlow, Source Sans 3  | OFL-1.1    | Locally served typefaces                                       |

Versions and licenses were checked through npm metadata and installed package files on 6 September 2026. A complete transitive license inventory and release SBOM remain release checks. Garmin's proprietary SDK was not added; its special license would need separate review.
