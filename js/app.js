let bikeMap = null;
let stationMarkers = [];
let currentStations = [];
let allNetworks = [];
let activeSelectedStation = null;

function initBikeMap() {
  if (bikeMap) return;
  bikeMap = L.map('bike-map', {
    center: [41.3851, 2.1734],
    zoom: 13
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    maxZoom: 19
  }).addTo(bikeMap);
}

// networks: http://api.citybik.es/v2/networks?fields=id,name,city,country,location
async function loadNetworks() {
  try {
    const res = await fetch('https://api.citybik.es/v2/networks?fields=id,name,city,country,location');
    if (!res.ok) throw new Error('CityBikes ağ listesi alınamadı: ' + res.status);
    const data = await res.json();

    const formatted = (data.networks || []).map(n => ({
      id: n.id,
      name: n.name,
      city: (n.location && n.location.city) ? n.location.city : n.name,
      country: (n.location && n.location.country) ? n.location.country : '',
      latitude: (n.location && n.location.latitude) ? n.location.latitude : 0,
      longitude: (n.location && n.location.longitude) ? n.location.longitude : 0
    })).filter(n => n.id && n.latitude !== 0);

    allNetworks = formatted;
    allNetworks.sort((a, b) => a.city.localeCompare(b.city));

    const select = document.getElementById('select-network');
    select.innerHTML = allNetworks.map(n => `
      <option value="${n.id}">${n.city} - ${n.name} (${n.country})</option>
    `).join('');

    // Varsayılan: Barselona (Bicing) veya ilk ağ
    const defaultNet = allNetworks.find(n => n.id === 'bicing') || 
                       allNetworks.find(n => n.id.includes('antalya')) || 
                       allNetworks[0];
    if (defaultNet) {
      select.value = defaultNet.id;
      loadNetworkStations(defaultNet.id);
    }
  } catch(err) {
    console.error('loadNetworks error:', err);
    alert('Bisiklet şebekeleri yüklenemedi: ' + err.message);
  }
}

// network stations: http://api.citybik.es/v2/networks/:id
async function loadNetworkStations(netId) {
  const statusEl = document.getElementById('bike-net-status');
  if (statusEl) statusEl.innerText = 'Duraklar Yükleniyor...';

  try {
    const cleanId = (netId || '').trim().toLowerCase().slice(0, 60).replace(/[^a-z0-9\-]/g, '');
    if (!cleanId) throw new Error('Geçersiz ağ kimliği');

    const res = await fetch(`https://api.citybik.es/v2/networks/${encodeURIComponent(cleanId)}`);
    if (!res.ok) throw new Error('Ağ istasyon verileri alınamadı (HTTP ' + res.status + ')');
    const data = await res.json();
    const net = data.network || {};

    const stations = (net.stations || []).map(s => ({
      id: s.id,
      name: s.name || 'İstasyon',
      emptySlots: s.empty_slots ?? null,
      freeBikes: s.free_bikes ?? 0,
      latitude: s.latitude,
      longitude: s.longitude,
      timestamp: s.timestamp
    }));

    currentStations = stations;

    // İstatistikler
    let totalBikes = 0;
    let totalEmpty = 0;
    currentStations.forEach(s => {
      totalBikes += (s.freeBikes || 0);
      totalEmpty += (s.emptySlots || 0);
    });

    const netCity = (net.location && net.location.city) ? net.location.city : (net.name || 'Bilinmiyor');
    const netCountry = (net.location && net.location.country) ? net.location.country : '';

    document.getElementById('stat-total-stations').innerText = currentStations.length;
    document.getElementById('stat-free-bikes').innerText = Number(totalBikes).toLocaleString('tr-TR');
    document.getElementById('stat-empty-slots').innerText = Number(totalEmpty).toLocaleString('tr-TR');
    document.getElementById('stat-city-label').innerText = netCity;
    document.getElementById('stat-country-label').innerText = (netCountry ? netCountry + ' ' : '') + 'Şebekesi';
    
    if (statusEl) {
      statusEl.innerText = currentStations.length > 0 ? 'Canlı Duraklar Açık' : 'İstasyon Bulunamadı';
    }

    const centerLat = (net.location && net.location.latitude) ? net.location.latitude : (currentStations[0] ? currentStations[0].latitude : 0);
    const centerLon = (net.location && net.location.longitude) ? net.location.longitude : (currentStations[0] ? currentStations[0].longitude : 0);

    // Harita Markerlarını Temizle & Çiz
    renderMapMarkers(centerLat, centerLon);
    renderStationList(currentStations);
  } catch(err) {
    console.error('loadNetworkStations error:', err);
    if (statusEl) statusEl.innerText = 'Bağlantı Hatası';
  }
}

function renderMapMarkers(centerLat, centerLon) {
  if (!bikeMap) initBikeMap();

  // Eski markerları temizle
  stationMarkers.forEach(m => m.remove());
  stationMarkers = [];

  if (currentStations.length > 0) {
    const group = [];
    currentStations.forEach(s => {
      if (!s.latitude || !s.longitude) return;

      const bikes = s.freeBikes || 0;
      let color = '#10b981'; // yeşil
      if (bikes === 0) color = '#f43f5e'; // kırmızı
      else if (bikes <= 4) color = '#f59e0b'; // sarı

      const customIcon = L.divIcon({
        html: `<div style="width: 20px; height: 20px; border-radius: 50%; background-color: ${color}; border: 2px solid #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-size: 10px; font-weight: bold;">${bikes}</div>`,
        className: 'bike-station-marker',
        iconSize: [20, 20]
      });

      const marker = L.marker([s.latitude, s.longitude], { icon: customIcon })
        .addTo(bikeMap)
        .bindPopup(`<strong>${s.name}</strong><br>🚲 Müsait: ${s.freeBikes}<br>🅿️ Boş Park: ${s.emptySlots !== null ? s.emptySlots : 'N/A'}`);

      marker.on('click', () => {
        selectStation(s);
      });

      stationMarkers.push(marker);
      group.push([s.latitude, s.longitude]);
    });

    if (group.length > 0) {
      bikeMap.fitBounds(group, { padding: [40, 40], maxZoom: 14 });
    }
  } else if (centerLat && centerLon) {
    bikeMap.setView([centerLat, centerLon], 12);
  }
}

function selectStation(s) {
  activeSelectedStation = s;
  document.getElementById('sel-station-name').innerText = s.name;
  document.getElementById('sel-free-bikes').innerText = s.freeBikes;
  document.getElementById('sel-empty-slots').innerText = s.emptySlots !== null ? s.emptySlots : 'N/A';
  document.getElementById('sel-status').innerText = s.freeBikes > 0 ? 'Müsait Bisiklet Var' : 'Bisiklet Tükendi';
}

function centerOnSelectedStation() {
  if (activeSelectedStation && bikeMap && activeSelectedStation.latitude && activeSelectedStation.longitude) {
    bikeMap.setView([activeSelectedStation.latitude, activeSelectedStation.longitude], 16, { animate: true });
  }
}

function renderStationList(list) {
  const box = document.getElementById('stations-list-box');
  document.getElementById('filtered-count').innerText = list.length;

  if (list.length === 0) {
    box.innerHTML = '<div class="py-4 text-center text-mistral-stone">İstasyon bulunamadı.</div>';
    return;
  }

  box.innerHTML = list.slice(0, 50).map(s => {
    const encoded = encodeURIComponent(JSON.stringify(s));
    return `
      <div onclick='selectStationFromList("${encoded}")' class="p-2.5 rounded-lg bg-mistral-cream-light hover:bg-mistral-cream border border-mistral-hairline cursor-pointer flex items-center justify-between transition">
        <span class="font-medium text-mistral-ink truncate max-w-[170px]">${s.name}</span>
        <div class="flex items-center gap-1 text-[11px] font-bold">
          <span class="text-emerald-700">🚲 ${s.freeBikes}</span>
          <span class="text-mistral-stone">•</span>
          <span class="text-mistral-slate">🅿️ ${s.emptySlots !== null ? s.emptySlots : '-'}</span>
        </div>
      </div>
    `;
  }).join('');
}

function selectStationFromList(encodedStr) {
  try {
    const s = JSON.parse(decodeURIComponent(encodedStr));
    selectStation(s);
    centerOnSelectedStation();
  } catch (e) {
    console.error('Error selecting station:', e);
  }
}

function filterStationList() {
  const q = (document.getElementById('filter-station-input').value || '').trim().toLowerCase();
  const filtered = currentStations.filter(s => s.name.toLowerCase().includes(q));
  renderStationList(filtered);
}

function onNetworkChange() {
  const netId = document.getElementById('select-network').value;
  if (netId) loadNetworkStations(netId);
}

function selectCityById(id) {
  const select = document.getElementById('select-network');
  let targetId = id;

  // CityBikes API mapping fallbacks for popular buttons
  if (targetId === 'isbike') {
    const tr = allNetworks.find(n => n.id.includes('antalya') || n.country === 'TR');
    if (tr) targetId = tr.id;
  } else if (targetId === 'velib-metropole') {
    const fr = allNetworks.find(n => n.id === 'velib' || n.name.toLowerCase().includes('velib'));
    if (fr) targetId = fr.id;
  }

  select.value = targetId;
  loadNetworkStations(targetId);
}

document.addEventListener('DOMContentLoaded', () => {
  initBikeMap();
  loadNetworks();
});

// Window globals for inline onclicks
window.loadNetworks = loadNetworks;
window.loadNetworkStations = loadNetworkStations;
window.onNetworkChange = onNetworkChange;
window.selectCityById = selectCityById;
window.filterStationList = filterStationList;
window.centerOnSelectedStation = centerOnSelectedStation;
window.selectStationFromList = selectStationFromList;
