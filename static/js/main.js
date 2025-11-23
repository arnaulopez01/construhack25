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

    camerasCheck: document.getElementById('cameras-checkbox'),
    
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
        updateLegendDisplay();
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
// 3. CARGA DE CAPAS PRINCIPALES (CORREGIDO)
// ==================================================================

async function setupCoreLayers() {
    // A. CATASTRO
    map.addSource('catastro-wms', { 'type': 'raster', 'tiles': ['https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx?bbox={bbox-epsg-3857}&format=image/png&service=WMS&version=1.1.1&request=GetMap&srs=EPSG:3857&width=256&height=256&layers=Catastro&transparent=true'], 'tileSize': 256 });
    map.addLayer({ 'id': 'catastro-layer', 'type': 'raster', 'source': 'catastro-wms', 'layout': { 'visibility': 'none' } });

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

    // B. EDIFICIOS (CORREGIDO)
    proj4.defs("EPSG:25831","+proj=utm +zone=31 +ellps=GRS80 +units=m +no_defs");
    
    try {
        console.log("📥 Descargando edificios...");
        const response = await fetch('static/data/edificis.geojson');
        const data = await response.json();
        
        console.log(`🔄 Procesando ${data.features.length} edificios. Convirtiendo coordenadas...`);

        // Función helper para transformar un Anillo de coordenadas (Array de [x,y])
        const transformRing = ring => ring.map(c => proj4("EPSG:25831", "EPSG:4326", c));
        
        // Función helper para transformar un Polígono (Array de Anillos)
        const transformPolygon = coords => coords.map(ring => transformRing(ring));

        data.features.forEach(f => {
            if (f.geometry.type === 'Polygon') {
                // Polygon: Array de Anillos
                f.geometry.coordinates = transformPolygon(f.geometry.coordinates);
            } 
            else if (f.geometry.type === 'MultiPolygon') {
                // MultiPolygon: Array de Polígonos. 
                // CORRECCIÓN: Mapeamos cada polígono sin aplanarlo incorrectamente
                f.geometry.coordinates = f.geometry.coordinates.map(polygonCoords => transformPolygon(polygonCoords));
            }
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
            'id': 'edificios-layer', 
            'type': 'fill-extrusion', 
            'source': 'edificios-source',
            // CAMBIO AQUÍ: De 'none' a 'visible'
            'layout': { 'visibility': 'visible' }, 
            'paint': { 
                'fill-extrusion-color': colorExp, 
                'fill-extrusion-height': heightExp, 
                'fill-extrusion-opacity': 0.9 
            }
        });

        setupBuildingInteractions();
        console.log("✅ Edificios cargados correctamente.");

    } catch (err) { console.error("❌ Error cargando Edificios:", err); }
}

// ==========================================
// FUNCIÓN MEJORADA: POPUP EDIFICIOS PREMIUM
// ==========================================
function setupBuildingInteractions() {
    
    // 1. Cursor pointer
    map.on('mouseenter', 'edificios-layer', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'edificios-layer', () => map.getCanvas().style.cursor = '');

    // 2. Click en edificios
    map.on('click', 'edificios-layer', (e) => {
        const p = e.features[0].properties;
        
        // --- PREPARACIÓN DE DATOS ---
        
        // Color según uso (fallback a gris)
        const colorBase = BUILDING_COLORS[p.currentUse] || BUILDING_COLORS.default;
        const usoTexto = USAGE_LABELS[p.currentUse] || 'Uso Desconocido';

        // Año de construcción (parsear "1965-01-01T00:00:00")
        let anyo = '-';
        if (p.beginning) {
            anyo = p.beginning.split('-')[0]; // Nos quedamos solo con el año
            if (anyo.startsWith('--')) anyo = 'Desconocido';
        }

        // Superficie
        const superficie = p.value ? new Intl.NumberFormat('es-ES').format(Math.round(p.value)) : '0';

        // Estado de conservación (Traducción simple)
        const estadoMap = { 'functional': 'Funcional', 'declined': 'Deteriorado', 'ruin': 'Ruina' };
        const estado = estadoMap[p.conditionOfConstruction] || p.conditionOfConstruction || '-';

        // Foto de fachada (Link del Catastro)
        // Nota: Catastro usa HTTP a veces, si tu web es HTTPS el navegador podría bloquear la imagen mixta.
        // Intentamos usar el link directo. Si no hay link, usamos un placeholder.
        const fotoUrl = p.documentLink || '';
        
        // Link a Sede Electrónica
        const catastroLink = p.informationSystem || '#';


        // --- HTML TEMPLATE ---
        const html = `
            <div class="building-card">
                <div class="building-image" style="background-image: url('${fotoUrl}');">
                    <div class="usage-badge" style="border-bottom: 3px solid #989898">
                        ${usoTexto}
                    </div>
                </div>

                <div class="building-info">
                    <div class="ref-catastral">REF: ${p.reference || 'N/A'}</div>
                    
                    <div class="stats-row">
                        <div class="stat-item">
                            <span class="stat-value">${superficie}</span>
                            <span class="stat-label">m² Const.</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value">${anyo}</span>
                            <span class="stat-label">Año</span>
                        </div>
                        <div class="stat-item">
                            <span class="stat-value">${estado}</span>
                            <span class="stat-label">Estado</span>
                        </div>
                    </div>

                    <a href="${catastroLink}" target="_blank" class="btn-catastro">
                        <i class="fa-solid fa-landmark"></i> Ver en Catastro
                    </a>
                </div>
            </div>
        `;
            
        new maplibregl.Popup({
            className: 'building-popup-content', // Clase CSS personalizada que definimos arriba
            maxWidth: '300px',
            closeButton: true
        })
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map);
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

        // CAMBIO AQUÍ: Añadido 'edificios-layer' como segundo argumento
        map.addLayer({
            'id': 'obras-fill', 'type': 'fill', 'source': 'obras-source', 'layout': { 'visibility': 'visible' },
            'paint': { 'fill-color': colorExp, 'fill-opacity': 0.6 }
        }, 'edificios-layer'); 

        // CAMBIO AQUÍ: Añadido 'edificios-layer' como segundo argumento
        map.addLayer({
            'id': 'obras-line', 'type': 'line', 'source': 'obras-source', 'layout': { 'visibility': 'visible' },
            'paint': { 'line-color': colorExp, 'line-width': 2, 'line-dasharray': [2, 2] }
        }, 'edificios-layer');

        setupObrasInteractions();
        buildObrasLegend();
        updateLegendDisplay();

    } catch (err) { console.error("Error Obras:", err); }
}

function setupObrasInteractions() {
    map.on('mouseenter', 'obras-fill', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'obras-fill', () => map.getCanvas().style.cursor = '');

    map.on('click', 'obras-fill', (e) => {
        // Prevenimos que el click traspase a capas inferiores
        e.originalEvent.preventDefault();
        
        const props = e.features[0].properties;
        openObraModal(props); // <--- AQUÍ LLAMAMOS AL MODAL
    });
}

// ==================================================================
// 5. CARGA DE CAPA IOT (Con soporte para foto_sensor)
// ==================================================================

function calculateIoTStatus(props) {
    let maxLevel = 0;
    if (typeof IOT_THRESHOLDS !== 'undefined') {
        Object.keys(IOT_THRESHOLDS).forEach(key => {
            const val = props[key];
            if (val != null) {
                const lim = IOT_THRESHOLDS[key];
                let lvl = 0;
                if (val >= lim.bad) lvl = 2; else if (val >= lim.regular) lvl = 1;
                if (lvl > maxLevel) maxLevel = lvl;
            }
        });
    }
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
                'circle-color': [
                    'match', ['get', 'qualityLevel'], 
                    0, IOT_LEVELS[0].color, 1, IOT_LEVELS[1].color, 2, IOT_LEVELS[2].color, '#ccc'
                ]
            }
        });

        map.on('mouseenter', 'iot-layer', () => map.getCanvas().style.cursor = 'pointer');
        map.on('mouseleave', 'iot-layer', () => map.getCanvas().style.cursor = '');

        // --- INTERACCIÓN POPUP ---
        map.on('click', 'iot-layer', e => {
            const p = e.features[0].properties;

            // 1. DETECCIÓN DE IMAGEN (Aquí está el cambio)
            // Priorizamos 'foto_sensor' que es lo que viene en tu JSON
            const imageUrl = p.foto_sensor || p.imagen || 'https://placehold.co/300x150?text=Sin+Imagen';

            // 2. PARÁMETROS A MOSTRAR
            const metrics = ['NO2', 'O3', 'PM10', 'PM2_5', 'PM1', 'CO2'];
            let rowsHtml = '';

            metrics.forEach(key => {
                const val = p[key];
                if (val !== undefined && val !== null) {
                    let style = '';
                    const unit = p[`unidad_${key}`] || ''; // Lee unidad_NO2, unidad_CO2, etc.

                    // Semáforo de colores
                    if (typeof IOT_THRESHOLDS !== 'undefined' && IOT_THRESHOLDS[key]) {
                        if (val >= IOT_THRESHOLDS[key].bad) {
                            style = 'color:#d32f2f; font-weight:bold;'; // Rojo
                        } else if (val >= IOT_THRESHOLDS[key].regular) {
                            style = 'color:#f57c00; font-weight:bold;'; // Naranja
                        }
                    }
                    
                    rowsHtml += `
                    <div style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding:3px 0;">
                        <span style="color:#555; font-weight:500;">${key}:</span> 
                        <span style="${style}">${val} <small style="color:#999; font-weight:normal;">${unit}</small></span>
                    </div>`;
                }
            });

            // 3. HTML DEL POPUP
            const html = `
                <div class="popup-header" style="background:#2c3e50; color:white; padding:10px; border-radius:4px 4px 0 0;">
                    <i class="fa-solid fa-microchip"></i> ${p.nombre || 'Sensor IoT'}
                    <div style="font-size:0.75em; opacity:0.8; font-weight:normal; margin-top:2px;">
                        ${p.tipo_sensor || 'Estación de Medición'}
                    </div>
                </div>
                <div class="popup-body" style="padding:10px;">
                    <div style="margin-bottom: 10px; text-align:center; background:#f9f9f9;">
                        <img src="${imageUrl}" style="width: 100%; max-height: 150px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd;">
                    </div>
                    
                    <div style="font-size:0.8em; color:#888; margin-bottom:8px;">
                        <i class="fa-regular fa-clock"></i> Última lectura: ${p.fecha_medicion || '-'}
                    </div>
                    
                    <div style="font-size:0.95em; line-height:1.6;">
                        ${rowsHtml}
                    </div>
                </div>`;

            new maplibregl.Popup({className:'custom-popup', maxWidth: '280px'})
                .setLngLat(e.lngLat)
                .setHTML(html)
                .addTo(map);
        });

        buildIoTLegend();
        updateLegendDisplay();

    } catch (err) { console.error("Error IoT:", err); }
}
// ==================================================================
// 6. GESTIÓN DE LEYENDAS Y UI (RESTAURADO)
// ==================================================================

// 1. LEYENDA DE EDIFICIOS (Usos)
function buildStaticLegends() {
    const container = document.getElementById('legend-content');
    if (!container) return;

    let html = '';
    Object.keys(BUILDING_COLORS).forEach(k => {
        // Filtramos el color por defecto si quieres, o lo dejas
        if (k !== 'default') {
            html += `
            <div class="legend-item" style="display: flex; align-items: center; margin-bottom: 5px;">
                <span style="background:${BUILDING_COLORS[k]}; width: 15px; height: 15px; display: inline-block; margin-right: 8px; border-radius: 3px; border: 1px solid #ccc;"></span>
                <span style="font-size: 12px; color: #333;">${USAGE_LABELS[k] || k}</span>
            </div>`;
        }
    });
    
    // Añadir el "Otros/Sin uso" al final
    html += `
    <div class="legend-item" style="display: flex; align-items: center; margin-bottom: 5px;">
        <span style="background:${BUILDING_COLORS['default']}; width: 15px; height: 15px; display: inline-block; margin-right: 8px; border-radius: 3px; border: 1px solid #ccc;"></span>
        <span style="font-size: 12px; color: #333;">${USAGE_LABELS['default']}</span>
    </div>`;

    container.innerHTML = html;
}

// 2. LEYENDA DE IOT (Semáforo Calidad Aire)
function buildIoTLegend() {
    const container = document.getElementById('iot-legend-content');
    if (!container) return;

    let html = '';
    
    // Iteramos sobre los niveles (Buena, Regular, Mala)
    IOT_LEVELS.forEach(l => {
        html += `
        <div class="legend-item" style="display: flex; align-items: center; margin-bottom: 5px;">
            <span style="background:${l.color}; width: 12px; height: 12px; display: inline-block; margin-right: 8px; border-radius: 50%; border: 1px solid #fff; box-shadow: 0 0 2px rgba(0,0,0,0.3);"></span>
            <span style="font-size: 12px; color: #333;">${l.label}</span>
        </div>`;
    });

    // Añadir pequeña nota de thresholds (umbrales)
    html += `
    <div style="margin-top: 8px; border-top: 1px solid #eee; padding-top: 5px; font-size: 10px; color: #777;">
        <i>Umbrales: NO2 > 40 (Reg), > 90 (Mala)</i>
    </div>
    `;

    container.innerHTML = html;
}

// 3. FUNCIÓN PARA MOSTRAR/OCULTAR SEGÚN CHECKBOX
function updateLegendDisplay() {
    // Referencias a los checkboxes
    const bCheck = document.getElementById('buildings-checkbox');
    const iCheck = document.getElementById('iot-checkbox');
    
    // Referencias a los DIVs de las leyendas (contenedores padres)
    const bLegend = document.getElementById('building-legend');
    const iLegend = document.getElementById('iot-legend');

    // Lógica simple: Si el checkbox está activo, mostramos la leyenda
    if (bLegend) bLegend.style.display = (bCheck && bCheck.checked) ? 'block' : 'none';
    if (iLegend) iLegend.style.display = (iCheck && iCheck.checked) ? 'block' : 'none';
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

// Listener para Obras (Actualizado para controlar también la línea de Gemini)
els.obrasCheck.addEventListener('change', e => {
    const visibility = e.target.checked ? 'visible' : 'none';

    // 1. Gestión de la capa principal de Obras
    if(!map.getSource('obras-source')) {
        // Si es la primera vez, cargamos los datos (se mostrarán visibles por defecto)
        loadObrasData(); 
    } else {
        // Si ya existen, cambiamos su visibilidad
        if (map.getLayer('obras-fill')) map.setLayoutProperty('obras-fill', 'visibility', visibility);
        if (map.getLayer('obras-line')) map.setLayoutProperty('obras-line', 'visibility', visibility);
    }

    // 2. Gestión de las capas generadas por la IA (Línea roja y buffer)
    // Si existen en el mapa, obedecen al mismo checkbox
    if (map.getLayer('gemini-line')) {
        map.setLayoutProperty('gemini-line', 'visibility', visibility);
    }
    if (map.getLayer('gemini-buffer-fill')) {
        map.setLayoutProperty('gemini-buffer-fill', 'visibility', visibility);
    }
    if (map.getLayer('gemini-highlight')) {
        map.setLayoutProperty('gemini-highlight', 'visibility', visibility);
    }

    updateLegendDisplay();
});

els.iotCheck.addEventListener('change', e => {
    if(!map.getSource('iot-source')) {
        loadIoTData(); // Esto llama internamente a buildIoTLegend
    } else {
        map.setLayoutProperty('iot-layer', 'visibility', e.target.checked ? 'visible' : 'none');
    }
    // Pequeño timeout para asegurar que si es la primera carga, el HTML ya exista
    updateLegendDisplay();
});

els.popPointsCheck.addEventListener('change', e => map.setLayoutProperty('poblacion-points', 'visibility', e.target.checked?'visible':'none'));
els.popHeatCheck.addEventListener('change', e => {
    map.setLayoutProperty('poblacion-heatmap', 'visibility', e.target.checked?'visible':'none');
    els.heatmapControls.style.display = e.target.checked?'block':'none';
});

// Listener para Cámaras
els.camerasCheck.addEventListener('change', e => {
    if (!map.getSource('cameras-source')) {
        loadCamerasData(); // Primera carga
    } else {
        // Toggle visibilidad si ya está cargada
        map.setLayoutProperty('cameras-layer', 'visibility', e.target.checked ? 'visible' : 'none');
    }
});

// Referencia al checkbox
const bimCheck = document.getElementById('bim-checkbox');

bimCheck.addEventListener('change', (e) => {
    if (e.target.checked) {
        // Activar Capa
        if (!map.getLayer('bim-layer-3d')) {
            // IMPORTANTE: bimLayer es la variable que definimos en el otro archivo
            map.addLayer(bimLayer); // Añadir debajo de los edificios 3D normales si quieres

            // Volamos a la ubicación del BIM para verlo
            map.flyTo({
                center: [2.028238, 41.322620],
                zoom: 18,
                pitch: 60,
                bearing: -45
            });
        }
    } else {
        // Desactivar Capa
        if (map.getLayer('bim-layer-3d')) {
            map.removeLayer('bim-layer-3d');
            // Nota: MapLibre no elimina automáticamente los listeners de click del objeto bimLayer,
            // pero como la capa visual no está, no molestará mucho.
            // Para ser limpios, deberíamos manejar el remove del listener en el objeto bimLayer.
        }
    }
});

// Referencia al elemento
const solarCheck = document.getElementById('solar-checkbox');

if (solarCheck) {
    solarCheck.addEventListener('change', e => {
        if (!map.getSource('solar-source')) {
            loadSolarData(); // Primera carga
        } else {
            // Toggle visibilidad
            map.setLayoutProperty('solar-layer', 'visibility', e.target.checked ? 'visible' : 'none');
        }
    });
}

// ==================================================================
// CONECTAR BOTÓN DEL MODAL CON EL CHECKBOX BIM
// ==================================================================

// Seleccionamos el enlace/botón dentro del modal
const btnVerBimModal = document.querySelector('#modal-bim-container .bim-btn');

if (btnVerBimModal) {
    btnVerBimModal.addEventListener('click', (e) => {
        e.preventDefault(); // Evita el comportamiento por defecto del enlace (#)

        // 1. Cerramos el modal para que el usuario pueda ver el mapa
        closeObraModal();

        // 2. Obtenemos referencia al checkbox del menú lateral
        const checkboxBim = document.getElementById('bim-checkbox');

        if (checkboxBim) {
            // CASO A: El checkbox NO está marcado
            if (!checkboxBim.checked) {
                // Lo marcamos visualmente
                checkboxBim.checked = true;
                
                // IMPORTANTE: Forzamos el evento 'change' manualmente.
                // Esto hará que se ejecute el listener que ya escribiste (cargar capa y volar cámara)
                checkboxBim.dispatchEvent(new Event('change'));
            } 
            // CASO B: El checkbox YA estaba marcado (el usuario lo activó antes)
            else {
                // Solo movemos la cámara porque la capa ya está cargada
                map.flyTo({
                    center: [2.028238, 41.322620],
                    zoom: 18,
                    pitch: 60,
                    bearing: -45
                });
            }
        }
    });
}

document.getElementById('heatmap-radius').addEventListener('input', e => map.setPaintProperty('poblacion-heatmap', 'heatmap-radius', parseFloat(e.target.value)));
document.getElementById('heatmap-intensity').addEventListener('input', e => map.setPaintProperty('poblacion-heatmap', 'heatmap-intensity', parseFloat(e.target.value)));
document.getElementById('toggle-3d').addEventListener('click', () => { const p=map.getPitch(); map.easeTo({pitch:p>0?0:60,bearing:p>0?0:-20}); });
document.getElementById('camera-button').addEventListener('click', () => { map.once('render', () => map.getCanvas().toBlob(b => { const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='mapa.png';a.click(); })); map.triggerRepaint(); });

// ==================================================================
// 8. INTEGRACIÓN GEMINI CHAT (ACTUALIZADO)
// ==================================================================

const chatInput = document.getElementById('gemini-prompt');
const chatBtn = document.getElementById('btn-send-prompt');
const chatOverlay = document.getElementById('chat-overlay');
const chatContent = document.getElementById('chat-content');

chatBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') sendMessage(); });

async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    // Feedback visual en el botón
    chatBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        
        const data = await response.json();
        
        // 1. MOSTRAR RESPUESTA EN EL OVERLAY (No alert)
        chatContent.innerHTML = data.response; // Permite HTML (negritas, saltos)
        chatOverlay.style.display = 'block';

        // 2. Ejecutar acciones en el mapa
        if (data.action === 'update_map' && data.data) {
            handleGeminiMapUpdate(data.data);
        }

    } catch (err) {
        console.error("Error Gemini:", err);
        chatContent.innerHTML = "⚠️ Error conectando con el asistente.";
        chatOverlay.style.display = 'block';
    } finally {
        chatBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
        chatInput.value = '';
    }
}

// ==================================================================
// 9. FUNCIÓN PARA PINTAR RESULTADOS IA (CON ESTILO ORIGINAL)
// ==================================================================

function handleGeminiMapUpdate(mapData) {
    console.log("🗺️ Actualizando mapa con datos de IA...", mapData);

    // 1. LIMPIEZA DE CAPAS ANTERIORES
    if (map.getLayer('gemini-line')) map.removeLayer('gemini-line');
    if (map.getLayer('gemini-highlight')) map.removeLayer('gemini-highlight');
    if (map.getSource('gemini-buffer-source')) map.removeSource('gemini-buffer-source');
    if (map.getSource('gemini-edificios-source')) map.removeSource('gemini-edificios-source');

    // 2. PREPARAR ESTILOS (CLONAR EL ORIGINAL)
    // Por defecto (fallback) usamos dorado y 20m si algo falla
    let colorStyle = '#FFD700'; 
    let heightStyle = 20;       

    // Intentamos "robar" el estilo exacto de la capa original 'edificios-layer'
    // Así mantenemos los colores por uso y las alturas reales.
    if (map.getLayer('edificios-layer')) {
        colorStyle = map.getPaintProperty('edificios-layer', 'fill-extrusion-color');
        heightStyle = map.getPaintProperty('edificios-layer', 'fill-extrusion-height');
        
        // 3. APAGAR CAPA GENERAL (Aislamiento)
        map.setLayoutProperty('edificios-layer', 'visibility', 'none');
        
        // Actualizar UI (checkbox y leyenda)
        const buildCheck = document.getElementById('buildings-checkbox');
        if (buildCheck) buildCheck.checked = false;
        document.getElementById('building-legend').style.display = 'none';
    }

    // 4. AÑADIR EDIFICIOS FILTRADOS (Manteniendo estilo original)
    if (mapData.layers && mapData.layers.edificios) {
        map.addSource('gemini-edificios-source', { type: 'geojson', data: mapData.layers.edificios });

        map.addLayer({
            'id': 'gemini-highlight',
            'type': 'fill-extrusion', 
            'source': 'gemini-edificios-source',
            'paint': {
                'fill-extrusion-color': colorStyle,   // <--- Aquí aplicamos el estilo copiado
                'fill-extrusion-height': heightStyle, // <--- Aquí aplicamos la altura copiada
                'fill-extrusion-opacity': 1,
                'fill-extrusion-base': 0
            }
        });
    }

    // 5. AÑADIR BUFFER (Línea roja debajo de los edificios y todo lo demás)
    if (mapData.layers && mapData.layers.buffer) {
        map.addSource('gemini-buffer-source', { type: 'geojson', data: mapData.layers.buffer });
        
        // ESTRATEGIA: Buscar la capa más baja posible para poner esta línea "en el suelo"
        // En tu setupCoreLayers, el orden es: catastro -> poblacion -> edificios.
        // Intentamos insertar ANTES de 'catastro-layer' para que quede al fondo.
        let bottomLayerId = 'catastro-layer';
        
        // Si por lo que sea catastro no existe, probamos con la siguiente
        if (!map.getLayer(bottomLayerId)) bottomLayerId = 'poblacion-heatmap';
        if (!map.getLayer(bottomLayerId)) bottomLayerId = 'edificios-layer';

        // AÑADIR RELLENO (Fill) semitransparente (Opcional, queda mejor visualmente)
        map.addLayer({
            'id': 'gemini-buffer-fill',
            'type': 'fill',
            'source': 'gemini-buffer-source',
            'paint': {
                'fill-color': '#FF3333',
                'fill-opacity': 0.1 // Muy suave
            }
        }, bottomLayerId); // <--- Insertar al fondo

        // AÑADIR LÍNEA (Line)
        map.addLayer({
            'id': 'gemini-line',
            'type': 'line',
            'source': 'gemini-buffer-source',
            'layout': { 'line-join': 'round', 'line-cap': 'round' },
            'paint': {
                'line-color': '#FF3333', 
                'line-width': 3,
                'line-dasharray': [2, 2]
            }
        }, bottomLayerId); // <--- Insertar al fondo
    }

    // 6. ZOOM
    if (mapData.bounds) {
        map.fitBounds(mapData.bounds, { padding: 150, maxZoom: 18, duration: 2000 });
    }
}

// ==================================================================
// 10: CÁMARAS DGT
// ==================================================================

async function loadCamerasData() {
    // Evitar recargar si ya existe
    if (map.getSource('cameras-source')) return;

    try {
        const response = await fetch('static/data/cameres.geojson');
        const data = await response.json();

        map.addSource('cameras-source', { 'type': 'geojson', 'data': data });

        // Capa visual: Círculo violeta con borde blanco
        map.addLayer({
            'id': 'cameras-layer',
            'type': 'circle',
            'source': 'cameras-source',
            'layout': { 'visibility': 'visible' },
            'paint': {
                'circle-radius': 7,
                'circle-color': '#7E57C2',       // Violeta
                'circle-stroke-width': 2,
                'circle-stroke-color': '#FFFFFF'
            }
        });

        // Cursor pointer al pasar por encima
        map.on('mouseenter', 'cameras-layer', () => map.getCanvas().style.cursor = 'pointer');
        map.on('mouseleave', 'cameras-layer', () => map.getCanvas().style.cursor = '');

        // Click: Mostrar Popup con la IMAGEN
        map.on('click', 'cameras-layer', (e) => {
            const p = e.features[0].properties;
            
            // Truco: Añadimos un timestamp aleatorio al final de la URL para evitar caché del navegador
            // si la cámara actualiza la imagen con el mismo nombre de archivo.
            const imgUrl = `${p.imagen_url}&t=${new Date().getTime()}`;

            const html = `
                <div class="popup-header" style="background:#5e35b1; color:white;">
                    <i class="fa-solid fa-video"></i> ${p.carretera} - PK ${p.pk}
                </div>
                <div class="popup-body" style="padding:0;">
            
                    <div style="width:100%; min-width:250px; min-height:180px; background:#eee; text-align:center; display:flex; align-items:center; justify-content:center;">
                        <img src="${imgUrl}" 
                             style="width:100%; height:auto; display:block;" 
                             alt="Imagen no disponible"
                             onerror="this.src='https://placehold.co/300x200?text=Sin+Señal';">
                    </div>
                    <div style="padding:5px 10px; font-size:11px; color:#666;">
                        Estado: <b>${p.estado}</b> | ID: ${p.id}
                    </div>
                </div>`;

            new maplibregl.Popup({ className: 'custom-popup', maxWidth: '300px' })
                .setLngLat(e.lngLat)
                .setHTML(html)
                .addTo(map);
        });

    } catch (err) {
        console.error("Error cargando Cámaras:", err);
    }
}

// ==================================================================
// 11. ENERGÍA SOLAR Y ECHARTS
// ==================================================================

// Variable global para el gráfico (asegúrate de que esté fuera de la función)
let solarChartInstance = null;

async function loadSolarData() {
    // Si ya cargamos los datos, no hacemos nada (evitar duplicados)
    if (map.getSource('solar-source')) return;

    try {
        const response = await fetch('static/data/plaques.geojson');
        const data = await response.json();

        map.addSource('solar-source', { 'type': 'geojson', 'data': data });

        map.addLayer({
            'id': 'solar-layer',
            'type': 'circle',
            'source': 'solar-source',
            'layout': { 'visibility': 'visible' },
            'paint': {
                'circle-radius': 10,
                'circle-color': '#FFD600',
                'circle-stroke-width': 2,
                'circle-stroke-color': '#FFFFFF',
                'circle-opacity': 0.9
            }
        });

        // 1. CURSOR (MANITA) - Puesto explícitamente aquí para no depender de helpers
        map.on('mouseenter', 'solar-layer', () => map.getCanvas().style.cursor = 'pointer');
        map.on('mouseleave', 'solar-layer', () => map.getCanvas().style.cursor = '');

        // 2. EVENTO CLICK - ESTA ES LA CLAVE
        map.on('click', 'solar-layer', (e) => {
            // Aseguramos que se pare la propagación para que no afecte a otras cosas
            e.originalEvent.preventDefault();
            
            if (e.features.length > 0) {
                const props = e.features[0].properties;
                // Llamamos a la función de abrir el modal
                openSolarModal(props); 
            }
        });

        console.log("✅ Datos solares cargados y click activado.");

    } catch (err) {
        console.error("❌ Error cargando Placas Solares:", err);
    }
}

// ==========================================
// FUNCIONES DEL MODAL SOLAR (FALTABAN ESTAS)
// ==========================================

function openSolarModal(props) {
    console.log("Abriendo modal solar...", props); // Log para depurar
    
    // 1. Rellenar Textos
    document.getElementById('modal-solar-nombre').innerText = props.nombre_ubicacion || 'Placa Solar';
    document.getElementById('modal-solar-potencia').innerText = (props.potencia_panel_wp || 0) + ' Wp';
    document.getElementById('modal-solar-desc').innerText = props.descripcion || 'Sin información adicional.';

    // 2. Mostrar el Modal
    document.getElementById('solar-modal').style.display = 'flex';

    // 3. Procesar Datos para el Gráfico
    let timeSeries = props.serie_temporal;
    if (typeof timeSeries === 'string') {
        try { timeSeries = JSON.parse(timeSeries); } catch (e) { timeSeries = []; }
    }

    // Si no hay datos temporales, evitamos error en map
    if (!timeSeries || !Array.isArray(timeSeries)) {
        timeSeries = [];
    }

    const horas = timeSeries.map(item => {
        const date = new Date(item.hora);
        return date.getHours().toString().padStart(2, '0') + ':00';
    });
    const valores = timeSeries.map(item => item.generacion);

    // 4. Inicializar ECharts
    setTimeout(() => {
        const chartDom = document.getElementById('modal-solar-chart-container');
        if (!chartDom) return;

        // Destruir instancia anterior si existe
        if (solarChartInstance != null) {
            solarChartInstance.dispose();
        }

        solarChartInstance = echarts.init(chartDom);

        const option = {
            grid: { top: 30, right: 20, bottom: 20, left: 50, containLabel: true },
            tooltip: { 
                trigger: 'axis',
                formatter: '{b}: <b>{c} Wh</b>'
            },
            xAxis: {
                type: 'category',
                data: horas,
                axisLine: { lineStyle: { color: '#ccc' } }
            },
            yAxis: {
                type: 'value',
                name: 'Energía (Wh)',
                splitLine: { lineStyle: { type: 'dashed' } }
            },
            series: [{
                data: valores,
                type: 'line',
                smooth: true,
                symbol: 'none',
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: 'rgba(255, 214, 0, 0.6)' },
                        { offset: 1, color: 'rgba(255, 214, 0, 0.0)' }
                    ])
                },
                lineStyle: { color: '#FFD600', width: 3 }
            }]
        };

        solarChartInstance.setOption(option);
        
        window.addEventListener('resize', resizeSolarChart);

    }, 100);
}

function resizeSolarChart() {
    if (solarChartInstance) solarChartInstance.resize();
}

function closeSolarModal() {
    document.getElementById('solar-modal').style.display = 'none';
    
    if (solarChartInstance) {
        solarChartInstance.dispose();
        solarChartInstance = null;
    }
    window.removeEventListener('resize', resizeSolarChart);
}

// --- LÓGICA DEL MODAL DE OBRAS ---
function openObraModal(props) {
    // Parsear datos anidados si es necesario
    let detalle = props.expediente_detalle;
    if (typeof detalle === 'string') { try { detalle = JSON.parse(detalle); } catch (e) { detalle = {}; } }

    // Rellenar textos
    document.getElementById('modal-obra-nombre').innerText = props.nombre || 'Obra Municipal';
    document.getElementById('modal-obra-id').innerText = `Ref: ${detalle.expediente_numero || props.id_obra || 'N/A'}`;
    
    // Estado y Badge
    const estado = detalle.estado_expediente || 'Desconocido';
    const badge = document.getElementById('modal-obra-badge');
    badge.innerText = estado;
    badge.style.backgroundColor = WORKS_COLORS[estado] || '#999';

    // Imagen
    const img = document.getElementById('modal-obra-img');
    img.src = props.imagen_render_url || '';
    
    // Descripción y Datos
    document.getElementById('modal-obra-desc').innerText = detalle.descripcion || 'Sin descripción disponible.';
    
    // Formatear Presupuesto
    const presu = detalle.presupuesto_ejecucion 
        ? new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(detalle.presupuesto_ejecucion)
        : '-';
    
    document.getElementById('modal-obra-presupuesto').innerText = presu;
    document.getElementById('modal-obra-plazo').innerText = detalle.plazo_ejecucion_dias ? `${detalle.plazo_ejecucion_dias} días` : '-';
    document.getElementById('modal-obra-promotor').innerText = detalle.promotor || '-';
    document.getElementById('modal-obra-licencia').innerText = detalle.tipo_licencia || '-';
    document.getElementById('modal-obra-materiales').innerText = detalle.materiales_clave || '-';

    // Botón BIM (solo si hay ID)
    const bimBtn = document.getElementById('modal-bim-container');
    if (props.bim_asset_id) {
        bimBtn.style.display = 'block';
    } else {
        bimBtn.style.display = 'none';
    }

    // Mostrar Modal
    document.getElementById('obra-modal').style.display = 'flex';
}

function closeObraModal() {
    document.getElementById('obra-modal').style.display = 'none';
}

initializeMap();