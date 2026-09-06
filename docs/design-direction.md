# Design direction

Kinetexa should feel like equipment an athlete wants to use every day. Its visual identity comes from movement through real terrain and a clear view of training over time.

## Tokens

| Role | Color | Purpose |
| --- | --- | --- |
| Snow | `#F7FAFC` | Main background |
| White | `#FFFFFF` | Reading and chart surfaces |
| Marine | `#16384B` | Primary text, navigation and controls |
| Pool | `#147D92` | Training trend and secondary emphasis |
| Persimmon | `#D94A25` | Selected route, primary action and activity focus |
| Mist | `#DCE7EB` | Quiet structural boundaries |

Use orange selectively, avoiding competition between navigation and data. Series also need labels, line styles or symbols so color never carries meaning alone. Validate every text/background pairing for contrast.

Use Barlow for compact, confident headings and Source Sans 3 for interface text, tabular numbers and long explanations. Default labels use sentence case. Alignment and type weight establish hierarchy before borders or containers.

## Layout

Desktop uses a compact navigation rail with a large central workspace. A continuous training timeline anchors Home; recent sessions pair route thumbnails with the measurements relevant to their sport. Activity detail gives the route and synchronized sensor charts most of the space. Maps opens as a map, with a collapsible filter panel and selectable activities. Tables right-align numbers and keep units visible.

Mobile uses bottom navigation and a single reading column. The activity summary precedes touch-friendly map/chart exploration. Advanced controls open on demand without forcing new athletes through configuration first.

```text
Home
navigation | period and sport controls
           | training timeline              | explain training state
           | recent sessions and routes     | goals
           | weekly totals and distributions

Activity
navigation | title, sport, date and primary metrics
           | route                          | selected interval
           | synchronized sensor charts
           | splits, zones and best efforts
           | notes, gear and source details
```

## Design review before implementation

An initial uniform card-grid concept would make the product resemble a generic analytics template. Replace it with a continuous training timeline and layouts suited to each task. Keep the memorable element in actual routes and linked chart interactions. Avoid decorative terrain lines that could be confused with athlete data.

New accounts begin empty. Any optional demonstration dataset must be explicitly selected and labeled, separate from private user records. Missing sensor data produces an explanation rather than a zero or invented reading.

Use restrained motion for interaction feedback. Respect reduced motion, keep keyboard focus visible and provide table summaries for charts. Measure mobile overflow and inspect both compact and wide layouts in a browser.
