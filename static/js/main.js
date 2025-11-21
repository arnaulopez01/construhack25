// ==================================================================
// 1. CONFIGURACIÓN Y COLORES
// ==================================================================
let map;

// --- COLORES EDIFICIOS (Según tu código "bueno") ---
const BUILDING_COLORS = {
    // 1. Residencial
    '1_residential': '#F4A6A6',      // Rojo pastel suave
    
    // 2. Industrial
    '3_industrial': '#C9B2D9',       // Lila pastel
    
    // 3. Comercial
    '4_2_retail': '#F7C7A3',         // Naranja pastel
    
    // 4. Oficinas
    '4_1_office': '#A8C8E8',         // Azul pastel
    
    // 5. Dotacional público
    '4_3_publicServices': '#F5ED9A', // Amarillo pastel
    
    // 11. Agrícola
    '2_agriculture': '#D6E2B3',      // Verde oliva pastel
    
    // 12. Por defecto / Sin uso
    'default': '#D5D5D5'             // Gris topo pastel
};

// Etiquetas para leyenda y popup
const USAGE_LABELS = {
    '1_residential': 'Residencial',
    '3_industrial': 'Industrial',
    '4_2_retail': 'Comercial',
    '4_1_office': 'Oficinas',
    '4_3_publicServices': 'Dotacional Público',
    '2_agriculture': 'Agrícola',
    'default': 'Sin uso / Otros'
};

// --- COLORES OBRAS (Semáforo) ---
const WORKS_COLORS = {
    'Acabada': '#66BB6A',     // Verde
    'En Progreso': '#FFA726', // Naranja
    'A Futuro': '#42A5F5'     // Azul
};

// --- COLORES IOT (Calidad Aire) ---
const IOT_LEVELS = [
    { value: 0, color: '#4CAF50', label: 'Buena' },
    { value: 1, color: '#FF9800', label: 'Regular' },
    { value: 2, color: '#F44336', label: 'Mala' }
];
const IOT_THRESHOLDS = { 
    'NO2': { regular: 40, bad: 90 }, 
    'PM10': { regular: 20, bad: 40 }, 
    'CO2': { regular: 1000, bad: 1500 } 
};

// Mapas Base
const baseMaps = {
    'osm': { type: 'raster', tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap' },
    'esri-satellite': { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Tiles © Esri' },
    'esri-topo': { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Tiles © Esri' }
};

// Referencias al DOM
const els = {
    terrainCheck: document.getElementById('terrain-3d-checkbox'),
    catastroCheck: document.getElementById('catastro-checkbox'),
    buildingsCheck: document.getElementById('buildings-checkbox'),
    obrasCheck: document.getElementById('obras-checkbox'),
    iotCheck: document.getElementById('iot-checkbox'),
    popPointsCheck: document.getElementById('population-points-checkbox'),
    popHeatCheck: document.getElementById('population-heatmap-checkbox'),
    
    layersPanel: document.getElementById('layers-panel'),
    legendContainer: document.getElementById('legends-container'),
    
    // Contenedores de Leyendas Individuales
    legWrapperBuildings: document.getElementById('building-legend-wrapper'),
    legContentBuildings: document.getElementById('legend-content'),
    
    legWrapperObras: document.getElementById('obras-legend-wrapper'),
    legContentObras: document.getElementById('obras-legend-content'),
    
    legWrapperIoT: document.getElementById('iot-legend-wrapper'),
    legContentIoT: document.getElementById('iot-legend-content'),

    heatmapControls: document.getElementById('heatmap-controls'),
    heatmapRadius: document.getElementById('heatmap-radius'),
    heatmapIntensity: document.getElementById('heatmap-intensity')
};

// ==================================================================
// 2. INICIALIZACIÓN DEL MAPA
// ==================================================================

function initializeMap() {
    map = new maplibregl.Map({ 
        container: 'map', 
        style: { 
            'version': 8, 'name': 'Blank', 'sources': {}, 
            'layers': [{ 'id': 'background', 'type': 'background', 'paint': { 'background-color': '#f8f9fa' } }] 
        },
        center: [CONFIG.lon, CONFIG.lat], 
        zoom: CONFIG.zoom, 
        antialias: true, 
        maxPitch: 85
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true }), 'top-left');

    map.on('load', () => {
        setupBaseLayers();
        setupCoreLayers(); // Edificios, Pob, Catastro
        buildStaticLegends();
    });
}

function setupBaseLayers() {
    if (CONFIG.maptilerKey) {
        map.addSource('maptiler-terrain', { 
            'type': 'raster-dem', 
            'tiles': [`https://api.maptiler.com/tiles/terrain-rgb-v2/{z}/{x}/{y}.png?key=${CONFIG.maptilerKey}`], 
            'tileSize': 512, 'maxzoom': 14 
        });
        map.setLight({anchor: 'viewport', color: '#ffffff', intensity: 0.4});
    }
    Object.keys(baseMaps).forEach(k => { 
        map.addSource(k, baseMaps[k]); 
        map.addLayer({ id: k, type: 'raster', source: k, layout: { 'visibility': (k === 'osm') ? 'visible' : 'none' } }); 
    });
}

// ==================================================================
// 3. CARGA DE CAPAS PRINCIPALES (Edificios, Población)
// ==================================================================

async function setupCoreLayers() {
    // A. CATASTRO
    map.addSource('catastro-wms', { 'type': 'raster', 'tiles': ['https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx?bbox={bbox-epsg-3857}&format=image/png&service=WMS&version=1.1.1&request=GetMap&srs=EPSG:3857&width=256&height=256&layers=Catastro&transparent=true'], 'tileSize': 256 });
    map.addLayer({ 'id': 'catastro-layer', 'type': 'raster', 'source': 'catastro-wms', 'layout': { 'visibility': 'none' } });

    // B. EDIFICIOS
    proj4.defs("EPSG:25831","+proj=utm +zone=31 +ellps=GRS80 +units=m +no_defs");
    try {
        const response = await fetch('static/data/edificis.geojson');
        const data = await response.json();
        
        data.features.forEach(f => {
            const transform = cs => cs.map(ring => ring.map(c => proj4("EPSG:25831", "EPSG:4326", c)));
            if (f.geometry.type === 'Polygon') f.geometry.coordinates = transform(f.geometry.coordinates);
            else if (f.geometry.type === 'MultiPolygon') f.geometry.coordinates = f.geometry.coordinates.map(p => transform(p)[0]);
        });

        map.addSource('edificios-source', { 'type': 'geojson', 'data': data });

        const colorExp = ['match', ['get', 'currentUse']];
        Object.keys(BUILDING_COLORS).forEach(k => { if (k !== 'default') colorExp.push(k, BUILDING_COLORS[k]); });
        colorExp.push(BUILDING_COLORS['default']);

        const heightExp = [
            'match', ['get', 'currentUse'], 
            '1_residential', [
                'interpolate', ['linear'], ['get', 'value'], 
                0, 8, 200, 10, 1000, 25, 3000, 30, 6000, 40
            ], 
            20 // Altura fija resto
        ];

        map.addLayer({
            'id': 'edificios-layer', 'type': 'fill-extrusion', 'source': 'edificios-source',
            'layout': { 'visibility': 'none' },
            'paint': { 'fill-extrusion-color': colorExp, 'fill-extrusion-height': heightExp, 'fill-extrusion-opacity': 0.9 }
        });

        setupBuildingInteractions();

    } catch (err) { console.error("Error Edificios:", err); }

    // C. POBLACIÓN
    map.addSource('poblacion-source', { 'type': 'geojson', 'data': 'static/data/poblacio.geojson' });
    
    map.addLayer({
        'id': 'poblacion-heatmap', 'type': 'heatmap', 'source': 'poblacion-source', 'layout': { 'visibility': 'none' },
        'paint': {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'estimacioPoblacio'], 0, 0, 5, 1],
            'heatmap-radius': 20, 'heatmap-opacity': 0.8,
            'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(33,102,172,0)', 0.2, 'rgb(103,169,207)', 0.4, 'rgb(209,229,240)', 0.6, 'rgb(253,219,199)', 0.8, 'rgb(239,138,98)', 1, 'rgb(178,24,43)']
        }
    });

    map.addLayer({
        'id': 'poblacion-points', 'type': 'circle', 'source': 'poblacion-source', 'layout': { 'visibility': 'none' },
        'paint': { 'circle-radius': 6, 'circle-color': '#ffffff', 'circle-stroke-color': '#e31a1c', 'circle-stroke-width': 2 }
    });
}

// ==================================================================
// 4. CARGA DE CAPA OBRAS (Bajo Demanda)
// ==================================================================

async function loadObrasData() {
    if (map.getSource('obras-source')) return;

    try {
        const response = await fetch('static/data/obres.geojson');
        const data = await response.json();

        data.features.forEach(f => {
            if(f.properties.expediente_detalle && f.properties.expediente_detalle.estado_expediente) {
                f.properties.estado = f.properties.expediente_detalle.estado_expediente;
            } else {
                f.properties.estado = 'Desconocido';
            }
        });

        map.addSource('obras-source', { 'type': 'geojson', 'data': data });

        const colorExp = ['match', ['get', 'estado']];
        Object.keys(WORKS_COLORS).forEach(k => colorExp.push(k, WORKS_COLORS[k]));
        colorExp.push('#999');

        map.addLayer({
            'id': 'obras-fill', 'type': 'fill', 'source': 'obras-source', 'layout': { 'visibility': 'visible' },
            'paint': { 'fill-color': colorExp, 'fill-opacity': 0.6 }
        });

        map.addLayer({
            'id': 'obras-line', 'type': 'line', 'source': 'obras-source', 'layout': { 'visibility': 'visible' },
            'paint': { 'line-color': colorExp, 'line-width': 2, 'line-dasharray': [2, 2] }
        });

        setupObrasInteractions();
        buildObrasLegend();
        updateLegendDisplay();

    } catch (err) { console.error("Error Obras:", err); }
}

function setupObrasInteractions() {
    map.on('mouseenter', 'obras-fill', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'obras-fill', () => map.getCanvas().style.cursor = '');

    map.on('click', 'obras-fill', (e) => {
        const props = e.features[0].properties;
        let det = props.expediente_detalle;
        if (typeof det === 'string') { try { det = JSON.parse(det); } catch(e){ det={}; } }

        const estado = det.estado_expediente || 'Desconocido';
        const color = WORKS_COLORS[estado] || '#999';
        const presu = det.presupuesto_ejecucion ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(det.presupuesto_ejecucion) : '-';

        const html = `
            <div class="popup-header" style="background:${color}; color:white;">
                <i class="fa-solid fa-helmet-safety"></i> ${estado}
            </div>
            <div class="popup-body">
                <div style="font-weight:bold; margin-bottom:5px;">${props.nombre}</div>
                <div class="popup-row"><span>Barrio:</span><span>${props.barrio}</span></div>
                <div class="popup-row"><span>Presupuesto:</span><span>${presu}</span></div>
                <div class="popup-row"><span>Plazo:</span><span>${det.plazo_ejecucion_dias} días</span></div>
                <div style="margin-top:8px; font-size:11px; color:#666; border-top:1px solid #eee; padding-top:5px;">
                    ${det.descripcion}
                </div>
            </div>`;
        
        new maplibregl.Popup({className:'custom-popup', maxWidth:'320px'}).setLngLat(e.lngLat).setHTML(html).addTo(map);
    });
}

// ==================================================================
// 5. CARGA DE CAPA IOT (Bajo Demanda)
// ==================================================================

function calculateIoTStatus(props) {
    let maxLevel = 0;
    Object.keys(IOT_THRESHOLDS).forEach(key => {
        const val = props[key];
        if (val != null) {
            const lim = IOT_THRESHOLDS[key];
            let lvl = 0;
            if (val >= lim.bad) lvl = 2; else if (val >= lim.regular) lvl = 1;
            if (lvl > maxLevel) maxLevel = lvl;
        }
    });
    return maxLevel;
}

async function loadIoTData() {
    if (map.getSource('iot-source')) return;
    try {
        const response = await fetch('static/data/iot.geojson');
        const data = await response.json();
        data.features.forEach(f => f.properties.qualityLevel = calculateIoTStatus(f.properties));

        map.addSource('iot-source', { 'type': 'geojson', 'data': data });
        
        map.addLayer({
            'id': 'iot-layer', 'type': 'circle', 'source': 'iot-source', 'layout': { 'visibility': 'visible' },
            'paint': {
                'circle-radius': 8, 'circle-opacity': 0.9, 'circle-stroke-width': 1, 'circle-stroke-color': '#fff',
                'circle-color': ['match', ['get', 'qualityLevel'], 0, IOT_LEVELS[0].color, 1, IOT_LEVELS[1].color, 2, IOT_LEVELS[2].color, '#ccc']
            }
        });

        map.on('mouseenter', 'iot-layer', () => map.getCanvas().style.cursor = 'pointer');
        map.on('mouseleave', 'iot-layer', () => map.getCanvas().style.cursor = '');
        map.on('click', 'iot-layer', e => {
            const p = e.features[0].properties;
            const html = `<div class="popup-header" style="background:#333;color:white;">${p.nombre}</div>
                          <div class="popup-body">NO2: ${p.NO2}<br>PM10: ${p.PM10}<br>CO2: ${p.CO2}</div>`;
            new maplibregl.Popup({className:'custom-popup'}).setLngLat(e.lngLat).setHTML(html).addTo(map);
        });

        buildIoTLegend();
        updateLegendDisplay();

    } catch (err) { console.error("Error IoT:", err); }
}

// ==================================================================
// 6. GESTIÓN DE LEYENDAS Y UI
// ==================================================================

function setupBuildingInteractions() {
    map.on('click', 'edificios-layer', (e) => {
        const p = e.features[0].properties;
        const color = BUILDING_COLORS[p.currentUse] || BUILDING_COLORS.default;
        const html = `<div class="popup-header" style="background:${color};color:#444;">${USAGE_LABELS[p.currentUse]||'Otro'}</div>
                      <div class="popup-body">Ref: ${p.reference}<br>Sup: ${Math.round(p.value)} m²<br>Uso: ${p.currentUse}</div>`;
        new maplibregl.Popup({className:'custom-popup'}).setLngLat(e.lngLat).setHTML(html).addTo(map);
    });
    map.on('mouseenter', 'edificios-layer', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'edificios-layer', () => map.getCanvas().style.cursor = '');
}

function buildStaticLegends() {
    let html = '';
    Object.keys(BUILDING_COLORS).forEach(k => {
        if(k!=='default') html += `<div class="legend-item"><span class="legend-color" style="background:${BUILDING_COLORS[k]}"></span><span>${USAGE_LABELS[k]}</span></div>`;
    });
    els.legContentBuildings.innerHTML = html;
}

function buildObrasLegend() {
    let html = '';
    Object.keys(WORKS_COLORS).forEach(k => html += `<div class="legend-item"><span class="legend-color" style="background:${WORKS_COLORS[k]}"></span><span>${k}</span></div>`);
    els.legContentObras.innerHTML = html;
}

function buildIoTLegend() {
    let html = '';
    IOT_LEVELS.forEach(l => html += `<div class="legend-item"><span class="legend-color" style="background:${l.color};border-radius:50%"></span><span>${l.label}</span></div>`);
    els.legContentIoT.innerHTML = html;
}

function updateLegendDisplay() {
    const b = els.buildingsCheck.checked;
    const w = els.obrasCheck.checked && map.getLayer('obras-fill');
    const i = els.iotCheck.checked && map.getLayer('iot-layer');

    els.legendContainer.style.display = (b || w || i) ? 'block' : 'none';
    els.legWrapperBuildings.style.display = b ? 'block' : 'none';
    els.legWrapperObras.style.display = w ? 'block' : 'none';
    els.legWrapperIoT.style.display = i ? 'block' : 'none';
}

// ==================================================================
// 7. EVENT LISTENERS
// ==================================================================

document.getElementById('layers-toggle').addEventListener('click', () => els.layersPanel.style.display = els.layersPanel.style.display==='block'?'none':'block');

document.querySelectorAll('input[name="base-layer"]').forEach(r => r.addEventListener('change', e => {
    if(e.target.checked) Object.keys(baseMaps).forEach(k => map.getLayer(k) && map.setLayoutProperty(k, 'visibility', k===e.target.value?'visible':'none'));
}));

els.terrainCheck.addEventListener('change', e => map.getSource('maptiler-terrain') && map.setTerrain(e.target.checked ? {source:'maptiler-terrain', exaggeration:1.5} : null));
els.catastroCheck.addEventListener('change', e => map.getLayer('catastro-layer') && map.setLayoutProperty('catastro-layer', 'visibility', e.target.checked?'visible':'none'));

els.buildingsCheck.addEventListener('change', e => {
    if(map.getLayer('edificios-layer')) map.setLayoutProperty('edificios-layer', 'visibility', e.target.checked?'visible':'none');
    updateLegendDisplay();
});

els.obrasCheck.addEventListener('change', e => {
    if(!map.getSource('obras-source')) loadObrasData();
    else {
        map.setLayoutProperty('obras-fill', 'visibility', e.target.checked?'visible':'none');
        map.setLayoutProperty('obras-line', 'visibility', e.target.checked?'visible':'none');
    }
    updateLegendDisplay();
});

els.iotCheck.addEventListener('change', e => {
    if(!map.getSource('iot-source')) loadIoTData();
    else map.setLayoutProperty('iot-layer', 'visibility', e.target.checked?'visible':'none');
    updateLegendDisplay();
});

els.popPointsCheck.addEventListener('change', e => map.setLayoutProperty('poblacion-points', 'visibility', e.target.checked?'visible':'none'));
els.popHeatCheck.addEventListener('change', e => {
    map.setLayoutProperty('poblacion-heatmap', 'visibility', e.target.checked?'visible':'none');
    els.heatmapControls.style.display = e.target.checked?'block':'none';
});

document.getElementById('heatmap-radius').addEventListener('input', e => map.setPaintProperty('poblacion-heatmap', 'heatmap-radius', parseFloat(e.target.value)));
document.getElementById('heatmap-intensity').addEventListener('input', e => map.setPaintProperty('poblacion-heatmap', 'heatmap-intensity', parseFloat(e.target.value)));
document.getElementById('toggle-3d').addEventListener('click', () => { const p=map.getPitch(); map.easeTo({pitch:p>0?0:60,bearing:p>0?0:-20}); });
document.getElementById('camera-button').addEventListener('click', () => { map.once('render', () => map.getCanvas().toBlob(b => { const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='mapa.png';a.click(); })); map.triggerRepaint(); });

// START
initializeMap();