# Methodology

This document describes exactly how the Seattle Walkability Index is computed and where it can mislead. The index is a transparent proxy, not an authoritative measurement.

## 1. Grid

Seattle is divided into Uber H3 hexagons at resolution 9 (about 0.093 square km per hex, roughly a 300 meter span). The grid is the set of H3 cells whose centers fall inside the city's neighborhood polygons, so it follows the shoreline and excludes open water. Each hex is also labeled with the neighborhood whose polygon first covered it, which drives the neighborhood rollup. The result is about 2,300 hexes across the 90 Seattle neighborhoods in the source boundary file.

## 2. Factors

Eight factors are aggregated onto each hex from OpenStreetMap, fetched through the Overpass API for the Seattle bounding box.

| Factor | OSM features | Aggregation |
| --- | --- | --- |
| Sidewalks | footways and sidewalk-tagged ways | length in meters of segments whose midpoint falls in the hex |
| Paths and trails | paths, steps, pedestrian ways | length in meters |
| Bike lanes | cycleways and lane/track cycleway tags | length in meters |
| Parks and green | park, garden, recreation ground, nature reserve polygons | area in square meters, via a fine resolution-10 polyfill attributed to the resolution-9 parent |
| Tree canopy | natural=tree nodes | count |
| Destinations | shops and food, civic, and cultural amenities | count |
| Transit access | bus stops, rail stations, transit platforms | count |
| Crossings | marked crossings and pedestrian signals | count |

Line features add their length to the hex containing each segment midpoint. Point features are counted in the hex that contains them. Park polygons are filled at resolution 10 and the covered area is summed back to the resolution-9 parent, which approximates park area per hex without a polygon clipping library.

## 3. Normalization

Every factor is converted to an empirical percentile rank in 0 to 1 across all hexes (ties share the average rank). Percentile rank is what "relative to Seattle" means here: a hex at 0.9 on sidewalks has more sidewalk length than 90 percent of Seattle hexes. Percentile rank is robust to outliers, so no winsorizing is applied.

## 4. Score

The base score for a hex is the weighted sum of its normalized factors, divided by the sum of the weights so the base stays in 0 to 1:

```
base = ( sum over factors of weight_f * norm_f ) / ( sum of weights )
```

Two multiplicative scalers then adjust the base:

```
slope_scaler   = 1 - slopeStrength   * norm_slope
traffic_scaler = 1 - trafficStrength * norm_road_fast
adjusted = base * slope_scaler * traffic_scaler
```

- `norm_slope` is the percentile rank of the hex's slope. Slope is the maximum absolute grade, in percent, from the hex center to any neighboring hex center, computed from sampled elevations. Steeper hexes lose more score as `slopeStrength` rises.
- `norm_road_fast` is the percentile rank of high-speed road length in the hex. A road segment counts as high-speed at 30 mph or more, read from its `maxspeed` tag or, when untagged, from a default by road class. More high-speed road exposure lowers the score as `trafficStrength` rises.

The default weights are sidewalks 0.30, destinations 0.16, parks 0.16, paths 0.10, transit 0.08, bike 0.08, trees 0.07, crossings 0.05, with slope strength 0.5 and traffic strength 0.3. All are adjustable in the interface, and the slider model is the point: there is no single correct walkability number.

Finally the adjusted scores are rank-normalized again to 0 to 100 across whichever layer is shown (hexes or neighborhoods), so the displayed score is always a percentile relative to Seattle. This recomputation happens live in the browser whenever a weight or scaler changes.

## 5. Weighting profiles and the slider model

The map loads with a default profile, "Balanced," that leads with pedestrian infrastructure (sidewalks, paths, crossings) and destinations, because those are what make walking both possible and worthwhile, and treats parks, trees, transit, and bike lanes as supporting amenities. It is a starting opinion, not a finding.

Four other named profiles re-express walkability from a different point of view, switchable in one click:

- Everyday Errands: leads with destinations and safe crossings for getting daily needs on foot.
- Transit First: leads with transit access plus the sidewalks and crossings to reach stops.
- Stroller and Wheels: maximizes the slope and traffic-calm penalties and leads with sidewalks and crossings, for strollers, wheelchairs, and walking with children.
- Leafy Stroll: leads with parks, trees, and trails with a strong traffic-calm penalty, for quiet recreational walking.

Every profile is just a starting set of weights. Opening "Customize weights" reveals the eight factor sliders and the two scaler sliders; moving any of them switches the active profile to "Custom" without losing your values, and selecting any named profile writes its values back into the sliders. The map recolors live either way, so the index always reflects your definition of walkability.

## 6. Deliberate choices and limitations

- No crime factor. The original project included a crime-density scaler. Crime-based walkability adjustments encode well-documented bias and can penalize neighborhoods for reasons unrelated to whether walking there is pleasant or safe underfoot, so this rebuild omits it rather than ship a biased signal. Traffic safety is represented instead through the calm-traffic scaler and the crossings factor.
- OpenStreetMap completeness. OSM sidewalk and amenity coverage in Seattle is good but not exhaustive. Areas where volunteers have mapped less will score lower than reality, and very recently built infrastructure may be missing.
- Mapped trees are not canopy. The tree factor counts OSM `natural=tree` point nodes, and volunteers have mapped trees in only a minority of the city: in the current snapshot 1,649 of 2,332 hexes (71 percent) contain zero mapped trees. The factor therefore measures mapping activity as much as actual trees, which is why the interface labels it "Mapped trees (OSM)". Seattle's own SDOT tree inventory and the 2021 canopy raster are roughly an order of magnitude more complete and would be better substitutes.
- Slope is modeled, not surveyed. Elevations are sampled at hex centers from a global elevation model and slope is the grade between neighboring hex centers, so it captures broad hilliness, not block-level steepness or stairs.
- Midpoint assignment for lines. A long road or sidewalk segment is credited entirely to the hex containing its midpoint, which is accurate at this hex size but can misplace a small amount of length for unusually long segments.
- Park area is approximate. The resolution-10 polyfill estimates park coverage per hex rather than computing exact clipped polygon area. Multipolygon parks with complex holes are handled only by their outer rings.
- Percentile scores are relative. A score of 50 means median for Seattle, not a fixed amount of infrastructure. The same physical block would score differently in a city with different overall walkability.
- Edge hexes. Hexes on the city edge can have fewer mapped neighbors for slope and can be partly over water or city limits, which slightly affects their length and area sums.

## 7. Sources

- OpenStreetMap contributors, via the Overpass API. Data is licensed under the Open Database License.
- Elevation from the open-meteo elevation API.
- Neighborhood polygons from `seattleio/seattle-boundaries-data`, filtered to the city of Seattle.
- Method inspired by `smileshey/Seattle-Walkability-Index`.
