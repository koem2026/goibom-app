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

  const btn = document.createElement('button');
  btn.className = 'directions-btn';
  btn.textContent = 'Get Directions';
  btn.addEventListener('click', () => getDirectionsTo(place));
  container.appendChild(btn);

  return container;
}

function renderMarkers(places){
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  places.forEach(place => {
    const marker = L.marker([place.lat, place.lng], { icon: makeIcon(place.category) });
    marker.bindPopup(buildPopupContent(place));
    marker.category = place.category;
    marker.addTo(map);
    markers.push(marker);
  });

  fitMapToMarkers(places);
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

function getDirectionsTo(place){
  if(!navigator.geolocation){
    alert('Location access is not available on this device/browser.');
    return;
  }

  navigator.geolocation.getCurrentPosition(
    position => {
      const from = L.latLng(position.coords.latitude, position.coords.longitude);
      const to = L.latLng(place.lat, place.lng);

      if(routingControl){
        map.removeControl(routingControl);
      }

      routingControl = L.Routing.control({
        waypoints: [from, to],
        routeWhileDragging: false,
        addWaypoints: false,
        draggableWaypoints: false
      }).addTo(map);
    },
    () => {
      alert('Could not get your location. Please enable location access and try again.');
    }
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
  document.getElementById('searchInput').addEventListener('input', applyFilters);
}

async function loadPlaces(){
  const response = await fetch('data/places.json');
  allPlaces = await response.json();
  renderMarkers(allPlaces);
}

initMap();
setupFilterButtons();
setupSearch();
loadPlaces();
