// GoIbom MVP map — Leaflet + OpenStreetMap, no API key or card required.

const CATEGORY_ICONS = {
  hotel: '🏨',
  market: '🛒',
  hospital: '🏥',
  attraction: '📍',
  airport: '✈️',
  education: '🎓'
};

let map;
let markers = [];
let allPlaces = [];
let routingControl = null;
let activeCategory = 'all';
let watchId = null;
let userMarker = null;
let lastRerouteTime = 0;
const REROUTE_INTERVAL_MS = 25000; // re-check route every 25s while navigating, not on every GPS tick

function initMap(){
  map = L.map('map').setView([5.0378, 7.9128], 12); // centered on Uyo

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);
}

function makeIcon(category){
  const emoji = CATEGORY_ICONS[category] || '📍';
  return L.divIcon({
    html: `<div style="font-size:22px; transform: translateY(-4px);">${emoji}</div>`,
    className: '',
    iconSize: [30, 30],
    iconAnchor: [15, 15]
  });
}

function buildPopupContent(place){
  const container = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'popup-title';
  title.textContent = `${CATEGORY_ICONS[place.category] || ''} ${place.name}`;
  container.appendChild(title);

  const desc = document.createElement('div');
  desc.className = 'popup-desc';
  desc.textContent = place.description || '';
  container.appendChild(desc);

  if(place.phone){
    const phoneLink = document.createElement('a');
    phoneLink.className = 'popup-phone';
    phoneLink.href = `tel:${place.phone}`;
    phoneLink.textContent = `📞 ${place.phone}`;
    container.appendChild(phoneLink);
  }

  const streetViewLink = document.createElement('a');
  streetViewLink.className = 'popup-streetview';
  streetViewLink.href = `https://www.google.com/maps?layer=c&cbll=${place.lat},${place.lng}`;
  streetViewLink.target = '_blank';
  streetViewLink.rel = 'noopener';
  streetViewLink.textContent = '🌐 Street View';
  container.appendChild(streetViewLink);

  const row = document.createElement('div');
  row.className = 'directions-row';

  const driveBtn = document.createElement('button');
  driveBtn.className = 'directions-btn';
  driveBtn.textContent = '🚗 Drive';
  driveBtn.addEventListener('click', () => getDirectionsTo(place, 'driving'));
  row.appendChild(driveBtn);

  const walkBtn = document.createElement('button');
  walkBtn.className = 'directions-btn walk';
  walkBtn.textContent = '🚶 Walk';
  walkBtn.addEventListener('click', () => getDirectionsTo(place, 'walking'));
  row.appendChild(walkBtn);

  container.appendChild(row);

  return container;
}

function renderMarkers(places, fit = true){
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  places.forEach(place => {
    const marker = L.marker([place.lat, place.lng], { icon: makeIcon(place.category) });
    marker.bindPopup(buildPopupContent(place));
    marker.category = place.category;
    marker.placeId = place.id;
    marker.addTo(map);
    markers.push(marker);
  });

  if(fit) fitMapToMarkers(places);
}

function fitMapToMarkers(places){
  if(places.length === 0) return;

  if(places.length === 1){
    map.setView([places[0].lat, places[0].lng], 15);
    return;
  }

  const bounds = L.latLngBounds(places.map(p => [p.lat, p.lng]));
  map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
}

function applyFilters(){
  const query = document.getElementById('searchInput').value.trim().toLowerCase();

  const filtered = allPlaces.filter(place => {
    const matchesCategory = activeCategory === 'all' || place.category === activeCategory;
    const matchesSearch = !query || place.name.toLowerCase().includes(query);
    return matchesCategory && matchesSearch;
  });

  renderMarkers(filtered);
}

function userLocationIcon(){
  return L.divIcon({
    className: 'user-location-icon',
    html: '<div class="user-dot"><div class="user-dot-pulse"></div></div>',
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
}

function ensureNavSummaryBar(){
  let bar = document.getElementById('navSummary');
  if(!bar){
    bar = document.createElement('div');
    bar.id = 'navSummary';
    bar.innerHTML = `
      <span id="navSummaryText">Getting your location…</span>
      <button id="stopNavBtn">Stop</button>
    `;
    document.body.appendChild(bar);
    document.getElementById('stopNavBtn').addEventListener('click', stopNavigation);
  }
  bar.style.display = 'flex';
  return bar;
}

function updateNavSummary(distanceMeters, timeSeconds, mode){
  const km = (distanceMeters / 1000).toFixed(1);
  const mins = Math.round(timeSeconds / 60);
  const icon = mode === 'walking' ? '🚶' : '🚗';
  document.getElementById('navSummaryText').textContent = `${icon} ${km} km · ${mins} min`;
}

function stopNavigation(){
  if(watchId !== null){
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if(routingControl){
    map.removeControl(routingControl);
    routingControl = null;
  }
  if(userMarker){
    map.removeLayer(userMarker);
    userMarker = null;
  }
  const bar = document.getElementById('navSummary');
  if(bar) bar.style.display = 'none';
}

function getDirectionsTo(place, mode = 'driving'){
  if(!navigator.geolocation){
    alert('Location access is not available on this device/browser.');
    return;
  }

  // Clear any previous navigation session first
  stopNavigation();
  ensureNavSummaryBar();
  document.getElementById('navSummaryText').textContent = 'Getting your location…';

  const routerConfig = mode === 'walking'
    ? { serviceUrl: 'https://routing.openstreetmap.de/routed-foot/route/v1', profile: 'foot' }
    : { serviceUrl: 'https://routing.openstreetmap.de/routed-car/route/v1', profile: 'driving' };

  let firstFix = true;

  watchId = navigator.geolocation.watchPosition(
    position => {
      const from = L.latLng(position.coords.latitude, position.coords.longitude);
      const to = L.latLng(place.lat, place.lng);

      // Move (or create) the live "you are here" indicator
      if(userMarker){
        userMarker.setLatLng(from);
      } else {
        userMarker = L.marker(from, { icon: userLocationIcon(), zIndexOffset: 1000 }).addTo(map);
      }

      const now = Date.now();

      if(firstFix){
        firstFix = false;
        lastRerouteTime = now;

        routingControl = L.Routing.control({
          router: L.Routing.osrmv1(routerConfig),
          waypoints: [from, to],
          routeWhileDragging: false,
          addWaypoints: false,
          draggableWaypoints: false,
          fitSelectedRoutes: true
        }).addTo(map);

        routingControl.on('routesfound', e => {
          const summary = e.routes[0].summary;
          updateNavSummary(summary.totalDistance, summary.totalTime, mode);
        });

        routingControl.on('routingerror', () => {
          const label = mode === 'walking' ? 'walking' : 'driving';
          document.getElementById('navSummaryText').textContent = `No ${label} route found for this location.`;
        });

      } else if(now - lastRerouteTime > REROUTE_INTERVAL_MS){
        // Periodically refresh the route from the updated position
        // (not on every GPS tick, to be considerate of the free routing service)
        lastRerouteTime = now;
        routingControl.setWaypoints([from, to]);
      }
    },
    () => {
      alert('Could not get your location. Please enable location access and try again.');
      stopNavigation();
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
  );
}

function setupFilterButtons(){
  const buttons = document.querySelectorAll('.filter-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCategory = btn.dataset.category;
      applyFilters();
    });
  });
}

function setupSearch(){
  const input = document.getElementById('searchInput');
  const suggestionsBox = document.getElementById('suggestions');

  input.addEventListener('input', () => {
    applyFilters();
    showSuggestions(input.value.trim());
  });

  input.addEventListener('focus', () => {
    showSuggestions(input.value.trim());
  });

  document.addEventListener('click', (e) => {
    if(!suggestionsBox.contains(e.target) && e.target !== input){
      hideSuggestions();
    }
  });
}

function showSuggestions(query){
  const suggestionsBox = document.getElementById('suggestions');
  suggestionsBox.innerHTML = '';

  if(!query){
    hideSuggestions();
    return;
  }

  const matches = allPlaces
    .filter(p => p.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 6);

  if(matches.length === 0){
    hideSuggestions();
    return;
  }

  matches.forEach(place => {
    const item = document.createElement('div');
    item.className = 'suggestion-item';
    item.innerHTML = `${place.name}<span class="suggestion-cat">${CATEGORY_ICONS[place.category] || ''}</span>`;
    item.addEventListener('click', () => jumpToPlace(place));
    suggestionsBox.appendChild(item);
  });

  suggestionsBox.classList.add('visible');
}

function hideSuggestions(){
  document.getElementById('suggestions').classList.remove('visible');
}

function jumpToPlace(place){
  document.getElementById('searchInput').value = place.name;
  hideSuggestions();

  // Reset category filter to "All" so this place's marker is guaranteed visible
  activeCategory = 'all';
  document.querySelectorAll('.filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.category === 'all');
  });
  renderMarkers(allPlaces, false); // show full pin set, don't auto-fit — we're flying manually

  map.flyTo([place.lat, place.lng], 16);

  const marker = markers.find(m => m.placeId === place.id);
  if(marker){
    marker.openPopup();
  }
}

const firebaseConfig = {
  apiKey: "AIzaSyB0zvfNnBgAmm2rbX7btdKrMdb9u3ygHSU",
  authDomain: "goibom.firebaseapp.com",
  projectId: "goibom",
  storageBucket: "goibom.firebasestorage.app",
  messagingSenderId: "929310843147",
  appId: "1:929310843147:web:e6846a73700df361b3020e"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

async function loadPlaces(){
  try {
    const snapshot = await db.collection('places').get();

    if(snapshot.empty){
      // Fallback to the static starter file if Firestore has no data yet
      const response = await fetch('data/places.json');
      allPlaces = await response.json();
    } else {
      allPlaces = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
  } catch (err) {
    console.error('Failed to load from Firestore, falling back to places.json', err);
    const response = await fetch('data/places.json');
    allPlaces = await response.json();
  }

  renderMarkers(allPlaces);
}

initMap();
setupFilterButtons();
setupSearch();
loadPlaces();
