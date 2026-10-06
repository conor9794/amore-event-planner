let storeDirectoryStores = [];
let storePage = 1;
const STORE_PAGE_SIZE = 24;
const STORE_GEOFENCE_METERS = 76.2;
let storeCardMaps = [];
let storeDetailMap = null;

const storeEl = (id) => document.getElementById(id);
const storeEsc = (value) => String(value || "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));

function storeGoogleMapsUrl(store) {
  if (store.googlePlaceId) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.name || store.address)}&query_place_id=${encodeURIComponent(store.googlePlaceId)}`;
  if (store.latitude && store.longitude) return `https://www.google.com/maps/search/?api=1&query=${store.latitude},${store.longitude}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address || store.name)}`;
}

function clearStoreMaps() {
  storeCardMaps.forEach(map => map.remove());
  storeCardMaps = [];
}

function uniqueStoreValues(key) {
  return [...new Set(storeDirectoryStores.map(s => s[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}

function populateStoreFilters() {
  const state = storeEl("storeStateFilter"), region = storeEl("storeRegionFilter");
  const stateVal=state.value, regionVal=region.value;
  state.innerHTML='<option value="all">All states</option>'+uniqueStoreValues("state").map(v=>`<option value="${storeEsc(v)}">${storeEsc(v)}</option>`).join("");
  region.innerHTML='<option value="all">All regions</option>'+uniqueStoreValues("region").map(v=>`<option value="${storeEsc(v)}">${storeEsc(v)}</option>`).join("");
  if ([...state.options].some(o=>o.value===stateVal)) state.value=stateVal;
  if ([...region.options].some(o=>o.value===regionVal)) region.value=regionVal;
}

function filteredStores() {
  const term=storeEl("storeDirectorySearch").value.trim().toLowerCase();
  const state=storeEl("storeStateFilter").value, region=storeEl("storeRegionFilter").value, gps=storeEl("storeGpsFilter").value;
  const sort=storeEl("storeSort").value;
  const rows=storeDirectoryStores.filter(s=>{
    const hasGps=Number.isFinite(s.latitude)&&Number.isFinite(s.longitude);
    return (!term || [s.name,s.address,s.state,s.region,s.notes].join(" ").toLowerCase().includes(term))
      && (state==="all" || s.state===state)
      && (region==="all" || s.region===region)
      && (gps==="all" || (gps==="ready"&&hasGps) || (gps==="missing"&&!hasGps));
  });
  rows.sort((a,b)=>{
    if(sort==="events-desc") return b.eventCount-a.eventCount || a.name.localeCompare(b.name);
    if(sort==="events-asc") return a.eventCount-b.eventCount || a.name.localeCompare(b.name);
    if(sort==="name-desc") return b.name.localeCompare(a.name);
    return a.name.localeCompare(b.name);
  });
  return rows;
}

function storeCard(store) {
  const hasGps=Number.isFinite(store.latitude)&&Number.isFinite(store.longitude);
  return `<article class="storeGalleryCard" data-store-id="${storeEsc(store.id)}">
    <div class="storeMapFrame">
      ${hasGps ? `<div class="storeMiniMap" id="store-map-${storeEsc(store.id)}"></div>` : '<div class="storeMapMissing"><strong>Map unavailable</strong><span>Coordinates need review</span></div>'}
      <span class="storeGpsBadge ${hasGps?'gpsReady':'gpsMissing'}">${hasGps?'GPS Ready':'GPS Missing'}</span>
    </div>
    <div class="storeGalleryBody">
      <h3>${storeEsc(store.name || "Unnamed Store")}</h3>
      <p class="storeAddress">${storeEsc(store.address || "No address on file")}</p>
      <div class="storeChips">
        ${store.state?`<span>${storeEsc(store.state)}</span>`:""}
        ${store.region?`<span>${storeEsc(store.region)}</span>`:""}
      </div>
      <div class="storeStats"><strong>${store.eventCount}</strong><span>Events</span></div>
    </div>
    <div class="storeGalleryFooter">
      <button type="button" class="storeViewButton" data-view-store="${storeEsc(store.id)}">View Store</button>
      <a href="${storeEsc(storeGoogleMapsUrl(store))}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Google Maps ↗</a>
    </div>
  </article>`;
}

function initMiniMap(store) {
  const node=storeEl(`store-map-${store.id}`);
  if(!node || !window.L) return;
  const map=L.map(node,{zoomControl:false,attributionControl:false,dragging:false,scrollWheelZoom:false,doubleClickZoom:false,touchZoom:false,keyboard:false});
  map.setView([store.latitude,store.longitude],17);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(map);
  L.circle([store.latitude,store.longitude],{radius:STORE_GEOFENCE_METERS,color:"#dc2626",weight:2,fillColor:"#ef4444",fillOpacity:.22}).addTo(map);
  L.circleMarker([store.latitude,store.longitude],{radius:5,color:"#991b1b",weight:2,fillColor:"#ef4444",fillOpacity:1}).addTo(map);
  storeCardMaps.push(map);
}

function renderStores() {
  clearStoreMaps();
  const matches=filteredStores();
  const totalPages=Math.max(1,Math.ceil(matches.length/STORE_PAGE_SIZE));
  if(storePage>totalPages) storePage=totalPages;
  const start=(storePage-1)*STORE_PAGE_SIZE;
  const pageRows=matches.slice(start,start+STORE_PAGE_SIZE);
  storeEl("storeDirectoryCount").textContent=`${matches.length} of ${storeDirectoryStores.length} stores`;
  storeEl("storePageLabel").textContent=matches.length?`Showing ${start+1}–${Math.min(start+STORE_PAGE_SIZE,matches.length)}`:"";
  storeEl("storeDirectoryList").innerHTML=pageRows.length?pageRows.map(storeCard).join(""):'<p class="storeEmpty">No stores match these filters.</p>';
  requestAnimationFrame(()=>pageRows.forEach(initMiniMap));
  storeEl("storePagination").innerHTML=totalPages>1?`
    <button type="button" data-store-page="${Math.max(1,storePage-1)}" ${storePage===1?"disabled":""}>← Previous</button>
    <span>Page ${storePage} of ${totalPages}</span>
    <button type="button" data-store-page="${Math.min(totalPages,storePage+1)}" ${storePage===totalPages?"disabled":""}>Next →</button>`:"";
}

function openStoreProfile(id) {
  const store=storeDirectoryStores.find(s=>s.id===id); if(!store) return;
  const hasGps=Number.isFinite(store.latitude)&&Number.isFinite(store.longitude);
  storeEl("storeProfileContent").innerHTML=`
    <div class="storeProfileHeader">
      <div><div class="eyebrow">Store Location</div><h2>${storeEsc(store.name)}</h2><p>${storeEsc(store.address||"No address on file")}</p></div>
      <a class="storeGoogleButton" href="${storeEsc(storeGoogleMapsUrl(store))}" target="_blank" rel="noopener">Open in Google Maps ↗</a>
    </div>
    <div id="storeDetailMap" class="storeDetailMap">${hasGps?"":'<div class="storeMapMissing"><strong>Map unavailable</strong><span>Coordinates need review</span></div>'}</div>
    <div class="storeDetailGrid">
      <div><span>State</span><strong>${storeEsc(store.state||"—")}</strong></div>
      <div><span>Region</span><strong>${storeEsc(store.region||"—")}</strong></div>
      <div><span>GPS readiness</span><strong>${storeEsc(store.gpsReadiness|| (hasGps?"Ready":"Missing"))}</strong></div>
      <div><span>Events</span><strong>${store.eventCount}</strong></div>
      <div><span>Latitude</span><strong>${hasGps?store.latitude.toFixed(6):"—"}</strong></div>
      <div><span>Longitude</span><strong>${hasGps?store.longitude.toFixed(6):"—"}</strong></div>
    </div>
    <section class="storeGeofenceInfo"><h3>Geofence</h3><p><span class="redFenceDot"></span> 250 ft radius centered on the saved store coordinates.</p></section>
    ${store.notes?`<section class="storeNotes"><h3>Notes</h3><p>${storeEsc(store.notes)}</p></section>`:""}`;
  storeEl("storeProfileModal").classList.remove("hidden");
  document.body.classList.add("modalOpen");
  if(hasGps&&window.L){
    requestAnimationFrame(()=>{
      if(storeDetailMap) storeDetailMap.remove();
      storeDetailMap=L.map("storeDetailMap").setView([store.latitude,store.longitude],17);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(storeDetailMap);
      L.circle([store.latitude,store.longitude],{radius:STORE_GEOFENCE_METERS,color:"#dc2626",weight:3,fillColor:"#ef4444",fillOpacity:.22}).addTo(storeDetailMap);
      L.marker([store.latitude,store.longitude]).addTo(storeDetailMap);
    });
  }
}

function closeStoreProfile(){
  if(storeDetailMap){storeDetailMap.remove();storeDetailMap=null;}
  storeEl("storeProfileModal").classList.add("hidden");document.body.classList.remove("modalOpen");
}

async function loadStores(){
  const msg=storeEl("storeDirectoryMessage");msg.textContent="Loading stores...";msg.className="message ok";
  try{
    const res=await fetch(`/api/store-directory?refresh=${Date.now()}`,{cache:"no-store"});
    const data=await res.json();if(!res.ok)throw new Error(data.error||"Could not load stores.");
    storeDirectoryStores=data.stores||[];populateStoreFilters();renderStores();msg.className="message hidden";
  }catch(e){msg.textContent=e.message;msg.className="message error";}
}

function resetStoreFilters(){
  storeEl("storeDirectorySearch").value="";storeEl("storeStateFilter").value="all";storeEl("storeRegionFilter").value="all";
  storeEl("storeGpsFilter").value="all";storeEl("storeSort").value="name-asc";storePage=1;renderStores();
}

function initStoreDirectory(){
  storeEl("storesTab")?.addEventListener("click",()=>{
    document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));
    document.querySelectorAll(".tab").forEach(t=>t.classList.remove("active"));
    storeEl("storeDirectoryPage").classList.add("active");storeEl("storesTab").classList.add("active");loadStores();
  });
  ["storeDirectorySearch","storeStateFilter","storeRegionFilter","storeGpsFilter","storeSort"].forEach(id=>{
    storeEl(id)?.addEventListener(id==="storeDirectorySearch"?"input":"change",()=>{storePage=1;renderStores();});
  });
  storeEl("storeClearFilters")?.addEventListener("click",resetStoreFilters);
  storeEl("storeDirectoryList")?.addEventListener("click",e=>{const target=e.target.closest("[data-view-store], [data-store-id]");if(target&&!e.target.closest("a"))openStoreProfile(target.dataset.viewStore||target.dataset.storeId);});
  storeEl("storePagination")?.addEventListener("click",e=>{const btn=e.target.closest("[data-store-page]");if(btn){storePage=Number(btn.dataset.storePage);renderStores();storeEl("storeDirectoryPage").scrollIntoView({behavior:"smooth"});}});
  storeEl("storeProfileClose")?.addEventListener("click",closeStoreProfile);
  storeEl("storeProfileModal")?.addEventListener("click",e=>{if(e.target===storeEl("storeProfileModal"))closeStoreProfile();});
}
initStoreDirectory();