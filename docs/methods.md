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
