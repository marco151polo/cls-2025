// parseLocationHistory.js
// Normalizes different Google Location History JSON formats

var SCALAR_E7 = 0.0000001;

// Remove degree symbols etc. from coordinate strings
function cleanCoord(str) {
  return parseFloat(String(str).replace(/[^0-9.\-]/g, ""));
}

// Convert timestamps into epoch ms
function safeTime(ts) {
  if (!ts) return Date.now();
  if (typeof ts === "number") return ts;
  if (/^\d+$/.test(ts)) return parseInt(ts, 10);
  const parsed = Date.parse(ts);
  return isNaN(parsed) ? Date.now() : parsed;
}

function normalizeLocations(raw) {
  let results = [];

  if (raw.locations) {
    // Old format
    raw.locations.forEach((loc) => {
      results.push({
        lat: loc.latitudeE7 * SCALAR_E7,
        lng: loc.longitudeE7 * SCALAR_E7,
        ts: safeTime(loc.timestampMs || loc.timestamp),
      });
    });
  } else if (raw.timelineObjects) {
    // timelineObjects format
    raw.timelineObjects.forEach((obj) => {
      if (obj.placeVisit?.location) {
        results.push({
          lat: obj.placeVisit.location.latitudeE7 * SCALAR_E7,
          lng: obj.placeVisit.location.longitudeE7 * SCALAR_E7,
          ts: safeTime(obj.placeVisit.duration?.startTimestampMs),
        });
      } else if (obj.activitySegment?.startLocation) {
        results.push({
          lat: obj.activitySegment.startLocation.latitudeE7 * SCALAR_E7,
          lng: obj.activitySegment.startLocation.longitudeE7 * SCALAR_E7,
          ts: safeTime(obj.activitySegment.duration?.startTimestampMs),
        });
      }
    });
  } else if (raw.semanticSegments) {
    // semanticSegments format
    raw.semanticSegments.forEach((seg) => {
      // visit
      if (seg.visit?.topCandidate?.placeLocation?.latLng) {
        const [latStr, lngStr] =
          seg.visit.topCandidate.placeLocation.latLng.split(",");
        results.push({
          lat: cleanCoord(latStr),
          lng: cleanCoord(lngStr),
          ts: safeTime(seg.startTime),
        });
      }

      // timelinePath
      if (Array.isArray(seg.timelinePath)) {
        seg.timelinePath.forEach((p) => {
          if (p.point) {
            const [latStr, lngStr] = p.point.split(",");
            results.push({
              lat: cleanCoord(latStr),
              lng: cleanCoord(lngStr),
              ts: safeTime(p.time) || safeTime(seg.startTime),
            });
          }
        });
      }

      // activity start/end/parking
      if (seg.activity) {
        if (seg.activity.start?.latLng) {
          const [latStr, lngStr] = seg.activity.start.latLng.split(",");
          results.push({
            lat: cleanCoord(latStr),
            lng: cleanCoord(lngStr),
            ts: safeTime(seg.startTime),
          });
        }
        if (seg.activity.end?.latLng) {
          const [latStr, lngStr] = seg.activity.end.latLng.split(",");
          results.push({
            lat: cleanCoord(latStr),
            lng: cleanCoord(lngStr),
            ts: safeTime(seg.endTime),
          });
        }
        if (seg.activity.parking?.location?.latLng) {
          const [latStr, lngStr] =
            seg.activity.parking.location.latLng.split(",");
          results.push({
            lat: cleanCoord(latStr),
            lng: cleanCoord(lngStr),
            ts: safeTime(seg.activity.parking.startTime),
          });
        }
      }
    });
  }

  return results;
}

function handleParsedData(raw, clusterLayer) {
  const locs = normalizeLocations(raw);
  locs.forEach((loc) => {
    const marker = new PruneCluster.Marker(loc.lat, loc.lng);
    marker.data.timestamp = loc.ts;
    const dateStr = new Date(loc.ts).toLocaleString();
    marker.data.popup = "Visited: " + dateStr;
    clusterLayer.RegisterMarker(marker);
  });

  if (locs.length) {
    console.log(
      "Added",
      locs.length,
      "points",
      "first:",
      new Date(locs[0].ts).toISOString(),
      "last:",
      new Date(locs[locs.length - 1].ts).toISOString()
    );
  }

  return locs.length;
}
