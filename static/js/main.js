// ==================================================================
// 1. CONFIGURACIÓN Y COLORES
// ==================================================================
let map;

// Nueva paleta de colores pastel solicitada
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
    '4_3_publicServices': '#F5ED9A',
    
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

const baseMaps = {
    'osm': { type: 'raster', tiles: ['https://a.tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap' },
    'esri-satellite': { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Tiles © Esri' },
    'esri-topo': { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Tiles © Esri' }
};

const els = {
    terrainCheck: document.getElementById('terrain-3d-checkbox'),
    catastroCheck: document.getElementById('catastro-checkbox'),
    buildingsCheck: document.getElementById('buildings-checkbox'),
    popPointsCheck: document.getElementById('population-points-checkbox'),
    popHeatCheck: document.getElementById('population-heatmap-checkbox'),
    layersBtn: document.getElementById('layers-toggle'),
    layersPanel: document.getElementById('layers-panel'),
    cameraBtn: document.getElementById('camera-button'),
    mode3dBtn: document.getElementById('toggle-3d'),
    legend: document.getElementById('building-legend'),
    legendContent: document.getElementById('legend-content'),
    heatmapControls: document.getElementById('heatmap-controls'),
    heatmapRadius: document.getElementById('heatmap-radius'),
    heatmapIntensity: document.getElementById('heatmap-intensity')
};

// ==================================================================
// 2. INICIALIZACIÓN
// ==================================================================

function initializeMap() {
    map = new maplibregl.Map({ 
        container: 'map', 
        style: {
            'version': 8, 'name': 'Blank', 'sources': {},
            'layers': [{ 'id': 'background', 'type': 'background', 'paint': { 'background-color': '#f8f9fa' } }]
        },
        center: [CONFIG.lon, CONFIG.lat], zoom: CONFIG.zoom, antialias: true, maxPitch: 85
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true }), 'top-left');

    map.on('load', () => {
        setupBaseLayers();
        setupDataSources();
        buildLegend();
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
// 3. CARGA DE DATOS Y LÓGICA DE ALTURAS
// ==================================================================

async function setupDataSources() {
    // A. Catastro (Fondo)
    map.addSource('catastro-wms', { 
        'type': 'raster', 
        'tiles': ['https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx?bbox={bbox-epsg-3857}&format=image/png&service=WMS&version=1.1.1&request=GetMap&srs=EPSG:3857&width=256&height=256&layers=Catastro&transparent=true'], 
        'tileSize': 256 
    });
    map.addLayer({ 'id': 'catastro-layer', 'type': 'raster', 'source': 'catastro-wms', 'layout': { 'visibility': 'none' } });

    // B. Edificios
    proj4.defs("EPSG:25831","+proj=utm +zone=31 +ellps=GRS80 +units=m +no_defs");
    
    try {
        const response = await fetch('static/data/edificis.geojson');
        const data = await response.json();

        // Conversión de coordenadas al vuelo
        data.features.forEach(feature => {
            if (feature.geometry.type === 'Polygon') {
                feature.geometry.coordinates = feature.geometry.coordinates.map(ring => ring.map(c => proj4("EPSG:25831", "EPSG:4326", c)));
            } else if (feature.geometry.type === 'MultiPolygon') {
                feature.geometry.coordinates = feature.geometry.coordinates.map(poly => poly.map(ring => ring.map(c => proj4("EPSG:25831", "EPSG:4326", c))));
            }
        });

        map.addSource('edificios-source', { 'type': 'geojson', 'data': data });

        // 1. Expresión para el COLOR según Uso (Nueva paleta)
        const colorExp = ['match', ['get', 'currentUse']];
        Object.keys(BUILDING_COLORS).forEach(k => { if (k !== 'default') colorExp.push(k, BUILDING_COLORS[k]); });
        colorExp.push(BUILDING_COLORS['default']);

        // 2. Expresión para la ALTURA (Nueva lógica definida)
        const heightExp = [
            'match', ['get', 'currentUse'],
            '1_residential', [
                'interpolate', ['linear'], ['get', 'value'],
                0, 8,       // Mínimo 8m
                200, 10,    // ~3 pisos
                1000, 25,   // ~8 pisos
                3000, 30,   // ~15 pisos (Modificado a 30m)
                6000, 40    // >6000m2 -> 40m (Modificado)
            ],
            20 // Altura fija para el resto (Industrial, Oficinas, etc.) -> Modificado a 20m
        ];

        map.addLayer({
            'id': 'edificios-layer',
            'type': 'fill-extrusion',
            'source': 'edificios-source',
            'layout': { 'visibility': 'none' },
            'paint': {
                'fill-extrusion-color': colorExp,
                'fill-extrusion-height': heightExp,
                'fill-extrusion-opacity': 0.9,
                'fill-extrusion-base': 0
            }
        });
        
        setupBuildingInteractions();

    } catch (err) { console.error("Error cargando edificios:", err); }

    // C. Población (Capas Superiores)
    map.addSource('poblacion-source', { 'type': 'geojson', 'data': 'static/data/poblacio.geojson' });

    // Mapa de Calor
    map.addLayer({
        'id': 'poblacion-heatmap',
        'type': 'heatmap',
        'source': 'poblacion-source',
        'layout': { 'visibility': 'none' },
        'paint': {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'estimacioPoblacio'], 0, 0, 5, 1],
            'heatmap-intensity': 1,
            'heatmap-radius': 20,
            'heatmap-opacity': 0.8,
            'heatmap-color': [
                'interpolate', ['linear'], ['heatmap-density'],
                0, 'rgba(33,102,172,0)',
                0.2, 'rgb(103,169,207)', 0.4, 'rgb(209,229,240)',
                0.6, 'rgb(253,219,199)', 0.8, 'rgb(239,138,98)', 1, 'rgb(178,24,43)'
            ]
        }
    });

    // Puntos
    map.addLayer({
        'id': 'poblacion-points',
        'type': 'circle',
        'source': 'poblacion-source',
        'layout': { 'visibility': 'none' },
        'paint': {
            'circle-radius': 6,
            'circle-color': '#ffffff',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#e31a1c',
            'circle-opacity': 0.9
        }
    });
}

// ==================================================================
// 4. INTERACCIONES (Popup)
// ==================================================================

function setupBuildingInteractions() {
    map.on('click', 'edificios-layer', (e) => {
        const props = e.features[0].properties;
        const useKey = props.currentUse || 'default';
        const useLabel = USAGE_LABELS[useKey] || 'Desconocido';
        const headerColor = BUILDING_COLORS[useKey] || BUILDING_COLORS['default'];

        // Formateamos valores
        const area = props.value ? Math.round(props.value).toLocaleString() : '0';
        const year = props.beginning ? props.beginning.substring(0,4) : '-';

        const html = `
            <div class="popup-header" style="background-color: ${headerColor}; color: #444; text-shadow: none;">
                <i class="fa-solid fa-building"></i> ${useLabel}
            </div>
            <div class="popup-body">
                <div class="popup-row">
                    <span class="popup-label">Ref. Catastral</span>
                    <span class="popup-value" style="font-size:11px;">${props.reference || '-'}</span>
                </div>
                <div class="popup-row">
                    <span class="popup-label">Viviendas</span>
                    <span class="popup-value">${props.numberOfDwellings || 0}</span>
                </div>
                <div class="popup-row">
                    <span class="popup-label">Superficie</span>
                    <span class="popup-value">${area} m²</span>
                </div>
                <div class="popup-row">
                    <span class="popup-label">Año Const.</span>
                    <span class="popup-value">${year}</span>
                </div>
            </div>
        `;

        new maplibregl.Popup({ className: 'custom-popup', closeButton: true, maxWidth: '300px' })
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(map);
    });

    map.on('mouseenter', 'edificios-layer', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'edificios-layer', () => map.getCanvas().style.cursor = '');
}

function buildLegend() {
    let html = '';
    // Solo mostramos en la leyenda los tipos que tienen un color definido (excluyendo default si se quiere)
    // o todos para que el usuario sepa qué significan.
    Object.keys(BUILDING_COLORS).forEach(key => {
        const color = BUILDING_COLORS[key];
        const label = USAGE_LABELS[key] || key;
        html += `<div class="legend-item"><span class="legend-color" style="background: ${color}; border: 1px solid #ccc;"></span><span>${label}</span></div>`;
    });
    els.legendContent.innerHTML = html;
}

// ==================================================================
// 5. EVENT LISTENERS
// ==================================================================

els.layersBtn.addEventListener('click', (e) => { 
    e.stopPropagation(); 
    els.layersPanel.style.display = els.layersPanel.style.display === 'block' ? 'none' : 'block';
});
els.layersPanel.addEventListener('click', e => e.stopPropagation());

document.querySelectorAll('input[name="base-layer"]').forEach(radio => { 
    radio.addEventListener('change', (e) => { 
        if (e.target.checked) Object.keys(baseMaps).forEach(id => {
            if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', id === e.target.value ? 'visible' : 'none');
        });
    }); 
});

els.terrainCheck.addEventListener('change', (e) => {
    if (map.getSource('maptiler-terrain')) map.setTerrain(e.target.checked ? { 'source': 'maptiler-terrain', 'exaggeration': 1.5 } : null);
});

els.catastroCheck.addEventListener('change', (e) => { 
    if (map.getLayer('catastro-layer')) map.setLayoutProperty('catastro-layer', 'visibility', e.target.checked ? 'visible' : 'none'); 
});

els.buildingsCheck.addEventListener('change', (e) => {
    if (map.getLayer('edificios-layer')) {
        map.setLayoutProperty('edificios-layer', 'visibility', e.target.checked ? 'visible' : 'none');
        els.legend.style.display = e.target.checked ? 'block' : 'none';
    }
});

els.popPointsCheck.addEventListener('change', (e) => {
    if (map.getLayer('poblacion-points')) map.setLayoutProperty('poblacion-points', 'visibility', e.target.checked ? 'visible' : 'none');
});

els.popHeatCheck.addEventListener('change', (e) => {
    if (map.getLayer('poblacion-heatmap')) {
        map.setLayoutProperty('poblacion-heatmap', 'visibility', e.target.checked ? 'visible' : 'none');
        els.heatmapControls.style.display = e.target.checked ? 'block' : 'none';
    }
});

els.heatmapRadius.addEventListener('input', (e) => {
    if (map.getLayer('poblacion-heatmap')) map.setPaintProperty('poblacion-heatmap', 'heatmap-radius', parseFloat(e.target.value));
});
els.heatmapIntensity.addEventListener('input', (e) => {
    if (map.getLayer('poblacion-heatmap')) map.setPaintProperty('poblacion-heatmap', 'heatmap-intensity', parseFloat(e.target.value));
});

els.mode3dBtn.addEventListener('click', () => { 
    const pitch = map.getPitch(); 
    map.easeTo({ pitch: pitch > 0 ? 0 : 60, bearing: pitch > 0 ? 0 : -20 }); 
});

els.cameraBtn.addEventListener('click', () => { 
    map.once('render', () => { 
        map.getCanvas().toBlob(blob => { 
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob); 
            a.download = 'mapa.png'; a.click(); 
        }); 
    }); 
    map.triggerRepaint();
});

// ==================================================================
// 6. LÓGICA IOT (MULTIPARÁMETRO)
// ==================================================================

// 1. Configuración de colores y niveles
const IOT_LEVELS = [
    { value: 0, color: '#4CAF50', label: 'Buena' },    // Verde
    { value: 1, color: '#FF9800', label: 'Regular' },  // Naranja
    { value: 2, color: '#F44336', label: 'Mala' }      // Rojo
];

// 2. Umbrales de Calidad del Aire (Límites para considerar Regular o Mala)
// Si supera 'regular', es naranja. Si supera 'bad', es rojo.
const IOT_THRESHOLDS = {
    'NO2':   { regular: 40,  bad: 90 },
    'O3':    { regular: 80,  bad: 120 },
    'PM10':  { regular: 20,  bad: 40 },
    'PM2_5': { regular: 10,  bad: 20 },
    'PM1':   { regular: 10,  bad: 25 }, // Estimado
    'CO2':   { regular: 1000, bad: 1500 }
};

const iotEls = {
    check: document.getElementById('iot-checkbox'),
    legend: document.getElementById('iot-legend'),
    legendContent: document.getElementById('iot-legend-content')
};

// Función auxiliar para calcular el peor estado de un sensor
function calculateSensorStatus(props) {
    let maxLevel = 0; // 0: Buena, 1: Regular, 2: Mala

    // Recorremos cada contaminante definido en los umbrales
    Object.keys(IOT_THRESHOLDS).forEach(key => {
        const val = props[key];
        if (val !== undefined && val !== null) {
            const limits = IOT_THRESHOLDS[key];
            
            let currentLevel = 0;
            if (val >= limits.bad) {
                currentLevel = 2;
            } else if (val >= limits.regular) {
                currentLevel = 1;
            }

            // Nos quedamos siempre con el peor escenario encontrado
            if (currentLevel > maxLevel) {
                maxLevel = currentLevel;
            }
        }
    });
    return maxLevel;
}

async function loadIoTData() {
    if (map.getSource('iot-source')) return;

    try {
        // 1. Descargamos el GeoJSON manualmente
        const response = await fetch('static/data/iot.geojson');
        const data = await response.json();

        // 2. Procesamos cada punto para añadirle la propiedad "qualityLevel"
        data.features.forEach(feature => {
            feature.properties.qualityLevel = calculateSensorStatus(feature.properties);
        });

        // 3. Añadimos la fuente con los datos ya calculados
        map.addSource('iot-source', { 'type': 'geojson', 'data': data });

        // 4. Añadimos la capa usando esa nueva propiedad para el color
        map.addLayer({
            'id': 'iot-layer',
            'type': 'circle',
            'source': 'iot-source',
            'layout': { 'visibility': 'none' },
            'paint': {
                'circle-radius': 10,
                'circle-color': [
                    'match', ['get', 'qualityLevel'],
                    0, IOT_LEVELS[0].color, // Si es 0 -> Verde
                    1, IOT_LEVELS[1].color, // Si es 1 -> Naranja
                    2, IOT_LEVELS[2].color, // Si es 2 -> Rojo
                    '#ccc' // Por defecto gris
                ],
                'circle-stroke-width': 2,
                'circle-stroke-color': '#fff',
                'circle-opacity': 0.9
            }
        });

        setupIoTInteractions();
        updateIoTLegend();

        // Activamos la visualización si el checkbox estaba marcado mientras cargaba
        if (iotEls.check.checked) {
            map.setLayoutProperty('iot-layer', 'visibility', 'visible');
            iotEls.legend.style.display = 'block';
        }

    } catch (err) {
        console.error("Error cargando datos IoT:", err);
    }
}

function setupIoTInteractions() {
    // Cursor pointer
    map.on('mouseenter', 'iot-layer', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'iot-layer', () => map.getCanvas().style.cursor = '');

    // Popup
    map.on('click', 'iot-layer', (e) => {
        const p = e.features[0].properties;
        const coords = e.features[0].geometry.coordinates.slice();

        // Lista de parámetros a mostrar en el popup
        const params = ['NO2', 'O3', 'PM10', 'PM2_5', 'PM1', 'CO2'];
        
        let rows = params.map(k => {
            if (p[k] !== undefined) {
                // Comprobamos si este valor específico es malo para marcarlo en negrita/color
                const limits = IOT_THRESHOLDS[k];
                let colorStyle = '';
                if (limits && p[k] >= limits.bad) colorStyle = 'color:#F44336; font-weight:bold;';
                else if (limits && p[k] >= limits.regular) colorStyle = 'color:#FF9800; font-weight:bold;';

                return `<div style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding:3px 0;">
                          <span>${k}:</span> 
                          <span style="${colorStyle}">${p[k]} <small style="color:#999; font-weight:normal;">${p['unidad_'+k] || ''}</small></span>
                        </div>`;
            }
            return '';
        }).join('');

        const html = `
            <div class="popup-header" style="background:#333; color:white; padding:8px;">
                <i class="fa-solid fa-circle-nodes"></i> ${p.nombre || 'Sensor'}
            </div>
            <div class="popup-body" style="padding:10px;">
                <div style="margin-bottom:10px; font-size:0.85em; color:#777;">
                    <i class="fa-regular fa-clock"></i> ${p.fecha_medicion}
                </div>
                ${rows}
            </div>
        `;

        new maplibregl.Popup({ className: 'iot-popup', closeButton: true, maxWidth: '300px' })
            .setLngLat(coords)
            .setHTML(html)
            .addTo(map);
    });
}

function updateIoTLegend() {
    let html = '';
    IOT_LEVELS.forEach(item => {
        html += `<div class="legend-item" style="display:flex; align-items:center; margin-bottom:5px;">
                    <span style="background:${item.color}; width:14px; height:14px; border-radius:50%; display:inline-block; margin-right:8px; border:1px solid rgba(0,0,0,0.1);"></span>
                    <span style="font-size:13px;">${item.label}</span>
                 </div>`;
    });
    html += `<div style="margin-top:8px; font-size:11px; color:#666; font-style:italic;">*Color según el peor indicador detectado.</div>`
    iotEls.legendContent.innerHTML = html;
}

// Event Listener para el checkbox
iotEls.check.addEventListener('change', (e) => {
    if (!map.getSource('iot-source')) {
        loadIoTData(); // Carga la primera vez
    } else {
        // Si ya está cargado, solo cambiamos visibilidad
        if (map.getLayer('iot-layer')) {
            map.setLayoutProperty('iot-layer', 'visibility', e.target.checked ? 'visible' : 'none');
            iotEls.legend.style.display = e.target.checked ? 'block' : 'none';
        }
    }
});

// ==================================================================
// 7. LÓGICA OBRAS (Polígonos)
// ==================================================================

const obrasEls = {
    check: document.getElementById('obras-checkbox')
};

async function loadObrasData() {
    if (map.getSource('obras-source')) return;

    try {
        // 1. Cargar datos
        const response = await fetch('/static/data/obres.geojson');
        const data = await response.json();

        map.addSource('obras-source', { 'type': 'geojson', 'data': data });

        // 2. Determinar posición de la capa (Debajo de IoT si existe)
        // Buscamos si existe la capa 'iot-layer' para insertar las obras ANTES (debajo) de ella.
        // Si no existe, intentamos ponerla encima de los edificios, o al final si no hay nada más.
        let beforeLayerId = undefined;
        if (map.getLayer('iot-layer')) {
            beforeLayerId = 'iot-layer';
        } else if (map.getLayer('poblacion-points')) {
            beforeLayerId = 'poblacion-points';
        }

        // 3. Capa de Relleno (Fill) - Naranja semitransparente
        map.addLayer({
            'id': 'obras-fill',
            'type': 'fill',
            'source': 'obras-source',
            'layout': { 'visibility': 'none' },
            'paint': {
                'fill-color': '#e67e22', // Color Naranja Construcción
                'fill-opacity': 0.4
            }
        }, beforeLayerId);

        // 4. Capa de Línea (Outline) - Discontinua
        map.addLayer({
            'id': 'obras-line',
            'type': 'line',
            'source': 'obras-source',
            'layout': { 'visibility': 'none' },
            'paint': {
                'line-color': '#d35400', // Naranja más oscuro
                'line-width': 2,
                'line-dasharray': [2, 2] // Línea discontinua
            }
        }, beforeLayerId);

        setupObrasInteractions();

        // Activar si el checkbox ya estaba marcado
        if (obrasEls.check.checked) {
            toggleObrasLayer(true);
        }

    } catch (err) { console.error("Error cargando Obras:", err); }
}

function setupObrasInteractions() {
    // Cursor pointer
    map.on('mouseenter', 'obras-fill', () => map.getCanvas().style.cursor = 'pointer');
    map.on('mouseleave', 'obras-fill', () => map.getCanvas().style.cursor = '');

    // Popup
    map.on('click', 'obras-fill', (e) => {
        const props = e.features[0].properties;
        
        // NOTA IMPORTANTE: MapLibre a veces convierte objetos anidados en strings al procesar GeoJSON.
        // Parseamos 'expediente_detalle' si viene como texto, o lo usamos directo si es objeto.
        let exp = props.expediente_detalle;
        if (typeof exp === 'string') {
            try { exp = JSON.parse(exp); } catch(e) { exp = {}; }
        }

        // Formateador de moneda
        const formatMoney = (val) => {
            return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(val);
        };

        const html = `
            <div class="popup-header" style="background: #d35400; color: white;">
                <i class="fa-solid fa-trowel-bricks"></i> ${props.nombre}
            </div>
            <div class="popup-body">
                <div style="margin-bottom: 10px; font-size: 13px; color: #666;">
                    <strong>${props.barrio}</strong>
                </div>
                
                <div class="popup-row">
                    <span class="popup-label">Estado:</span>
                    <span class="popup-value" style="color: #d35400; font-weight: bold;">${exp.estado_expediente || '-'}</span>
                </div>
                <div class="popup-row">
                    <span class="popup-label">Presupuesto:</span>
                    <span class="popup-value">${exp.presupuesto_ejecucion ? formatMoney(exp.presupuesto_ejecucion) : '-'}</span>
                </div>
                <div class="popup-row">
                    <span class="popup-label">Fin Previsto:</span>
                    <span class="popup-value">${exp.plazo_ejecucion_dias} días</span>
                </div>
                
                <hr style="margin: 5px 0; border: 0; border-top: 1px solid #eee;">
                
                <div style="font-size: 11px; color: #555; line-height: 1.4;">
                    <strong>Descripción:</strong><br>
                    ${exp.descripcion || 'Sin descripción'}
                </div>
                
                <div style="margin-top:5px; font-size: 10px; color: #999;">
                    Ref: ${exp.expediente_numero}
                </div>
            </div>
        `;

        new maplibregl.Popup({ className: 'custom-popup', closeButton: true, maxWidth: '320px' })
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(map);
    });
}

function toggleObrasLayer(visible) {
    const visibility = visible ? 'visible' : 'none';
    if (map.getLayer('obras-fill')) map.setLayoutProperty('obras-fill', 'visibility', visibility);
    if (map.getLayer('obras-line')) map.setLayoutProperty('obras-line', 'visibility', visibility);
}

// Listener del Checkbox
obrasEls.check.addEventListener('change', (e) => {
    if (!map.getSource('obras-source')) {
        loadObrasData();
    } else {
        toggleObrasLayer(e.target.checked);
    }
});

initializeMap();