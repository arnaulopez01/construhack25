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

initializeMap();