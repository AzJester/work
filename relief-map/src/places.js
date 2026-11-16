// Places the map names, the skylines it builds and the tours it flies.
// Coordinates are [longitude, latitude]. Population is the metropolitan area in millions, rounded.
export const CITIES = [
  ['New York', -74.006, 40.713, 19.5], ['Los Angeles', -118.244, 34.052, 12.8], ['Chicago', -87.63, 41.878, 9.3], ['Dallas', -96.797, 32.777, 8.1],
  ['Houston', -95.369, 29.76, 7.5], ['Washington', -77.037, 38.907, 6.3], ['Philadelphia', -75.165, 39.953, 6.2], ['Atlanta', -84.388, 33.749, 6.3],
  ['Miami', -80.27, 25.79, 6.2], ['Phoenix', -112.074, 33.448, 5.1], ['Boston', -71.059, 42.36, 4.9], ['San Francisco', -122.419, 37.775, 4.6],
  ['Detroit', -83.046, 42.331, 4.3], ['Seattle', -122.332, 47.606, 4.0], ['Minneapolis', -93.265, 44.978, 3.7], ['San Diego', -117.161, 32.716, 3.3],
  ['Tampa', -82.457, 27.951, 3.3], ['Denver', -104.99, 39.739, 3.0], ['St. Louis', -90.199, 38.627, 2.8], ['Charlotte', -80.843, 35.227, 2.8],
  ['Orlando', -81.379, 28.538, 2.8], ['San Antonio', -98.494, 29.424, 2.7], ['Portland', -122.676, 45.515, 2.5], ['Pittsburgh', -79.996, 40.441, 2.4],
  ['Las Vegas', -115.14, 36.17, 2.3], ['Austin', -97.743, 30.267, 2.5], ['Cincinnati', -84.512, 39.103, 2.3], ['Kansas City', -94.579, 39.1, 2.2],
  ['Cleveland', -81.694, 41.499, 2.2], ['Nashville', -86.781, 36.163, 2.1], ['Indianapolis', -86.158, 39.768, 2.1], ['Salt Lake City', -111.891, 40.761, 1.3],
  ['New Orleans', -90.072, 29.951, 1.3], ['Oklahoma City', -97.516, 35.468, 1.4], ['Memphis', -90.049, 35.15, 1.3], ['Albuquerque', -106.65, 35.084, 0.9],
  ['Omaha', -95.934, 41.257, 1.0], ['Boise', -116.202, 43.615, 0.8], ['El Paso', -106.485, 31.762, 0.9], ['Buffalo', -78.878, 42.886, 1.2],
  ['Milwaukee', -87.906, 43.039, 1.6], ['Jacksonville', -81.656, 30.332, 1.7], ['Raleigh', -78.638, 35.78, 1.5], ['Billings', -108.5, 45.783, 0.2],
].map(([name, lon, lat, pop]) => ({ kind: 'city', name, lon, lat, pop }));

// Summit elevations in metres.
export const PEAKS = [
  ['Mount Whitney', -118.292, 36.578, 4421], ['Mount Elbert', -106.445, 39.118, 4401], ['Mount Rainier', -121.76, 46.853, 4392], ['Mount Shasta', -122.195, 41.409, 4322],
  ['Pikes Peak', -105.044, 38.84, 4302], ['Grand Teton', -110.802, 43.741, 4199], ['Gannett Peak', -109.654, 43.184, 4209], ['Kings Peak', -110.373, 40.776, 4123],
  ['Wheeler Peak', -105.417, 36.557, 4013], ['Granite Peak', -109.807, 45.163, 3904], ['Borah Peak', -113.781, 44.137, 3859], ['Humphreys Peak', -111.678, 35.346, 3852],
  ['Mount Hood', -121.696, 45.374, 3429], ['Guadalupe Peak', -104.861, 31.891, 2667], ['Black Elk Peak', -103.532, 43.866, 2208], ['Mount Mitchell', -82.265, 35.765, 2037],
  ['Mount Washington', -71.303, 44.27, 1917], ['Mount Marcy', -73.924, 44.113, 1629], ['Katahdin', -68.921, 45.904, 1606],
].map(([name, lon, lat, elev]) => ({ kind: 'peak', name, lon, lat, elev }));

export const FEATURES = [
  ['Grand Canyon', -112.3, 36.15], ['Yellowstone', -110.5, 44.6], ['Death Valley', -116.87, 36.3], ['Great Salt Lake', -112.5, 41.15],
  ['Lake Superior', -87.6, 47.6], ['Lake Michigan', -87.0, 43.9], ['Lake Huron', -82.4, 44.8], ['Lake Erie', -81.2, 42.2], ['Lake Ontario', -77.8, 43.65],
  ['Mississippi Delta', -89.4, 29.3], ['Everglades', -80.9, 25.6], ['Great Plains', -100.6, 41.3], ['Sonoran Desert', -112.9, 32.6], ['Mojave Desert', -116.0, 35.1],
  ['Great Basin', -116.5, 39.8], ['Colorado Plateau', -110.3, 37.3], ['Sierra Nevada', -119.3, 37.6], ['Cascade Range', -121.7, 44.0], ['Rocky Mountains', -106.6, 40.3],
  ['Appalachian Mountains', -80.7, 37.6], ['Ozarks', -92.9, 36.4], ['Black Hills', -103.8, 44.2], ['Chesapeake Bay', -76.2, 38.2], ['Cape Cod', -70.2, 41.85],
  ['Florida Keys', -81.1, 24.72], ['Gulf of Mexico', -91.0, 27.9], ['Atlantic Ocean', -74.7, 35.2], ['Pacific Ocean', -125.2, 40.4], ['Central Valley', -120.6, 37.0],
  ['Columbia River', -119.9, 45.75], ['Missouri River', -100.6, 46.1], ['Mississippi River', -90.6, 34.0], ['Ohio River', -86.6, 38.05], ['Rio Grande', -101.0, 29.6],
  ['Colorado River', -114.5, 34.2], ['Lake Tahoe', -120.03, 39.1], ['Adirondacks', -74.4, 43.9], ['Olympic Mountains', -123.7, 47.8], ['Texas Hill Country', -99.2, 30.3],
].map(([name, lon, lat]) => ({ kind: 'feature', name, lon, lat }));

// Camera tours: where to look, from how far, from which compass bearing (degrees, 0 looks north) and how steeply (degrees above the horizon).
export const TOURS = [
  { id: 'overview', name: 'Whole map', lon: -96.6, lat: 37.9, dist: 1300, bearing: 2, pitch: 37 },
  { id: 'rockies', name: 'Rocky Mountains', lon: -106.3, lat: 39.0, dist: 250, bearing: 38, pitch: 23 },
  { id: 'canyon', name: 'Grand Canyon', lon: -112.1, lat: 36.2, dist: 170, bearing: 35, pitch: 30 },
  { id: 'sierra', name: 'Sierra Nevada', lon: -119.1, lat: 37.3, dist: 230, bearing: 62, pitch: 22 },
  { id: 'lakes', name: 'Great Lakes', lon: -85.2, lat: 44.6, dist: 420, bearing: 340, pitch: 34 },
  { id: 'newyork', name: 'New York', lon: -74.1, lat: 40.75, dist: 150, bearing: 320, pitch: 24 },
  { id: 'appalachia', name: 'Appalachians', lon: -81.2, lat: 36.8, dist: 260, bearing: 40, pitch: 26 },
  { id: 'delta', name: 'Mississippi Delta', lon: -90.2, lat: 30.2, dist: 230, bearing: 350, pitch: 30 },
  { id: 'cascades', name: 'Pacific Northwest', lon: -121.9, lat: 46.3, dist: 240, bearing: 60, pitch: 24 },
];
