# Calculation methods

Core algorithms are versioned in `packages/core/model.ts`. Each activity stores its parameters and calculation version. Missing measurements remain absent; load needs user thresholds. Fixture values in tests are synthetic.

- Weighted power is the fourth root of the mean fourth power of complete 30-second moving averages. Samples are held for their recorded interval, up to 30 seconds; longer gaps invalidate affected windows. This is Kinetexa's implementation, not a claim of equivalence to a proprietary service.
- Power load is elapsed hours times squared weighted-power/threshold intensity times 100. Cycling uses FTP; running requires its separate `runningFtp`. One hour at a constant sport-appropriate threshold is 100 points. Stream-derived load requires at least 90% elapsed-time coverage; this is an explicit product quality threshold, not a physiological constant.
- Heart-rate impulse uses duration in minutes times heart-rate reserve times `0.64 * exp(1.92 * reserve)`. This fixed Banister-style coefficient is not individualized. Both resting and maximum HR must be configured. Model context: [Morton, Fitz-Clarke and Banister (1990)](https://pubmed.ncbi.nlm.nih.gov/2246166/); limitations and alternative TRIMP models: [Halson (2014)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4213373/). The previously recorded PMID linked to an unrelated feeding study and was corrected during the source audit. These references establish context, not independent validation of every implementation detail.
- Fitness and fatigue use exponential daily decay with 42-day and 7-day constants. Form is prior-day fitness minus fatigue. Zero initialization underestimates state until enough history exists. Missing activity load makes subsequent fitness/fatigue unavailable until the inputs are repaired; it is not converted into a rest day. Monotony/strain are unavailable when the seven-day window contains missing activity load.
- Efficiency divides sport-appropriate output by HR over paired recorded intervals, requiring at least 90% paired coverage. Decoupling compares each half's paired efficiency, requires 20 minutes and 90% coverage per half, and rejects output coefficient of variation above 0.30. These eligibility rules are explicit quality filters, not proof that the effort was physiologically steady. Terrain and heat can still invalidate interpretation.
- Best power and speed efforts use complete elapsed-time windows. Running distance efforts use linear distance interpolation and consider intervals anchored at either a recorded start or a recorded end. They never cross a recording break, missing distance, distance reset, non-increasing time or gap above 30 seconds. Corrupt distance streams and record exclusion require additional validation before launch.
- Zone time uses the previous measurement over each recorded interval, excluding gaps above 30 seconds. The highest boundary belongs to the next zone. Boundaries must increase.

The test suite checks analytic constant-signal cases, missing data, recording gaps and decay. Independent sample calculations include one hour at threshold = 100 power-load points, and 60 minutes at HR reserve 0.5 = 50.14457228972386 impulse points (computed with high-precision decimal arithmetic from the stated formula). Tests also reject cross-sport thresholds, unpaired sensors and sparse whole-activity extrapolation. Broader real-device reference comparisons remain open; these tests do not establish individualized physiological accuracy.

Selected-interval analysis uses recorded samples inside the requested bounds, reports actual first/last sample times, recomputes all summaries and metrics, and never reuses whole-activity averages. Fewer than two samples yields unavailable results. Whole-activity summaries with gaps are not interpolated into that selection.

## Canonical source fidelity

FIT sessions, TCX activities and GPX tracks are imported as independent canonical activities. Each part retains the same original object/checksum and its part index. FIT samples and laps are restricted to that session's time range; a shared boundary timestamp belongs to the later session. Multi-session stream distances start at the first recorded point, while session totals retain the source's summary distance. Reprocessing a legacy multi-activity import preserves the edited first activity's ID and creates the missing later parts.

Canonical timestamps retain UTC start, local start, numeric UTC offset and the source of that timezone interpretation. An explicit numeric XML offset is preserved. Otherwise, the athlete's timezone at processing time supplies a DST-aware local interpretation; this is labeled as a preference, not inferred recording geography. Reprocessing updates that interpretation using the current preference.

Vertical speed is metres/second, taken from FIT where present or derived from consecutive altitude points no more than 30 seconds apart. Running/walking pace is seconds/kilometre. FIT running dynamics retain profile names and units: vertical oscillation and step length in millimetres, stance time in milliseconds, and ratios/balance in percent. Cycling dynamics and decoded source fields retain the parser's profile-scaled values. Device and developer-field definitions accompany the canonical data. Unsupported decoder fields remain recoverable from the unchanged original.

`processing:canonical` issues an owner-authorized, short-lived download of the complete canonical stream, including decoded source fields. The bounded `processing:stream` view omits those extra raw fields to keep chart responses small. Neither is a public-share endpoint.

## Imported health signals

FIT field names, scale factors and units follow the installed `fit-file-parser` 5.0.2 SDK profile. Resting HR, HRV, weight and maximum metabolic/VO₂ estimates retain their reported units. Walking/running monitoring cycles convert to steps according to the profile's half-step scale; other activity types do not become steps.

Recorded sleep duration sums observed light/deep/REM intervals that close with an awake record. Unknown states, gaps above twelve hours and an open final interval are omitted. This is recorded coverage, not an assertion that a whole night was measured. Closed intervals are assigned to their ending date in the athlete's timezone. Within one imported file, closed intervals on that date are summed and cumulative step counters use the maximum.

The daily view selects the latest physiological reading and the highest step counter. It never adds different devices together. Multiple health files may overlap; source names remain available for inspection. AI health trends use the same daily selection before calculating averages. Turning health processing off affects future imports and preserves existing history.

## Goal progress revision 1.1.0

Goal progress uses only activities starting within the goal period and no later than the calculation time. Recorded distance converts to kilometres and recorded duration to hours. If activities exist but every required measurement is missing or invalid, current progress, percentage and projection are unavailable. Recorded zero remains zero; partial progress sums the measured values and reports missing coverage. With no completed activities in the period, automatic goals have zero observed progress. Manual results remain unavailable until entered. Their evidence cites the entered result and goal rather than unrelated activity records.

Goal evidence uses the same time cutoff as its calculation and records method version `1.1.0`. These values are calculated on request; this correction does not require activity reprocessing. The prior implementation returned zero when all automatic measurements were absent and included future activity references in evidence.

## Activity calculation revision 0.4.0-alpha.2

Best-distance detection previously considered only starts on recorded samples. It could miss a faster interval whose start falls between samples and whose end is recorded. The corrected two-pass scan considers both endpoint cases while retaining the same gap exclusions. In the independent fixture with consecutive speeds of 3, 6, 10 and 3 m/s over 30-second segments, the fastest 400 m ends at 90 seconds and takes `100/6 + 300/10 = 46.6666666667` seconds. The old result was 52 seconds. Interpolation still estimates motion between recorded points; this does not establish timing accuracy beyond the underlying recording. Reprocess retained activities to publish the correction, keeping prior calculation versions in history.

## Parser and normalization revision 0.4.0-alpha.4

XML records now stream through `sax` instead of retaining a complete parsed tree twice. Standard escaped XML text decodes correctly; namespace prefixes, extensions, per-part metadata, source offsets and recording breaks remain supported. Normalization validates the canonical object directly, avoiding a complete JSON round trip. Empty XML extension objects are omitted when the source has none. Canonical object upload streams sample batches without retaining the whole serialized file. Activity formulas are unchanged from `0.4.0-alpha.2`; stored parser/normalization and result versions identify this new processing path.
