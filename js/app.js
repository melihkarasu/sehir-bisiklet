let bikeMap = null;
        let stationMarkers = [];
        let currentStations = [];
        let allNetworks = [];
        let activeSelectedStation = null;

        function initBikeMap() {
          bikeMap = L.map('bike-map', {
            center: [41.0082, 28.9784],
            zoom: 12
          });

          L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
            maxZoom: 19
          }).addTo(bikeMap);
        }

        
        
        async function loadNetworks() {
          try {
            const res = await fetch('https://api.citybik.es/v2/networks');
            if (!res.ok) throw new Error('Şebeke verileri alınamadı');
            const data = await res.json();
            
            allNetworks = data.networks || [];
            const select = document.getElementById('select-network');

            // CityBikes API'sinde şehir bilgisi n.location.city içindedir
            allNetworks.sort((a, b) => {
              const cityA = (a.location && a.location.city) ? a.location.city : '';
              const cityB = (b.location && b.location.city) ? b.location.city : '';
              return cityA.localeCompare(cityB);
            });

            select.innerHTML = allNetworks.map(n => {
              const city = (n.location && n.location.city) ? n.location.city : 'Bilinmiyor';
              const country = (n.location && n.location.country) ? n.location.country : '';
              return `<option value="${n.id}">${city} - ${n.name} (${country})</option>`;
            }).join('');

            const defaultNet = allNetworks.find(n => n.id === 'isbike' || (n.location && n.location.city && n.location.city.toLowerCase().includes('istanbul'))) || allNetworks[0];
            if (defaultNet) {
              select.value = defaultNet.id;
              loadNetworkStations(defaultNet.id);
            }
          } catch(err) {
            alert('Bisiklet şebekeleri yüklenemedi: ' + err.message);
          }
        }



        
        
        async function loadNetworkStations(netId) {
          document.getElementById('bike-net-status').innerText = 'Duraklar Yükleniyor...';

          try {
            const res = await fetch(`https://api.citybik.es/v2/networks/${encodeURIComponent(netId)}`);
            if (!res.ok) throw new Error('Durak verileri alınamadı');
            const data = await res.json();
            
            currentStations = data.stations || [];
            const net = data.network || {};
            const loc = net.location || {};

            let totalBikes = 0;
            let totalEmpty = 0;
            currentStations.forEach(s => {
              totalBikes += (s.free_bikes || 0);
              totalEmpty += (s.empty_slots || 0);
            });

            document.getElementById('stat-total-stations').innerText = currentStations.length;
            document.getElementById('stat-free-bikes').innerText = Number(totalBikes).toLocaleString('tr-TR');
            document.getElementById('stat-empty-slots').innerText = Number(totalEmpty).toLocaleString('tr-TR');
            document.getElementById('stat-city-label').innerText = loc.city || net.name;
            document.getElementById('stat-country-label').innerText = (loc.country || '') + ' Şebekesi';
            document.getElementById('bike-net-status').innerText = 'Canlı Duraklar Açık';

            renderMapMarkers(loc.latitude, loc.longitude);
            renderStationList(currentStations);
          } catch(err) {
            document.getElementById('bike-net-status').innerText = 'Bağlantı Hatası';
            console.error('Station Load Error:', err);
          }
        }



        function renderMapMarkers(centerLat, centerLon) {
          // Eski markerları temizle
          stationMarkers.forEach(m => m.remove());
          stationMarkers = [];

          if (currentStations.length > 0) {
            const group = [];
            currentStations.forEach(s => {
              if (!s.latitude || !s.longitude) return;

              const bikes = s.free_bikes || 0;
              let color = '#10b981'; // yeşil
              if (bikes === 0) color = '#f43f5e'; // kırmızı
              else if (bikes <= 4) color = '#f59e0b'; // sarı

              const customIcon = L.divIcon({
                html: `<div style="width: 18px; height: 18px; border-radius: 50%; background-color: ${color}; border: 2px solid #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-size: 9px; font-weight: bold;">${bikes}</div>`,
                className: 'bike-station-marker',
                iconSize: [18, 18]
              });

              const marker = L.marker([s.latitude, s.longitude], { icon: customIcon })
                .addTo(bikeMap)
                .bindPopup(`<strong>${s.name}</strong><br>🚲 Müsait: ${s.free_bikes}<br>🅿️ Boş Park: ${s.empty_slots || 0}`);

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
          document.getElementById('sel-free-bikes').innerText = s.free_bikes;
          document.getElementById('sel-empty-slots').innerText = s.empty_slots !== null ? s.empty_slots : 'N/A';
          document.getElementById('sel-status').innerText = s.free_bikes > 0 ? 'Müsait Bisiklet Var' : 'Bisiklet Tükendi';
        }

        function centerOnSelectedStation() {
          if (activeSelectedStation && bikeMap) {
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

          box.innerHTML = list.slice(0, 30).map(s => `
            <div onclick='selectStationAndCenter(${JSON.stringify(s)})' class="p-2.5 rounded-lg text-mistral-ink font-boldbg-mistral-cream-light hover:bg-mistral-cream border border-mistral-hairline cursor-pointer flex items-center justify-between transition">
              <span class="font-medium text-mistral-ink truncate max-w-[170px]">${s.name}</span>
              <div class="flex items-center gap-1 text-[11px] font-bold">
                <span class="text-emerald-700">🚲 ${s.free_bikes}</span>
                <span class="text-mistral-stone">•</span>
                <span class="text-mistral-slate">🅿️ ${s.empty_slots || 0}</span>
              </div>
            </div>
          `).join('');
        }

        function selectStationAndCenter(s) {
          selectStation(s);
          centerOnSelectedStation();
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
          select.value = id;
          loadNetworkStations(id);
        }

        document.addEventListener('DOMContentLoaded', () => {
          initBikeMap();
          loadNetworks();
        });


window.loadNetworks = loadNetworks;
window.loadNetworkStations = loadNetworkStations;
window.onNetworkChange = onNetworkChange;
window.selectCityById = selectCityById;
window.filterStationList = filterStationList;
window.searchCity = searchCity;
window.openModal = openModal;
window.closeModal = closeModal;
