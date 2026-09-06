# Calculation methods

Core algorithms are versioned in `packages/core/model.ts`. Each activity stores its parameters and calculation version. Missing measurements remain absent; load needs user thresholds. Fixture values in tests are synthetic.

- Weighted power is the fourth root of the mean fourth power of complete 30-second moving averages. Samples are held for their recorded interval, up to 30 seconds; longer gaps invalidate affected windows. This is Kinetexa's implementation, not a claim of equivalence to a proprietary service.
- Power load is elapsed hours times squared weighted-power/FTP intensity times 100. One hour at a constant FTP is 100 points.
- Heart-rate impulse uses duration in minutes times heart-rate reserve times `0.64 * exp(1.92 * reserve)`. This fixed Banister-style coefficient is not individualized. Both resting and maximum HR must be configured. Source: [Banister model context](https://pubmed.ncbi.nlm.nih.gov/1921674/). Verification of the reference and additional published fixtures remains a release gate.
- Fitness and fatigue use exponential daily decay with 42-day and 7-day constants. Form is prior-day fitness minus fatigue. Zero initialization underestimates state until enough history exists. An unmeasured activity is not evidence of a rest day; the UI must disclose missing load.
- Efficiency is mean power or speed divided by mean HR. Decoupling compares first-half and second-half efficiency, for activities at least 20 minutes long. Intervals, stops, terrain and heat can invalidate its interpretation.
- Best power and speed efforts use complete elapsed-time windows. Running distance efforts interpolate the final distance crossing. Corrupt distance streams and record exclusion require additional validation before launch.
- Zone time uses the previous measurement over each recorded interval, excluding gaps above 30 seconds. The highest boundary belongs to the next zone. Boundaries must increase.

The test suite checks analytic constant-signal cases, missing data, recording gaps and decay. This does not yet constitute the complete scientific validation required by ANALYTICS-011.

## Canonical source fidelity

FIT sessions, TCX activities and GPX tracks are imported as independent canonical activities. Each part retains the same original object/checksum and its part index. FIT samples and laps are restricted to that session's time range; a shared boundary timestamp belongs to the later session. Multi-session stream distances start at the first recorded point, while session totals retain the source's summary distance. Reprocessing a legacy multi-activity import preserves the edited first activity's ID and creates the missing later parts.

Canonical timestamps retain UTC start, local start, numeric UTC offset and the source of that timezone interpretation. An explicit numeric XML offset is preserved. Otherwise, the athlete's timezone at processing time supplies a DST-aware local interpretation; this is labeled as a preference, not inferred recording geography. Reprocessing updates that interpretation using the current preference.

Vertical speed is metres/second, taken from FIT where present or derived from consecutive altitude points no more than 30 seconds apart. Running/walking pace is seconds/kilometre. FIT running dynamics retain profile names and units: vertical oscillation and step length in millimetres, stance time in milliseconds, and ratios/balance in percent. Cycling dynamics and decoded source fields retain the parser's profile-scaled values. Device and developer-field definitions accompany the canonical data. Unsupported decoder fields remain recoverable from the unchanged original.

`processing:canonical` issues an owner-authorized, short-lived download of the complete canonical stream, including decoded source fields. The bounded `processing:stream` view omits those extra raw fields to keep chart responses small. Neither is a public-share endpoint.

## Imported health signals

FIT field names, scale factors and units follow the installed `fit-file-parser` 5.0.2 SDK profile. Resting HR, HRV, weight and maximum metabolic/VO₂ estimates retain their reported units. Walking/running monitoring cycles convert to steps according to the profile's half-step scale; other activity types do not become steps.

Recorded sleep duration sums observed light/deep/REM intervals that close with an awake record. Unknown states, gaps above twelve hours and an open final interval are omitted. This is recorded coverage, not an assertion that a whole night was measured. Closed intervals are assigned to their ending date in the athlete's timezone. Within one imported file, closed intervals on that date are summed and cumulative step counters use the maximum.

The daily view selects the latest physiological reading and the highest step counter. It never adds different devices together. Multiple health files may overlap; source names remain available for inspection. AI health trends use the same daily selection before calculating averages. Turning health processing off affects future imports and preserves existing history.
