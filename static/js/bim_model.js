// static/js/bim_model.js

// 1. CONFIGURACIÓN GEOGRÁFICA
const MODEL_ORIGIN = [2.028238, 41.322620]; 
const MODEL_ALTITUDE = 0; 
const MODEL_ROTATE = [Math.PI / 2, 0, 0]; // Ajuste de rotación Ejes WebGL vs Mapa

const bimLayer = {
    id: 'bim-layer-3d',
    type: 'custom',
    renderingMode: '3d',

    onAdd: function (map, gl) {
        this.map = map;
        this.camera = new THREE.Camera();
        this.scene = new THREE.Scene();

        // --- ILUMINACIÓN DE LA ESCENA 3D ---
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
        directionalLight.position.set(30, 40, 30);
        this.scene.add(directionalLight);

        // --- GRUPO PRINCIPAL (Para facilitar rotaciones o raycasting) ---
        this.buildingGroup = new THREE.Group();
        this.scene.add(this.buildingGroup);

        // --- CONSTRUCCIÓN DEL MODELO COMPLETO ---
        this.createBIMBuilding();

        // --- SISTEMA DE COORDENADAS ---
        const modelAsMercatorCoordinate = maplibregl.MercatorCoordinate.fromLngLat(
            MODEL_ORIGIN,
            MODEL_ALTITUDE
        );
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

        // --- INTERACCIÓN (RAYCASTER) ---
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.map.on('click', (e) => this.onClick(e));
    },

    render: function (gl, matrix) {
        const rotationX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), this.modelTransform.rotateX);
        const rotationY = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 1, 0), this.modelTransform.rotateY);
        const rotationZ = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(0, 0, 1), this.modelTransform.rotateZ);

        const m = new THREE.Matrix4().fromArray(matrix);
        const l = new THREE.Matrix4()
            .makeTranslation(
                this.modelTransform.translateX,
                this.modelTransform.translateY,
                this.modelTransform.translateZ
            )
            .scale(new THREE.Vector3(this.modelTransform.scale, -this.modelTransform.scale, this.modelTransform.scale))
            .multiply(rotationX)
            .multiply(rotationY)
            .multiply(rotationZ);

        this.camera.projectionMatrix = m.multiply(l);
        this.renderer.resetState();
        this.renderer.render(this.scene, this.camera);
        this.map.triggerRepaint();
    },

    // ==================================================================
    // LÓGICA DE CONSTRUCCIÓN BIM (COMPLETA)
    // ==================================================================
    createBIMBuilding: function() {
        // Constantes
        const towerHeight = 30;
        const numFloors = 10;
        const floorHeight = towerHeight / numFloors;
        const towerWidth = 10;
        const towerDepth = 15;

        // Materiales
        const GREY_COLOR = 0x7f8c8d;
        const CONCRETE_PILLAR_COLOR = 0x4B5563;
        const STEEL_BEAM_COLOR = 0x2c3e50;
        
        // 1. ESTRUCTURA INTERNA (Pilares y Vigas)
        const pillarMaterial = new THREE.MeshLambertMaterial({ color: CONCRETE_PILLAR_COLOR });
        const beamMaterial = new THREE.MeshLambertMaterial({ color: STEEL_BEAM_COLOR });
        
        const pillarXPositions = [-3, 3];
        const pillarZPositions = [-5, 0, 5];
        const pillarRadius = 0.3;
        const beamHeight = 0.4;
        const beamWidth = 0.4;

        for (let i = 0; i < numFloors; i++) {
            const floorY = (i * floorHeight);

            // --- A. PILARES ---
            const pillarGeometry = new THREE.CylinderGeometry(pillarRadius, pillarRadius, floorHeight, 8);
            pillarXPositions.forEach(px => {
                pillarZPositions.forEach(pz => {
                    const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
                    pillar.position.set(px, floorY + (floorHeight / 2), pz);
                    
                    pillar.userData.bimData = {
                        name: `Pilar ${i+1}`,
                        attributes: {
                            función: 'Estructural - Carga Vertical',
                            material: 'Hormigón Armado C25/30',
                            sección: `Cilíndrica, D=${pillarRadius * 2}m`,
                            planta: i + 1,
                            código: `P-${i+1}`
                        }
                    };
                    this.buildingGroup.add(pillar);
                });
            });

            // --- B. VIGAS LONGITUDINALES (Z) ---
            pillarXPositions.forEach(px => {
                for(let j = 0; j < pillarZPositions.length - 1; j++) {
                    const z1 = pillarZPositions[j];
                    const z2 = pillarZPositions[j+1];
                    const beamLength = Math.abs(z2 - z1);
                    const beamGeometry = new THREE.BoxGeometry(beamWidth, beamHeight, beamLength);
                    
                    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
                    beam.position.set(px, floorY + (beamHeight / 2), (z1 + z2) / 2);
                    
                    beam.userData.bimData = {
                        name: `Viga ${i+1} Longitudinal`,
                        attributes: { función: 'Estructural', material: 'Acero S275', planta: i + 1 }
                    };
                    this.buildingGroup.add(beam);
                }
            });

            // --- C. VIGAS TRANSVERSALES (X) ---
            pillarZPositions.forEach(pz => {
                for(let k = 0; k < pillarXPositions.length - 1; k++) {
                    const x1 = pillarXPositions[k];
                    const x2 = pillarXPositions[k+1];
                    const beamLength = Math.abs(x2 - x1);
                    const beamGeometry = new THREE.BoxGeometry(beamLength, beamHeight, beamWidth);
                    
                    const beam = new THREE.Mesh(beamGeometry, beamMaterial);
                    beam.position.set((x1 + x2) / 2, floorY + (beamHeight / 2), pz);
                    
                    beam.userData.bimData = {
                        name: `Viga ${i+1} Transversal`,
                        attributes: { función: 'Estructural', material: 'Acero S275', planta: i + 1 }
                    };
                    this.buildingGroup.add(beam);
                }
            });

            // --- D. VENTANAS ---
            const windowMaterial = new THREE.MeshLambertMaterial({ color: 0x374151, emissive: 0x374151 });
            const winY = (i * floorHeight) + (floorHeight / 2);
            
            for (let j = -1; j <= 1; j++) {
                const windowGeometry = new THREE.BoxGeometry(1.5, floorHeight * 0.6, 0.1);
                
                // Frontales
                const winFront = new THREE.Mesh(windowGeometry, windowMaterial);
                winFront.position.set(j * 3, winY, (towerDepth / 2) - 0.1);
                winFront.userData.bimData = {
                    name: 'Ventana',
                    attributes: { tipo: 'Proyectante', material: 'Vidrio Doble', planta: i+1 }
                };
                this.buildingGroup.add(winFront);

                // Traseras
                const winBack = new THREE.Mesh(windowGeometry, windowMaterial);
                winBack.position.set(j * 3, winY, -(towerDepth / 2) + 0.1);
                winBack.userData.bimData = winFront.userData.bimData; // Reutilizar datos
                this.buildingGroup.add(winBack);
            }
        }

        // 2. FACHADA (TRANSPARENTE)
        const towerGeometry = new THREE.BoxGeometry(towerWidth, towerHeight, towerDepth);
        const towerMaterial = new THREE.MeshLambertMaterial({ 
            color: GREY_COLOR, transparent: true, opacity: 0.3, depthWrite: false 
        }); 
        const tower = new THREE.Mesh(towerGeometry, towerMaterial);
        tower.position.y = towerHeight / 2;
        tower.userData.bimData = {
            name: 'Fachada/Cerramiento',
            attributes: { tipo: 'Muro cortina', u_valor: '0.9 W/(m²·K)', superficie: 'Total' }
        };
        this.buildingGroup.add(tower);

        // 3. TECHO PLANO
        const roofGeometry = new THREE.PlaneGeometry(towerWidth, towerDepth);
        const roofMaterial = new THREE.MeshLambertMaterial({ color: GREY_COLOR });
        const roof = new THREE.Mesh(roofGeometry, roofMaterial);
        roof.rotation.x = -Math.PI / 2;
        roof.position.y = towerHeight;
        roof.userData.bimData = {
            name: 'Cubierta Plana',
            attributes: { tipo: 'Invertida', material: 'Asfalto/Grava', pendiente: '2%' }
        };
        this.buildingGroup.add(roof);

        // 4. ENTORNO (ÁRBOLES Y FAROLAS)
        this.createEnvironment();
    },

    createEnvironment: function() {
        // Materiales
        const trunkMaterial = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
        const leafMaterial = new THREE.MeshLambertMaterial({ color: 0x228B22 });
        const poleMaterial = new THREE.MeshLambertMaterial({ color: 0x34495e });
        const lightMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFF99 });

        // Función Helper Árbol
        const addTree = (x, z) => {
            const trunkH = 4, trunkR = 0.4;
            const trunk = new THREE.Mesh(new THREE.CylinderGeometry(trunkR, trunkR, trunkH, 8), trunkMaterial);
            trunk.position.set(x, trunkH/2, z);
            
            const coneH = 6, coneR = 3;
            const leaves = new THREE.Mesh(new THREE.ConeGeometry(coneR, coneH, 16), leafMaterial);
            leaves.position.set(x, trunkH + coneH/2, z);
            
            this.buildingGroup.add(trunk);
            this.buildingGroup.add(leaves);
        };

        // Función Helper Farola
        const addLamp = (x, z) => {
            const poleH = 10, poleR = 0.15;
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(poleR, poleR, poleH, 8), poleMaterial);
            pole.position.set(x, poleH/2, z);
            
            const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.8), lightMaterial);
            fixture.position.set(x, poleH + 0.2, z);

            this.buildingGroup.add(pole);
            this.buildingGroup.add(fixture);
        };

        // Colocar elementos
        addLamp(-12, 5); addLamp(12, -12);
        addTree(-15, 8); addTree(-18, -5);
        addTree(12, 12); addTree(15, -10);
    },

    // ==================================================================
    // MANEJO DE CLICS
    // ==================================================================
    onClick: function(e) {
        const point = e.point;
        const canvas = this.map.getCanvas();
        
        this.mouse.x = (point.x / canvas.clientWidth) * 2 - 1;
        this.mouse.y = -(point.y / canvas.clientHeight) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        
        // IMPORTANTE: true en el segundo parámetro busca recursivamente en el grupo
        const intersects = this.raycaster.intersectObjects(this.buildingGroup.children, true);
        const popup = document.getElementById('bim-popup');

        if (intersects.length > 0) {
            // Buscamos el primer objeto que tenga datos BIM (a veces clicamos en un hijo sin datos)
            const hit = intersects.find(i => i.object.userData.bimData);
            
            if (hit) {
                const data = hit.object.userData.bimData;
                let html = `<strong>${data.name}</strong><hr style="margin:5px 0; border-color:rgba(255,255,255,0.3)">`;
                for (const [k, v] of Object.entries(data.attributes)) {
                    html += `<div style="font-size:0.85em; margin-bottom:2px;">
                                <span style="color:#aaa">${k}:</span> ${v}
                             </div>`;
                }

                popup.innerHTML = html;
                popup.style.display = 'block';
                popup.style.left = e.originalEvent.clientX + 10 + 'px';
                popup.style.top = e.originalEvent.clientY + 10 + 'px';
                return;
            }
        }
        popup.style.display = 'none';
    }
};