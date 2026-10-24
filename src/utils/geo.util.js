const geolib = require('geolib');

/**
 * Geolocation & Face Descriptor Utility
 */

// Calculate Haversine distance in meters
const calculateDistanceMeters = (lat1, lng1, lat2, lng2) => {
  try {
    return geolib.getDistance(
      { latitude: Number(lat1), longitude: Number(lng1) },
      { latitude: Number(lat2), longitude: Number(lng2) }
    );
  } catch (error) {
    // Pure JS Haversine fallback
    const R = 6371e3; // Earth radius in meters
    const toRad = (val) => (val * Math.PI) / 180;
    const phi1 = toRad(lat1);
    const phi2 = toRad(lat2);
    const deltaPhi = toRad(lat2 - lat1);
    const deltaLambda = toRad(lng2 - lng1);

    const a =
      Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(R * c);
  }
};

// Check if point is within geofence radius
const isPointWithinRadius = (officeLat, officeLng, clientLat, clientLng, radiusMeters) => {
  const distance = calculateDistanceMeters(officeLat, officeLng, clientLat, clientLng);
  return {
    isWithin: distance <= radiusMeters,
    distanceMeters: distance
  };
};

// Euclidean distance between two 128-float face descriptors (threshold < 0.6 is a match)
const compareFaceDescriptors = (desc1, desc2) => {
  if (!Array.isArray(desc1) || !Array.isArray(desc2) || desc1.length !== desc2.length) {
    return { matched: false, distance: 1.0 };
  }
  let sum = 0;
  for (let i = 0; i < desc1.length; i++) {
    const diff = desc1[i] - desc2[i];
    sum += diff * diff;
  }
  const distance = Math.sqrt(sum);
  return {
    matched: distance < 0.6,
    distance: Number(distance.toFixed(4))
  };
};

module.exports = {
  calculateDistanceMeters,
  isPointWithinRadius,
  compareFaceDescriptors
};
