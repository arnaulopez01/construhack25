// static/js/bim_model.js

// 1. CONFIGURACIÓN GEOGRÁFICA
const MODEL_ORIGIN = [2.028238, 41.322620];
const MODEL_ALTITUDE = 0;
const MODEL_ROTATE = [Math.PI / 2, 0, 0]; 

const bimLayer = {
    id: 'bim-layer-3d',
    type: 'custom',
    renderingMode: '3d',

    onAdd: function (map, gl) {
        this.map = map;
        this.camera = new THREE.Camera();
        this.scene = new THREE.Scene();

        // Iluminación
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
        directionalLight.position.set(50, 80, 50);
        this.scene.add(directionalLight);

        // Grupo principal
        this.buildingGroup = new THREE.Group();
        this.scene.add(this.buildingGroup);

        // Construir Modelo
        this.createBIMBuilding();

        // Coordenadas
        const modelAsMercatorCoordinate = maplibregl.MercatorCoordinate.fromLngLat(MODEL_ORIGIN, MODEL_ALTITUDE);
        const modelMeterInMercatorCoordinateUnits = modelAsMercatorCoordinate.meterInMercatorCoordinateUnits();

        this.modelTransform = {
            translateX: modelAsMercatorCoordinate.x,
            translateY: modelAsMercatorCoordinate.y,
            translateZ: modelAsMercatorCoordinate.z,
            rotateX: MODEL_ROTATE[0],
            rotateY: MODEL_ROTATE[1],
            rotateZ: MODEL_ROTATE[2],
            scale: modelMeterInMercatorCoordinateUnits
        };

        this.renderer = new THREE.WebGLRenderer({
            canvas: map.getCanvas(),
            context: gl,
            antialias: true
        });
        this.renderer.autoClear = false;
        this.renderer.shadowMap.enabled = true;

        // Raycaster
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.clickHandler = (e) => this.onClick(e);
        this.map.on('click', this.clickHandler);
    },

    onRemove: function(map, gl) {
        if (this.clickHandler) this.map.off('click', this.clickHandler);
        const popup = document.getElementById('bim-popup');
        if (popup) popup.style.display = 'none';
    },

    render: function (gl, matrix) {
        const rotationX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), this.modelTransform.rotateX);
        const rotationY = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 1, 0), this.modelTransform.rotateY);
        const rotationZ = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 0, 1), this.modelTransform.rotateZ);

        const m = new THREE.Matrix4().fromArray(matrix);
        const l = new THREE.Matrix4()
            .makeTranslation(this.modelTransform.translateX, this.modelTransform.translateY, this.modelTransform.translateZ)
            .scale(new THREE.Vector3(this.modelTransform.scale, -this.modelTransform.scale, this.modelTransform.scale))
            .multiply(rotationX)
            .multiply(rotationY)
            .multiply(rotationZ);

        this.camera.projectionMatrix = m.multiply(l);
        this.renderer.resetState();
        this.renderer.render(this.scene, this.camera);
        if(this.map) this.map.triggerRepaint();
    },

    // ==================================================================
    // LÓGICA DE CONSTRUCCIÓN CON VIGAS INTERNAS
    // ==================================================================
    createBIMBuilding: function() {
        const towerHeight = 60;  
        const numFloors = 20;    
        const floorHeight = towerHeight / numFloors; 
        const towerWidth = 20;   
        const towerDepth = 30;   

        const GREY_COLOR = 0x7f8c8d;
        const CONCRETE_PILLAR_COLOR = 0x4B5563;
        const STEEL_BEAM_COLOR = 0x2c3e50;
        
        const pillarMaterial = new THREE.MeshLambertMaterial({ color: CONCRETE_PILLAR_COLOR });
        const beamMaterial = new THREE.MeshLambertMaterial({ color: STEEL_BEAM_COLOR });
        
        // Posiciones de los pilares principales
        const pillarX = [-8, 8]; 
        const pillarZ = [-12, 0, 12]; 

        for (let i = 0; i < numFloors; i++) {
            const y = (i * floorHeight);
            const beamY = y + floorHeight/2 + 0.2; // Altura de vigas (sobre el pilar)

            // ----------------------------------------------------------
            // 1. PILARES (Verticales)
            // ----------------------------------------------------------
            const pGeo = new THREE.CylinderGeometry(0.4, 0.4, floorHeight, 8);
            pillarX.forEach(px => {
                pillarZ.forEach(pz => {
                    const p = new THREE.Mesh(pGeo, pillarMaterial);
                    p.position.set(px, y + floorHeight/2, pz);
                    p.userData.bimData = { name: `Pilar P${i+1}`, attributes: { mat: 'Hormigón HA-30', sec: 'D=80cm' } };
                    this.buildingGroup.add(p);
                });
            });

            // ----------------------------------------------------------
            // 2. VIGAS MAESTRAS (Estructurales Principales)
            // ----------------------------------------------------------
            
            // A. Vigas Transversales (Eje X) - Unen izquierda y derecha
            // Conectan (-8, z) con (8, z) en cada línea de pilares
            const beamGeoTrans = new THREE.BoxGeometry(16, 0.6, 0.5); // Largo 16 (de -8 a 8)
            pillarZ.forEach(pz => {
                const b = new THREE.Mesh(beamGeoTrans, beamMaterial);
                b.position.set(0, beamY, pz); // Centro en X=0
                b.userData.bimData = { name: `Viga Maestra Transversal P${i+1}`, attributes: { tipo: 'Principal', perfil: 'IPN-500' } };
                this.buildingGroup.add(b);
            });

            // B. Vigas Longitudinales (Eje Z) - Unen fondo y frente
            // Conectan (-12 a 0) y (0 a 12) a lo largo de los pilares
            const beamGeoLong = new THREE.BoxGeometry(0.5, 0.6, 12); // Largo 12 (distancia entre pilares Z)
            pillarX.forEach(px => {
                [-6, 6].forEach(zCenter => { // Centros en Z=-6 y Z=6
                    const b = new THREE.Mesh(beamGeoLong, beamMaterial);
                    b.position.set(px, beamY, zCenter);
                    b.userData.bimData = { name: `Viga Maestra Long. P${i+1}`, attributes: { tipo: 'Principal', perfil: 'IPN-500' } };
                    this.buildingGroup.add(b);
                });
            });

            // ----------------------------------------------------------
            // 3. VIGAS INTERNAS / VIGUETAS (Relleno de forjado)
            // ----------------------------------------------------------
            // Cruzan de izquierda a derecha (Eje X) en los espacios intermedios
            // para dar sensación de suelo sólido y estructura interna.
            
            const innerBeamGeo = new THREE.BoxGeometry(16, 0.3, 0.2); // Más finas
            
            // Creamos viguetas cada 2 metros a lo largo del eje Z (desde -12 a 12)
            for (let z = -10; z < 12; z += 2) {
                // Evitamos superponer con las vigas maestras que están en Z = -12, 0, 12
                if (Math.abs(z) < 0.5 || Math.abs(z - 12) < 0.5 || Math.abs(z + 12) < 0.5) continue;

                const ib = new THREE.Mesh(innerBeamGeo, beamMaterial);
                ib.position.set(0, beamY, z);
                ib.userData.bimData = { 
                    name: `Vigueta Forjado P${i+1}`, 
                    attributes: { tipo: 'Secundaria', perfil: 'IPE-200', función: 'Soporte losa' } 
                };
                this.buildingGroup.add(ib);
            }

            // ----------------------------------------------------------
            // 4. VENTANAS
            // ----------------------------------------------------------
            const wGeo = new THREE.BoxGeometry(2, floorHeight * 0.6, 0.1);
            const wMat = new THREE.MeshLambertMaterial({ color: 0x374151 });
            for(let w = -2; w <= 2; w++) {
                const xPos = w * 4; 
                const winFront = new THREE.Mesh(wGeo, wMat);
                winFront.position.set(xPos, y + floorHeight/2, towerDepth/2 - 0.1);
                winFront.userData.bimData = { name: 'Ventana', attributes: { tipo: 'Doble Vidrio', planta: i+1 } };
                this.buildingGroup.add(winFront);

                const winBack = new THREE.Mesh(wGeo, wMat);
                winBack.position.set(xPos, y + floorHeight/2, -towerDepth/2 + 0.1);
                winBack.userData.bimData = winFront.userData.bimData;
                this.buildingGroup.add(winBack);
            }
        }

        // ----------------------------------------------------------
        // 5. FACHADA Y TECHO
        // ----------------------------------------------------------
        const tGeo = new THREE.BoxGeometry(towerWidth, towerHeight, towerDepth);
        const tMat = new THREE.MeshLambertMaterial({ color: GREY_COLOR, transparent: true, opacity: 0.15, depthWrite: false });
        const tower = new THREE.Mesh(tGeo, tMat);
        tower.position.y = towerHeight/2;
        tower.userData.bimData = { name: 'Fachada Torre', attributes: { tipo: 'Muro Cortina', altura: '60m' } };
        this.buildingGroup.add(tower);

        const rGeo = new THREE.PlaneGeometry(towerWidth, towerDepth);
        const rMat = new THREE.MeshLambertMaterial({ color: GREY_COLOR });
        const roof = new THREE.Mesh(rGeo, rMat);
        roof.rotation.x = -Math.PI/2;
        roof.position.y = towerHeight;
        roof.userData.bimData = { name: 'Cubierta', attributes: { tipo: 'Plana Transitable' } };
        this.buildingGroup.add(roof);

        // --- ENTORNO ---
        this.createEnvironment();
    },

    createEnvironment: function() {
        const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
        const leafMat = new THREE.MeshLambertMaterial({ color: 0x228B22 });
        const poleMat = new THREE.MeshLambertMaterial({ color: 0x34495e });
        const lightMat = new THREE.MeshBasicMaterial({ color: 0xFFFF99 });

        const addTree = (x, z) => {
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 4, 8), trunkMat);
            trunk.position.set(x, 2, z);
            trunk.userData.bimData = { name: 'Árbol Urbano', attributes: { tipo: 'Platanus' } };
            
            const leaves = new THREE.Mesh(new THREE.ConeGeometry(3, 6, 16), leafMat);
            leaves.position.set(x, 7, z);
            leaves.userData.bimData = trunk.userData.bimData;
            this.buildingGroup.add(trunk);
            this.buildingGroup.add(leaves);
        };

        const addLamp = (x, z) => {
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 10, 8), poleMat);
            pole.position.set(x, 5, z);
            pole.userData.bimData = { name: 'Farola LED', attributes: { modelo: 'CityLight' } };

            const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.8), lightMat);
            fixture.position.set(x, 10.2, z);
            fixture.userData.bimData = pole.userData.bimData;
            this.buildingGroup.add(pole);
            this.buildingGroup.add(fixture);
        };
        
        addLamp(-15, 20); addLamp(15, -20);
        addTree(-18, 10); addTree(-15, -18);
        addTree(18, 15); addTree(15, -12);
    },

    onClick: function(e) {
        if (!this.map || !this.map.getLayer(this.id)) return;

        const popup = document.getElementById('bim-popup');
        const canvas = this.map.getCanvas();
        const rect = canvas.getBoundingClientRect();
        const x = e.originalEvent.clientX - rect.left;
        const y = e.originalEvent.clientY - rect.top;
        
        if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

        this.mouse.x = (x / rect.width) * 2 - 1;
        this.mouse.y = -(y / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.buildingGroup.children, true);

        if (intersects.length > 0) {
            let bestHit = null;
            for (let i = 0; i < intersects.length; i++) {
                const obj = intersects[i].object;
                if (obj.userData.bimData) {
                    if (obj.userData.bimData.name !== 'Fachada Torre') {
                        bestHit = obj; break; 
                    }
                    if (!bestHit) bestHit = obj;
                }
            }

            if (bestHit) {
                const data = bestHit.userData.bimData;
                let html = `<strong>${data.name}</strong><hr style="margin:5px 0; border-color:rgba(255,255,255,0.3)">`;
                for (const [k, v] of Object.entries(data.attributes)) {
                    html += `<div style="font-size:0.85em; margin-bottom:2px;">
                                <span style="color:#aaa">${k}:</span> ${v}
                             </div>`;
                }
                popup.innerHTML = html;
                popup.style.display = 'block';
                popup.style.left = e.originalEvent.clientX + 15 + 'px';
                popup.style.top = e.originalEvent.clientY + 15 + 'px';
                return;
            }
        }
        popup.style.display = 'none';
    }
};