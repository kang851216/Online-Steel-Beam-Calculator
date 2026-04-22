// static/threeViewer.js
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// Global variables
let scene, camera, renderer, labelRenderer, controls;
let allObjects = [];
let isInitialized = false;
let globalAxisWidget = null;

// Store current model state for rebuilding
let currentModelState = {
    beamLength: null,
    supports: null,
    loads: null,
    reactions: null,
    beamType: null,
    sectionProps: null,
    feaResults: null
};

// Initialize the 3D scene
function init3D() {
    const container = document.getElementById('canvas3d');
    if (!container) {
        console.error('Container not found');
        return;
    }
    
    // Clear only canvas elements, preserve UI controls
    const canvases = container.querySelectorAll('canvas');
    canvases.forEach(canvas => canvas.remove());
    
    // Create scene
    scene = new THREE.Scene();
    //scene.background = new THREE.Color(0x1a1a2e); // white: 0xffffff, light gray: 0xdddddd, dark gray: 0x1a1a2e
    scene.background = new THREE.Color(0xffffff);
    scene.fog = new THREE.FogExp2(0xffffff, 0.008);
    
    // Create camera
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(6, 4, 8);
    camera.lookAt(0, 0, 0);
    
    // WebGL Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.setClearColor(0xffffff);
    renderer.domElement.style.position = 'absolute';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.zIndex = '1';
    // Insert as first child so UI controls stay on top
    container.insertBefore(renderer.domElement, container.firstChild);
    
    // CSS2 Renderer for text labels (reliable!)
    labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(container.clientWidth, container.clientHeight);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0px';
    labelRenderer.domElement.style.left = '0px';
    labelRenderer.domElement.style.pointerEvents = 'none';
    labelRenderer.domElement.style.zIndex = '10';
    container.insertBefore(labelRenderer.domElement, container.firstChild);
    
    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.rotateSpeed = 1.0;
    controls.zoomSpeed = 1.2;
    controls.panSpeed = 0.8;
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404060);
    scene.add(ambientLight);
    
    const mainLight = new THREE.DirectionalLight(0xffffff, 1);
    mainLight.position.set(5, 10, 7);
    mainLight.castShadow = true;
    mainLight.receiveShadow = true;
    scene.add(mainLight);
    
    const fillLight = new THREE.PointLight(0x4466cc, 0.4);
    fillLight.position.set(0, -2, 0);
    scene.add(fillLight);
    
    const rimLight = new THREE.PointLight(0xffaa66, 0.5);
    rimLight.position.set(-3, 2, -4);
    scene.add(rimLight);
    
    const frontLight = new THREE.PointLight(0x88aaff, 0.3);
    frontLight.position.set(2, 1, 5);
    scene.add(frontLight);
    
    // Grid helper
    const gridHelper = new THREE.GridHelper(14, 20, 0x88aaff, 0x335588);
    gridHelper.position.y = -0.7;
    //scene.add(gridHelper);
    
    isInitialized = true;
    console.log('3D Scene initialized');
    
    // Start animation loop
    animate();
}

function animate() {
    requestAnimationFrame(animate);
    if (controls) controls.update();
    updateGlobalAxisWidget();
    updateLabelSizing();
    if (renderer && scene && camera) renderer.render(scene, camera);
    if (labelRenderer && scene && camera) labelRenderer.render(scene, camera);
}

function clearScene() {
    if (!scene) return;
    
    allObjects.forEach(obj => {
        if (obj.parent) scene.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            if (Array.isArray(obj.material)) {
                obj.material.forEach(m => m.dispose());
            } else {
                obj.material.dispose();
            }
        }
    });
    allObjects = [];
    globalAxisWidget = null;
    if (labelRenderer && labelRenderer.domElement) {
        const staleAxisLabels = labelRenderer.domElement.querySelectorAll('.axis-label');
        staleAxisLabels.forEach(el => el.remove());
    }
    console.log('Scene cleared');
}

function positionToX(position, beamLength, lengthM) {
    const t = position / beamLength;
    return -lengthM/2 + t * lengthM;
}

// Create CSS2D text label (reliable method)
function createTextLabel(text, color, fontSize = '12px', bgColor = 'rgba(0,0,0,0.7)') {
    const div = document.createElement('div');
    div.textContent = text;
    div.style.color = color;
    div.style.fontSize = fontSize;
    div.style.fontWeight = '600';
    div.style.fontFamily = 'monospace';
    div.style.backgroundColor = bgColor;
    div.style.padding = '2px 5px';
    div.style.borderRadius = '4px';
    div.style.border = `1px solid ${color}`;
    div.style.whiteSpace = 'nowrap';
    div.style.boxShadow = '0 1px 2px rgba(0,0,0,0.22)';
    div.style.backdropFilter = 'blur(4px)';
    div.dataset.baseFontSize = `${parseFloat(fontSize) || 12}`;
    return new CSS2DObject(div);
}

function updateLabelSizing() {
    if (!camera) return;
    const target = (controls && controls.target) ? controls.target : new THREE.Vector3(0, 0, 0);
    const camDist = camera.position.distanceTo(target);
    const scale = THREE.MathUtils.clamp(6 / Math.max(camDist, 0.001), 0.6, 1.0);

    allObjects.forEach((obj) => {
        if (!obj || !obj.isCSS2DObject || !obj.element) return;
        const base = parseFloat(obj.element.dataset.baseFontSize || '10');
        const px = Math.max(8, Math.min(base, base * scale));
        obj.element.style.fontSize = `${px.toFixed(1)}px`;
    });
}

function createDiagonalSlash3D(start, end, color = 0x000000) {
    const mx = (start.x + end.x) / 2;
    const my = (start.y + end.y) / 2;
    const mz = (start.z + end.z) / 2;
    const d = 0.06;
    const points = [
        new THREE.Vector3(mx - d, my - d, mz),
        new THREE.Vector3(mx + d, my + d, mz)
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color });
    return new THREE.Line(geo, mat);
}

function createSolidArrow3D(start, end, color = 0x000000, shaftRadius = 0.018, headRadius = 0.045, headHeight = 0.09) {
    const group = new THREE.Group();
    const dir = new THREE.Vector3().subVectors(end, start);
    const totalLen = dir.length();
    if (totalLen < 1e-6) return group;

    const n = dir.clone().normalize();
    const shaftLen = Math.max(0.01, totalLen - headHeight);
    const mat = new THREE.MeshStandardMaterial({ color });

    const shaftGeo = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLen, 12);
    const shaft = new THREE.Mesh(shaftGeo, mat);
    const shaftCenter = start.clone().add(n.clone().multiplyScalar(shaftLen * 0.5));
    shaft.position.copy(shaftCenter);
    shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    group.add(shaft);

    const headGeo = new THREE.ConeGeometry(headRadius, headHeight, 12);
    const head = new THREE.Mesh(headGeo, mat);
    const headCenter = start.clone().add(n.clone().multiplyScalar(shaftLen + headHeight * 0.5));
    head.position.copy(headCenter);
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    group.add(head);

    return group;
}

function createGlobalCoordinate3D(lengthM) {
    const group = new THREE.Group();
    const axisLen = 0.28;
    const origin = new THREE.Vector3(0, 0, 0);

    const xArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), origin, axisLen, 0xff3333, 0.085, 0.042);
    const yArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), origin, axisLen, 0x22aa22, 0.085, 0.042);
    const zArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), origin, axisLen * 0.8, 0x3366ff, 0.07, 0.035);
    group.add(xArrow, yArrow, zArrow);

    const xLabel = createTextLabel('x', '#ff3333', '8px', 'rgba(255,255,255,0.8)');
    xLabel.element.classList.add('axis-label');
    xLabel.position.copy(new THREE.Vector3(axisLen + 0.05, 0, 0));
    group.add(xLabel);

    const yLabel = createTextLabel('y', '#22aa22', '8px', 'rgba(255,255,255,0.8)');
    yLabel.element.classList.add('axis-label');
    yLabel.position.copy(new THREE.Vector3(0, axisLen + 0.05, 0));
    group.add(yLabel);

    const zLabel = createTextLabel('z', '#3366ff', '8px', 'rgba(255,255,255,0.8)');
    zLabel.element.classList.add('axis-label');
    zLabel.position.copy(new THREE.Vector3(0, 0, axisLen * 0.8 + 0.05));
    group.add(zLabel);

    return group;
}

function updateGlobalAxisWidget() {
    if (!globalAxisWidget || !camera) return;

    const dist = 1.8;
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const viewH = 2 * Math.tan(vFov / 2) * dist;
    const viewW = viewH * camera.aspect;
    const marginX = 0.34;
    const marginY = 0.24;

    const localPos = new THREE.Vector3(
        -viewW / 2 + marginX,
        -viewH / 2 + marginY,
        -dist
    );
    const worldPos = localPos.clone().applyMatrix4(camera.matrixWorld);
    globalAxisWidget.position.copy(worldPos);

    // Keep the widget in true world orientation so axes match beam/global directions.
    globalAxisWidget.quaternion.identity();
}

// Create beam cross-section shape based on type (fixed sizes for visual distinction)
function createBeamCrossSection(beamType) {
    const shape = new THREE.Shape();
    
    if (beamType === 'Hbeam' || beamType === 'Ibeam') {
        // H-beam or I-beam: Two flanges connected by a web (fixed size)
        const h = 0.28;        // Height
        const b = 0.20;        // Width
        const tf = 0.04;       // Flange thickness
        const tw = 0.025;      // Web thickness
        
        const halfW = b / 2;
        const halfH = h / 2;
        const halfTw = tw / 2;
        
        // Bottom flange
        shape.moveTo(-halfW, -halfH);
        shape.lineTo(halfW, -halfH);
        shape.lineTo(halfW, -halfH + tf);
        shape.lineTo(halfTw, -halfH + tf);
        
        // Web
        shape.lineTo(halfTw, halfH - tf);
        
        // Top flange
        shape.lineTo(halfW, halfH - tf);
        shape.lineTo(halfW, halfH);
        shape.lineTo(-halfW, halfH);
        shape.lineTo(-halfW, halfH - tf);
        shape.lineTo(-halfTw, halfH - tf);
        
        // Web (other side)
        shape.lineTo(-halfTw, -halfH + tf);
        shape.lineTo(-halfW, -halfH + tf);
        shape.lineTo(-halfW, -halfH);
        
    } else if (beamType === 'PFC') {
        // Channel section (C-shape)
        const h = 0.28;
        const b = 0.12;
        const tf = 0.04;
        const tw = 0.025;
        
        const halfH = h / 2;
        
        // Outer profile
        shape.moveTo(0, -halfH);
        shape.lineTo(b, -halfH);
        shape.lineTo(b, -halfH + tf);
        shape.lineTo(tw, -halfH + tf);
        shape.lineTo(tw, halfH - tf);
        shape.lineTo(b, halfH - tf);
        shape.lineTo(b, halfH);
        shape.lineTo(0, halfH);
        shape.lineTo(0, -halfH);
        
    } else if (beamType === 'RHS') {
        // Rectangular Hollow Section
        const h = 0.28;
        const b = 0.20;
        const t = 0.03;
        
        const halfW = b / 2;
        const halfH = h / 2;
        
        // Outer rectangle
        shape.moveTo(-halfW, -halfH);
        shape.lineTo(halfW, -halfH);
        shape.lineTo(halfW, halfH);
        shape.lineTo(-halfW, halfH);
        shape.lineTo(-halfW, -halfH);
        
        // Inner rectangle (hole)
        const hole = new THREE.Path();
        hole.moveTo(-halfW + t, -halfH + t);
        hole.lineTo(halfW - t, -halfH + t);
        hole.lineTo(halfW - t, halfH - t);
        hole.lineTo(-halfW + t, halfH - t);
        hole.lineTo(-halfW + t, -halfH + t);
        shape.holes.push(hole);
        
    } else if (beamType === 'SHS') {
        // Square Hollow Section
        const d = 0.24;
        const t = 0.03;
        const halfD = d / 2;
        
        // Outer square
        shape.moveTo(-halfD, -halfD);
        shape.lineTo(halfD, -halfD);
        shape.lineTo(halfD, halfD);
        shape.lineTo(-halfD, halfD);
        shape.lineTo(-halfD, -halfD);
        
        // Inner square (hole)
        const hole = new THREE.Path();
        hole.moveTo(-halfD + t, -halfD + t);
        hole.lineTo(halfD - t, -halfD + t);
        hole.lineTo(halfD - t, halfD - t);
        hole.lineTo(-halfD + t, halfD - t);
        hole.lineTo(-halfD + t, -halfD + t);
        shape.holes.push(hole);
        
    } else if (beamType === 'CHS') {
        // Circular Hollow Section (Pipe)
        const outerR = 0.12;
        const t = 0.025;
        const innerR = outerR - t;
        
        // Outer circle
        shape.absarc(0, 0, outerR, 0, Math.PI * 2, false);
        
        // Inner circle (hole)
        const hole = new THREE.Path();
        hole.absarc(0, 0, innerR, 0, Math.PI * 2, true);
        shape.holes.push(hole);
        
    } else if (beamType === 'EA' || beamType === 'UA') {
        // Equal or Unequal Angle (L-shape)
        const h = 0.18;
        const b = 0.18;
        const t = 0.035;
        
        // L-shaped angle (centered)
        const halfH = h / 2;
        const halfB = b / 2;
        
        shape.moveTo(-halfB, -halfH);
        shape.lineTo(halfB, -halfH);
        shape.lineTo(halfB, -halfH + t);
        shape.lineTo(-halfB + t, -halfH + t);
        shape.lineTo(-halfB + t, halfH);
        shape.lineTo(-halfB, halfH);
        shape.lineTo(-halfB, -halfH);
        
    } else if (beamType === 'Box') {
        // Box section (solid rectangular)
        const h = 0.28;
        const b = 0.20;
        
        const halfW = b / 2;
        const halfH = h / 2;
        
        shape.moveTo(-halfW, -halfH);
        shape.lineTo(halfW, -halfH);
        shape.lineTo(halfW, halfH);
        shape.lineTo(-halfW, halfH);
        shape.lineTo(-halfW, -halfH);
        
    } else {
        // Default: simple rectangle
        const h = 0.28;
        const w = 0.20;
        shape.moveTo(-w/2, -h/2);
        shape.lineTo(w/2, -h/2);
        shape.lineTo(w/2, h/2);
        shape.lineTo(-w/2, h/2);
        shape.lineTo(-w/2, -h/2);
    }
    
    return shape;
}

// Global variable to store current visualization mode
let currentVisualizationMode = 'none'; // 'none', 'moment', 'shear', 'deflection'

// Create color from value (blue = negative/low, white = zero/mid, red = positive/high)
function getColorFromValue(value, minVal, maxVal) {
    const absMax = Math.max(Math.abs(minVal), Math.abs(maxVal));
    if (absMax === 0) return new THREE.Color(0.8, 0.8, 0.8);
    
    const normalized = value / absMax;
    
    if (normalized > 0) {
        // Positive: white to red
        return new THREE.Color(1, 1 - normalized * 0.8, 1 - normalized * 0.8);
    } else {
        // Negative: white to blue
        const absNorm = Math.abs(normalized);
        return new THREE.Color(1 - absNorm * 0.8, 1 - absNorm * 0.8, 1);
    }
}

function interpolateDiagramValue(x, xCoords, values) {
    if (!xCoords || !values || xCoords.length === 0 || values.length === 0) return 0;
    if (x <= xCoords[0]) return values[0] || 0;
    if (x >= xCoords[xCoords.length - 1]) return values[values.length - 1] || 0;

    for (let i = 0; i < xCoords.length - 1; i++) {
        const x0 = xCoords[i];
        const x1 = xCoords[i + 1];
        if (x >= x0 && x <= x1) {
            const v0 = values[i] || 0;
            const v1 = values[i + 1] || 0;
            const span = x1 - x0;
            if (span === 0) return v0;
            const t = (x - x0) / span;
            return v0 * (1 - t) + v1 * t;
        }
    }
    return 0;
}

function applyBeamDeflectionShape(geometry, beamLength, feaResults) {
    if (!feaResults || !geometry?.attributes?.position) return;

    const deflY = feaResults.deflection_diagram?.y || [];
    const deflX = feaResults.deflection_diagram?.x || [];
    const deflZ = feaResults.deflection_diagram_transverse?.y || [];
    const deflZX = feaResults.deflection_diagram_transverse?.x || [];

    const hasVertical = deflY.length > 1 && deflX.length > 1;
    const hasTransverse = deflZ.length > 1 && deflZX.length > 1;
    if (!hasVertical && !hasTransverse) return;

    const maxVert = hasVertical ? Math.max(...deflY.map(v => Math.abs(v))) : 0;
    const maxTran = hasTransverse ? Math.max(...deflZ.map(v => Math.abs(v))) : 0;
    const maxDeflectionMm = Math.max(maxVert, maxTran);
    if (maxDeflectionMm <= 1e-9) return;

    // Use an amplified but bounded scale so deformation is visible and stable.
    const targetMaxVisual = beamLength * 0.08;
    const deformationScale = Math.min(80, targetMaxVisual / (maxDeflectionMm / 1000));

    const positions = geometry.attributes.position;

    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        const xNormalized = x + beamLength / 2;

        let dy = 0;
        let dz = 0;

        if (hasVertical) {
            const deflMm = interpolateDiagramValue(xNormalized, deflX, deflY);
            // Match 3D vertical deformation direction with the deflection diagram convention.
            dy = (deflMm / 1000) * deformationScale;
        }
        if (hasTransverse) {
            const deflMmZ = interpolateDiagramValue(xNormalized, deflZX, deflZ);
            dz = (deflMmZ / 1000) * deformationScale;
        }

        positions.setY(i, positions.getY(i) + dy);
        positions.setZ(i, positions.getZ(i) + dz);
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
}

function createBeam(length, beamType, feaResults) {
    let geometry;
    
    if (beamType) {
        // Create cross-section shape (fixed size for visual distinction)
        const shape = createBeamCrossSection(beamType);
        
        // Use more steps for better contour visualization
        const numSteps = feaResults ? 50 : 1;
        const extrudeSettings = {
            steps: numSteps,
            depth: length,
            bevelEnabled: false
        };
        
        geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        
        // First, center the extruded geometry along Z-axis (before rotation)
        geometry.translate(0, 0, -length / 2);
        // Then rotate so beam extends along X-axis
        geometry.rotateY(Math.PI / 2);
        
    } else {
        // Fallback to simple box with segments for contour
        const segments = feaResults ? 50 : 1;
        geometry = new THREE.BoxGeometry(length, 0.28, 0.4, segments, 1, 1);
    }
    
    // Deform beam shape only when deflection mode is active.
    if (feaResults && currentVisualizationMode === 'deflection') {
        applyBeamDeflectionShape(geometry, length, feaResults);
    }

    // Apply vertex colors if FEA results are provided
    let material;
    if (feaResults && currentVisualizationMode !== 'none') {
        // Apply vertex colors based on FEA results
        applyVertexColors(geometry, length, feaResults);
        material = new THREE.MeshBasicMaterial({ 
            vertexColors: true
        });
    } else {
        material = new THREE.MeshBasicMaterial({ 
            color: 0xd3d3d3  // Light grey, no lighting effects
        });
    }
    
    const beam = new THREE.Mesh(geometry, material);
    
    // Add edge lines to make the profile more recognizable
    const edges = new THREE.EdgesGeometry(geometry, 15);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x333333, linewidth: 1 });
    const wireframe = new THREE.LineSegments(edges, lineMaterial);
    beam.add(wireframe);
    
    return beam;
}

function applyVertexColors(geometry, beamLength, feaResults) {
    if (!feaResults) return;
    
    let values, xCoords;
    
    // Select data based on visualization mode
    if (currentVisualizationMode === 'moment') {
        values = feaResults.moment_diagram?.y || [];
        xCoords = feaResults.moment_diagram?.x || [];
    } else if (currentVisualizationMode === 'shear') {
        values = feaResults.shear_diagram?.y || [];
        xCoords = feaResults.shear_diagram?.x || [];
    } else if (currentVisualizationMode === 'deflection') {
        values = feaResults.deflection_diagram?.y || [];
        xCoords = feaResults.deflection_diagram?.x || [];
    }
    
    if (!values || values.length === 0) return;
    
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    
    const positions = geometry.attributes.position;
    const colors = [];
    
    // For each vertex, determine its X position and assign color
    for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        
        // Normalize x from [-beamLength/2, beamLength/2] to [0, beamLength]
        const xNormalized = (x + beamLength / 2);
        
        // Find corresponding value by interpolating
        let value = 0;
        for (let j = 0; j < xCoords.length - 1; j++) {
            if (xNormalized >= xCoords[j] && xNormalized <= xCoords[j + 1]) {
                const t = (xNormalized - xCoords[j]) / (xCoords[j + 1] - xCoords[j]);
                value = values[j] * (1 - t) + values[j + 1] * t;
                break;
            }
        }
        
        const color = getColorFromValue(value, minVal, maxVal);
        colors.push(color.r, color.g, color.b);
    }
    
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
}

function createSupport(positionX, type, reaction) {
    const group = new THREE.Group();
    const yBase = -0.45;
    let supportCenterY = yBase - 0.12;
    
    // Create 3D support geometry
    if (type === 'pinned') {
        const geometry = new THREE.ConeGeometry(0.18, 0.38, 3);
        const material = new THREE.MeshStandardMaterial({ color: 0xdc3545 });
        const triangle = new THREE.Mesh(geometry, material);
        triangle.position.set(0, yBase - 0.08, 0);
        triangle.castShadow = true;
        group.add(triangle);
        
        const circleGeo = new THREE.SphereGeometry(0.075, 24, 24);
        const circleMat = new THREE.MeshStandardMaterial({ color: 0xdc3545 });
        const circle = new THREE.Mesh(circleGeo, circleMat);
        circle.position.set(0, yBase + 0.10, 0);
        group.add(circle);
        supportCenterY = (yBase - 0.08 + yBase + 0.10) / 2;
    } 
    else if (type === 'roller') {
        const geometry = new THREE.ConeGeometry(0.18, 0.38, 3);
        const material = new THREE.MeshStandardMaterial({ color: 0x28a745 });
        const triangle = new THREE.Mesh(geometry, material);
        triangle.position.set(0, yBase - 0.08, 0);
        triangle.castShadow = true;
        group.add(triangle);
        
        const sphereGeo = new THREE.SphereGeometry(0.065, 24, 24);
        const sphereMat = new THREE.MeshStandardMaterial({ color: 0x28a745 });
        const leftWheel = new THREE.Mesh(sphereGeo, sphereMat);
        leftWheel.position.set(-0.10, yBase - 0.26, 0);
        const rightWheel = new THREE.Mesh(sphereGeo, sphereMat);
        rightWheel.position.set(0.10, yBase - 0.26, 0);
        group.add(leftWheel);
        group.add(rightWheel);
        supportCenterY = (yBase - 0.08 + yBase - 0.26) / 2;
    } 
    else if (type === 'fixed') {
        const boxGeo = new THREE.BoxGeometry(0.38, 0.46, 0.38);
        const boxMat = new THREE.MeshStandardMaterial({ color: 0xffc107 });
        const box = new THREE.Mesh(boxGeo, boxMat);
        // Place fixed support marker at beam section centroid.
        box.position.set(0, 0, 0);
        group.add(box);
        supportCenterY = 0;
    }
    
    group.position.x = positionX;
    
    // Add support reactions (same visual style intent as 2D FBD)
    if (reaction) {
        const reactionColor = 0x000000;
        const reactionHex = '#000000';
        const reactionBaseY = supportCenterY;
        const reactionZ = 0.16;

        const Fy = reaction.Fy || 0;
        if (Math.abs(Fy) > 0.01) {
            const arrowLen = Math.min(0.7, 0.34 + Math.abs(Fy) / 30);
            const start = new THREE.Vector3(0, reactionBaseY, reactionZ);
            const end = Fy > 0
                ? new THREE.Vector3(0, reactionBaseY - arrowLen, reactionZ)
                : new THREE.Vector3(0, reactionBaseY + arrowLen, reactionZ);
            const arrow = createSolidArrow3D(start, end, reactionColor, 0.014, 0.036, 0.08);
            group.add(arrow);
            group.add(createDiagonalSlash3D(start, end, reactionColor));

            const fyLabel = createTextLabel(`Rz=${Math.abs(Fy).toFixed(1)} kN`, reactionHex, '9px', 'rgba(255,255,255,0.85)');
            fyLabel.position.set(positionX + 0.12, Math.min(start.y, end.y) - 0.08, 0.22);
            scene.add(fyLabel);
            allObjects.push(fyLabel);
        }

        const Fz = reaction.Fz || 0;
        if (Math.abs(Fz) > 0.01) {
            const transLen = Math.min(0.65, 0.30 + Math.abs(Fz) / 30);
            const start = new THREE.Vector3(0, reactionBaseY, reactionZ);
            const end = Fz >= 0
                ? new THREE.Vector3(0, reactionBaseY, reactionZ + transLen)
                : new THREE.Vector3(0, reactionBaseY, reactionZ - transLen);
            const transArrow = createSolidArrow3D(start, end, reactionColor, 0.014, 0.036, 0.08);
            group.add(transArrow);
            group.add(createDiagonalSlash3D(start, end, reactionColor));

            const dotGeo = new THREE.SphereGeometry(0.06, 18, 18);
            const dotMat = new THREE.MeshBasicMaterial({ color: reactionColor });
            const dot = new THREE.Mesh(dotGeo, dotMat);
            dot.position.set(0, reactionBaseY, reactionZ);
            group.add(dot);

            const fzLabel = createTextLabel(`Ry=${Math.abs(Fz).toFixed(1)} kN`, reactionHex, '9px', 'rgba(255,255,255,0.85)');
            fzLabel.position.set(positionX + 0.12, reactionBaseY + 0.02, Fz >= 0 ? reactionZ + 0.18 : reactionZ - 0.18);
            scene.add(fzLabel);
            allObjects.push(fzLabel);
        }

        const Fx = reaction.Fx || 0;
        if (Math.abs(Fx) > 0.01) {
            const axialLen = 0.55;
            const yFx = reactionBaseY;
            const start = new THREE.Vector3(0, yFx, reactionZ + 0.12);
            const end = Fx >= 0
                ? new THREE.Vector3(axialLen, yFx, reactionZ + 0.12)
                : new THREE.Vector3(-axialLen, yFx, reactionZ + 0.12);
            const arrow = createSolidArrow3D(start, end, reactionColor, 0.016, 0.04, 0.09);
            group.add(arrow);
            group.add(createDiagonalSlash3D(start, end, reactionColor));

            const fxLabel = createTextLabel(`Rx=${Math.abs(Fx).toFixed(1)} kN`, reactionHex, '9px', 'rgba(255,255,255,0.85)');
            fxLabel.position.set(positionX + (Fx >= 0 ? 0.2 : -0.45), yFx - 0.08, 0.24);
            scene.add(fxLabel);
            allObjects.push(fxLabel);
        }

        const Mz = reaction.Mz || 0;
        if (type === 'fixed' && Math.abs(Mz) > 0.01) {
            const radius = 0.2;
            const center = new THREE.Vector3(0, reactionBaseY + 0.12, reactionZ);
            const points = [];
            const clockwise = Mz >= 0;
            const a0 = clockwise ? Math.PI * 0.2 : Math.PI * 1.8;
            const a1 = clockwise ? Math.PI * 1.8 : Math.PI * 0.2;
            for (let i = 0; i <= 24; i++) {
                const a = a0 + (i / 24) * (a1 - a0);
                points.push(new THREE.Vector3(center.x + radius * Math.cos(a), center.y + radius * Math.sin(a), center.z));
            }
            const curveGeo = new THREE.BufferGeometry().setFromPoints(points);
            const curveMat = new THREE.LineBasicMaterial({ color: reactionColor });
            const curve = new THREE.Line(curveGeo, curveMat);
            group.add(curve);

            const tail = points[points.length - 2];
            const head = points[points.length - 1];
            const dir = new THREE.Vector3().subVectors(head, tail).normalize();
            const mArrow = new THREE.ArrowHelper(dir, tail, head.distanceTo(tail), reactionColor, 0.1, 0.05);
            group.add(mArrow);
            group.add(createDiagonalSlash3D(tail, head, reactionColor));

            const mzLabel = createTextLabel(`Mz=${Math.abs(Mz).toFixed(1)} kN·m`, reactionHex, '9px', 'rgba(255,255,255,0.85)');
            mzLabel.position.set(positionX + 0.2, reactionBaseY + 0.34, 0.24);
            scene.add(mzLabel);
            allObjects.push(mzLabel);
        }
    }
    
    return group;
}

function createPointLoad(positionX, magnitude) {
    const group = new THREE.Group();
    const isDownward = magnitude > 0;
    const absMag = Math.abs(magnitude);
    const arrowLength = Math.min(0.6, 0.3 + absMag / 30);
    const color = isDownward ? 0x3b82f6 : 0xef4444;
    const colorHex = isDownward ? '#3b82f6' : '#ef4444';
    
    const beamTop = 0.14;  // Top of beam cross-section
    const shaftRadius = 0.035;
    const headRadius = 0.09;
    const headHeight = 0.18;
    
    // Arrow shaft
    const shaftLength = arrowLength - headHeight;
    const shaftGeo = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 12);
    const shaftMat = new THREE.MeshStandardMaterial({ color: color });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    
    // Arrow head (cone)
    const headGeo = new THREE.ConeGeometry(headRadius, headHeight, 12);
    const headMat = new THREE.MeshStandardMaterial({ color: color });
    const head = new THREE.Mesh(headGeo, headMat);
    
    if (isDownward) {
        // Arrow pointing down
        shaft.position.set(0, beamTop + shaftLength/2, 0);
        head.position.set(0, beamTop, 0);
        head.rotation.x = Math.PI;  // Point downward
    } else {
        // Arrow pointing up
        shaft.position.set(0, beamTop - shaftLength/2, 0);
        head.position.set(0, beamTop, 0);
        head.rotation.x = 0;  // Point upward
    }
    
    group.add(shaft);
    group.add(head);
    group.position.x = positionX;
    
    // Add CSS2D magnitude label at arrow tail
    const tailY = isDownward ? beamTop + shaftLength : beamTop - shaftLength;
    const labelY = tailY + (isDownward ? 0.06 : -0.06);
    const label = createTextLabel(`${absMag} kN`, colorHex, '9px');
    label.position.set(positionX, labelY, 0.2);
    scene.add(label);
    allObjects.push(label);
    
    return group;
}

function createTransversePointLoad(positionX, magnitude) {
    const group = new THREE.Group();
    const isPositiveZ = magnitude > 0;  // Positive = toward viewer
    const absMag = Math.abs(magnitude);
    const arrowLength = Math.min(0.6, 0.3 + absMag / 30);
    const color = 0xff9800;  // Orange color for transverse
    const colorHex = '#ff9800';
    
    const beamCenter = 0;  // Center of beam cross-section
    const shaftRadius = 0.035;
    const headRadius = 0.09;
    const headHeight = 0.18;
    
    // Arrow shaft
    const shaftLength = arrowLength - headHeight;
    const shaftGeo = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 12);
    const shaftMat = new THREE.MeshStandardMaterial({ color: color });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.rotation.x = Math.PI / 2;  // Rotate to point in Z direction
    
    // Arrow head (cone)
    const headGeo = new THREE.ConeGeometry(headRadius, headHeight, 12);
    const headMat = new THREE.MeshStandardMaterial({ color: color });
    const head = new THREE.Mesh(headGeo, headMat);
    head.rotation.x = Math.PI / 2;  // Rotate to point in Z direction
    
    if (isPositiveZ) {
        // Arrow pointing toward viewer (+Z)
        shaft.position.set(0, beamCenter, shaftLength/2);
        head.position.set(0, beamCenter, shaftLength);
    } else {
        // Arrow pointing away from viewer (-Z)
        shaft.position.set(0, beamCenter, -shaftLength/2);
        head.position.set(0, beamCenter, -shaftLength);
        head.rotation.x = -Math.PI / 2;  // Flip direction
    }
    
    group.add(shaft);
    group.add(head);
    group.position.x = positionX;
    
    // Add CSS2D magnitude label at arrow tail
    const tailZ = 0;
    const labelZ = tailZ + (isPositiveZ ? 0.06 : -0.06);
    const label = createTextLabel(`${absMag} kN (T)`, colorHex, '9px');
    label.position.set(positionX, beamCenter + 0.1, labelZ);
    scene.add(label);
    allObjects.push(label);
    
    return group;
}

function createUDL(startPos, endPos, magnitude, beamLength, lengthM) {
    const group = new THREE.Group();
    const startX = positionToX(startPos, beamLength, lengthM);
    const endX = positionToX(endPos, beamLength, lengthM);
    const length = Math.abs(endX - startX);
    const centerX = startX + length/2;
    const isDownward = magnitude > 0;
    const absMag = Math.abs(magnitude);
    
    const beamTop = 0.14;
    const shaftRadius = 0.028;
    const headRadius = 0.07;
    const headHeight = 0.14;
    const arrowLength = 0.35;
    const shaftLength = arrowLength - headHeight;
    const lineY = isDownward ? (beamTop + shaftLength) : (beamTop - shaftLength);
    
    // Horizontal guide line for UDL extent
    const guidePts = [
        new THREE.Vector3(startX, lineY, 0),
        new THREE.Vector3(endX, lineY, 0)
    ];
    const guideGeo = new THREE.BufferGeometry().setFromPoints(guidePts);
    const guideMat = new THREE.LineBasicMaterial({ color: 0x3b82f6 });
    const guideLine = new THREE.Line(guideGeo, guideMat);
    group.add(guideLine);
    
    // Multiple arrows
    const numArrows = Math.max(5, Math.min(9, Math.floor(length * 2)));
    for (let i = 0; i <= numArrows; i++) {
        const arrowX = startX + (length * i / numArrows);
        
        const shaftGeo = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 8);
        const shaftMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6 });
        const shaft = new THREE.Mesh(shaftGeo, shaftMat);
        
        const headGeo = new THREE.ConeGeometry(headRadius, headHeight, 8);
        const headMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6 });
        const head = new THREE.Mesh(headGeo, headMat);
        
        if (isDownward) {
            shaft.position.set(arrowX, beamTop + shaftLength/2, 0);
            head.position.set(arrowX, beamTop, 0);
            head.rotation.x = Math.PI;  // Point downward
        } else {
            shaft.position.set(arrowX, beamTop - shaftLength/2, 0);
            head.position.set(arrowX, beamTop, 0);
            head.rotation.x = 0;  // Point upward
        }
        
        group.add(shaft);
        group.add(head);
    }
    
    // Add CSS2D label at representative arrow tail
    const tailY = lineY;
    const label = createTextLabel(`${absMag} kN/m`, '#3b82f6', '9px');
    label.position.set(centerX, tailY + (isDownward ? 0.06 : -0.06), 0.2);
    scene.add(label);
    allObjects.push(label);
    
    return group;
}

function createTransverseUDL(startPos, endPos, magnitude, beamLength, lengthM) {
    const group = new THREE.Group();
    const startX = positionToX(startPos, beamLength, lengthM);
    const endX = positionToX(endPos, beamLength, lengthM);
    const length = Math.abs(endX - startX);
    const centerX = startX + length / 2;
    const isPositiveZ = magnitude > 0;
    const absMag = Math.abs(magnitude);

    const beamCenterY = 0;
    const shaftRadius = 0.022;
    const headRadius = 0.055;
    const headHeight = 0.11;
    const arrowLength = 0.28;
    const shaftLength = arrowLength - headHeight;
    const lineZ = isPositiveZ ? shaftLength : -shaftLength;

    // Horizontal guide line for transverse UDL extent
    const guidePts = [
        new THREE.Vector3(startX, beamCenterY, lineZ),
        new THREE.Vector3(endX, beamCenterY, lineZ)
    ];
    const guideGeo = new THREE.BufferGeometry().setFromPoints(guidePts);
    const guideMat = new THREE.LineBasicMaterial({ color: 0xff9800 });
    const guideLine = new THREE.Line(guideGeo, guideMat);
    group.add(guideLine);

    const numArrows = Math.max(5, Math.min(9, Math.floor(length * 2)));
    for (let i = 0; i <= numArrows; i++) {
        const ax = startX + (length * i / numArrows);

        const shaftGeo = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 10);
        const shaftMat = new THREE.MeshStandardMaterial({ color: 0xff9800 });
        const shaft = new THREE.Mesh(shaftGeo, shaftMat);
        shaft.rotation.x = Math.PI / 2;

        const headGeo = new THREE.ConeGeometry(headRadius, headHeight, 10);
        const headMat = new THREE.MeshStandardMaterial({ color: 0xff9800 });
        const head = new THREE.Mesh(headGeo, headMat);

        if (isPositiveZ) {
            shaft.position.set(ax, beamCenterY, shaftLength / 2);
            head.position.set(ax, beamCenterY, shaftLength);
            head.rotation.x = Math.PI / 2;
        } else {
            shaft.position.set(ax, beamCenterY, -shaftLength / 2);
            head.position.set(ax, beamCenterY, -shaftLength);
            head.rotation.x = -Math.PI / 2;
        }

        group.add(shaft);
        group.add(head);
    }

    const label = createTextLabel(`${absMag} kN/m (T)`, '#ff9800', '9px');
    label.position.set(centerX, beamCenterY + 0.12, isPositiveZ ? 0.18 : -0.18);
    scene.add(label);
    allObjects.push(label);

    return group;
}

function createMomentLoad(positionX, magnitude, beamLength, lengthM) {
    const group = new THREE.Group();
    const x = positionX;
    const absMag = Math.abs(magnitude);
    const isClockwise = magnitude > 0;
    
    // Curved arrow with thicker tube
    const points = [];
    const radius = 0.4;
    const startAngle = isClockwise ? Math.PI / 2 : Math.PI;
    const endAngle = isClockwise ? Math.PI * 1.5 : Math.PI * 2;
    
    for (let i = 0; i <= 32; i++) {
        const angle = startAngle + (i / 32) * (endAngle - startAngle);
        points.push(new THREE.Vector3(x + radius * Math.cos(angle), 0.3 + radius * Math.sin(angle), 0.3));
    }
    
    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeo = new THREE.TubeGeometry(curve, 64, 0.025, 8, false);
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0xff6b6b });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    group.add(tube);
    
    // Arrow head at the end
    const lastPoint = points[points.length - 1];
    const secondLastPoint = points[points.length - 2];
    const direction = new THREE.Vector3().subVectors(lastPoint, secondLastPoint).normalize();
    const headGeo = new THREE.ConeGeometry(0.08, 0.18, 10);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xff6b6b });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.copy(lastPoint);
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    group.add(head);
    
    // Add CSS2D label at curved arrow tail
    const tailPoint = points[0];
    const label = createTextLabel(`${absMag} kN·m`, '#ff6b6b', '9px');
    label.position.set(tailPoint.x, tailPoint.y + 0.08, tailPoint.z + 0.08);
    scene.add(label);
    allObjects.push(label);
    
    return group;
}

function createAxialLoad(magnitude, lengthM) {
    const group = new THREE.Group();
    const absMag = Math.abs(magnitude);
    const isTension = magnitude > 0;
    
    const leftEndX = -lengthM/2 - 0.3;
    const rightEndX = lengthM/2 + 0.3;
    const y = 0.22;
    const z = 0.0;
    const arrowLen = 0.52;

    // Use the same solid arrow style as other loads/reactions to avoid distorted cones.
    const leftStart = new THREE.Vector3(leftEndX, y, z);
    const leftEnd = isTension
        ? new THREE.Vector3(leftEndX + arrowLen, y, z)
        : new THREE.Vector3(leftEndX - arrowLen, y, z);
    const leftArrow = createSolidArrow3D(leftStart, leftEnd, 0xffaa66, 0.02, 0.05, 0.11);

    const rightStart = new THREE.Vector3(rightEndX, y, z);
    const rightEnd = isTension
        ? new THREE.Vector3(rightEndX - arrowLen, y, z)
        : new THREE.Vector3(rightEndX + arrowLen, y, z);
    const rightArrow = createSolidArrow3D(rightStart, rightEnd, 0xffaa66, 0.02, 0.05, 0.11);

    group.add(leftArrow, rightArrow);
    
    // Add CSS2D label at left arrow tail
    const label = createTextLabel(`Axial: ${absMag} kN`, '#ffaa66', '9px');
    label.position.set(leftStart.x, y + 0.08, z + 0.12);
    scene.add(label);
    allObjects.push(label);
    
    return group;
}

function createAxialPointLoad(positionX, magnitude, supportsX = []) {
    const group = new THREE.Group();
    const absMag = Math.abs(magnitude);
    const color = 0xffaa66;
    const colorHex = '#ffaa66';

    const y = 0.18;
    const z = 0.0;
    const arrowLen = 0.46;

    let nearestSupportX = positionX;
    if (supportsX.length > 0) {
        nearestSupportX = supportsX.reduce((best, sx) => Math.abs(sx - positionX) < Math.abs(best - positionX) ? sx : best, supportsX[0]);
    }
    const supportIsLeft = nearestSupportX <= positionX;

    let start;
    let end;
    if (magnitude >= 0) {
        // Same behavior as 2D: positive arrow ends at acting point from support side.
        if (supportIsLeft) {
            start = new THREE.Vector3(positionX - arrowLen, y, z);
            end = new THREE.Vector3(positionX, y, z);
        } else {
            start = new THREE.Vector3(positionX + arrowLen, y, z);
            end = new THREE.Vector3(positionX, y, z);
        }
    } else {
        // Negative arrow starts at acting point toward support side.
        if (supportIsLeft) {
            start = new THREE.Vector3(positionX, y, z);
            end = new THREE.Vector3(positionX - arrowLen, y, z);
        } else {
            start = new THREE.Vector3(positionX, y, z);
            end = new THREE.Vector3(positionX + arrowLen, y, z);
        }
    }

    const arrow = createSolidArrow3D(start, end, color, 0.02, 0.05, 0.11);
    group.add(arrow);

    const label = createTextLabel(`${absMag} kN`, colorHex, '9px');
    label.position.set(start.x, y + 0.08, z + 0.12);
    scene.add(label);
    allObjects.push(label);

    return group;
}

function buildDisplayReactions(supports, reactions, loads) {
    const baseReactions = supports.map((support) => {
        const found = reactions.find(r => Math.abs(r.position - support.position) < 1);
        return found
            ? { ...found }
            : { position: support.position, type: support.type, Fx: 0, Fy: 0, Fz: 0, Mz: 0 };
    });

    const hasSolverFx = baseReactions.some(r => Math.abs(r.Fx || 0) > 0.01);
    if (hasSolverFx) return baseReactions;

    const axialLoads = loads.filter(l => l.direction === 'axial' && l.type === 'point load');
    if (axialLoads.length === 0 || supports.length === 0) return baseReactions;

    const eligibleIndices = supports
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.type === 'pinned' || s.type === 'fixed')
        .map(({ i }) => i);
    if (eligibleIndices.length === 0) return baseReactions;

    // Fallback display-only axial reactions: assign each axial load to nearest support with opposite sign.
    const fxBySupport = supports.map(() => 0);
    axialLoads.forEach((load) => {
        let nearestIndex = eligibleIndices[0];
        let minDist = Math.abs(load.position - supports[nearestIndex].position);
        for (const i of eligibleIndices) {
            const dist = Math.abs(load.position - supports[i].position);
            if (dist < minDist) {
                minDist = dist;
                nearestIndex = i;
            }
        }
        fxBySupport[nearestIndex] -= load.magnitude;
    });

    return baseReactions.map((r, i) => ({ ...r, Fx: fxBySupport[i] }));
}

// Main update function
window.update3DModel = function(beamLength, supports, loads, reactions, beamType, sectionProps, feaResults) {
    console.log('update3DModel called', { beamLength, supportsCount: supports.length, loadsCount: loads.length, beamType, sectionProps, hasResults: !!feaResults });
    
    if (!isInitialized) {
        init3D();
        setTimeout(() => {
            window.update3DModel(beamLength, supports, loads, reactions, beamType, sectionProps, feaResults);
        }, 200);
        return;
    }
    
    // Store current state for mode switching
    currentModelState = {
        beamLength,
        supports,
        loads,
        reactions,
        beamType,
        sectionProps,
        feaResults
    };
    
    clearScene();
    
    //const lengthM = beamLength / 1000;
    const lengthM = beamLength
    // Create beam with section shape based on type (fixed size) and FEA contour
    const beam = createBeam(lengthM, beamType, feaResults);
    scene.add(beam);
    allObjects.push(beam);

    // 3D global coordinate at left-bottom corner
    if (globalAxisWidget && globalAxisWidget.parent) {
        globalAxisWidget.parent.remove(globalAxisWidget);
    }
    globalAxisWidget = createGlobalCoordinate3D(lengthM);
    scene.add(globalAxisWidget);
    allObjects.push(globalAxisWidget);
    
    const displayReactions = buildDisplayReactions(supports, reactions, loads);

    // Create supports
    supports.forEach((support) => {
        const positionX = positionToX(support.position, beamLength, lengthM);
        const reaction = displayReactions.find(r => Math.abs(r.position - support.position) < 1);
        const supportGroup = createSupport(positionX, support.type, reaction);
        scene.add(supportGroup);
        allObjects.push(supportGroup);
    });
    
    // Create loads
    loads.forEach((load) => {
        if (load.type === 'point load' && load.direction === 'vertical') {
            const positionX = positionToX(load.position, beamLength, lengthM);
            const loadGroup = createPointLoad(positionX, load.magnitude);
            scene.add(loadGroup);
            allObjects.push(loadGroup);
        }
        else if (load.type === 'point load' && load.direction === 'transverse') {
            const positionX = positionToX(load.position, beamLength, lengthM);
            const loadGroup = createTransversePointLoad(positionX, load.magnitude);
            scene.add(loadGroup);
            allObjects.push(loadGroup);
        }
        else if (load.type === 'uniform distributed load' && load.direction === 'vertical') {
            const startPos = load.position;
            const endPos = load.position + (load.length || beamLength - load.position);
            const udlGroup = createUDL(startPos, endPos, load.magnitude, beamLength, lengthM);
            scene.add(udlGroup);
            allObjects.push(udlGroup);
        }
        else if (load.type === 'uniform distributed load' && load.direction === 'transverse') {
            const startPos = load.position;
            const endPos = load.position + (load.length || beamLength - load.position);
            const udlTransGroup = createTransverseUDL(startPos, endPos, load.magnitude, beamLength, lengthM);
            scene.add(udlTransGroup);
            allObjects.push(udlTransGroup);
        }
        else if (load.type === 'moment') {
            const positionX = positionToX(load.position, beamLength, lengthM);
            const momentGroup = createMomentLoad(positionX, load.magnitude, beamLength, lengthM);
            scene.add(momentGroup);
            allObjects.push(momentGroup);
        }
    });
    
    // Axial point loads: one arrow at each acting point (same concept as 2D FBD)
    const supportXList = supports
        .filter(s => s.type === 'pinned' || s.type === 'fixed')
        .map(s => positionToX(s.position, beamLength, lengthM));
    loads.forEach((load) => {
        if (load.type === 'point load' && load.direction === 'axial') {
            const positionX = positionToX(load.position, beamLength, lengthM);
            const axialPointGroup = createAxialPointLoad(positionX, load.magnitude, supportXList);
            scene.add(axialPointGroup);
            allObjects.push(axialPointGroup);
        }
    });
    
    const statusDiv = document.getElementById('threeStatus');
    if (statusDiv) {
        statusDiv.textContent = `3D Ready: ${supports.length} supports, ${loads.length} loads`;
        statusDiv.style.color = '#4caf50';
    }
    
    console.log(`3D update complete: ${allObjects.length} objects`);
};

window.addEventListener('resize', () => {
    const container = document.getElementById('canvas3d');
    if (container && camera && renderer && labelRenderer) {
        const width = container.clientWidth;
        const height = container.clientHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        labelRenderer.setSize(width, height);
    }
});

// Function to switch visualization mode
window.set3DVisualizationMode = function(mode) {
    console.log('Switching visualization mode to:', mode);
    currentVisualizationMode = mode;
    
    // Rebuild the scene with new mode if we have a model
    if (currentModelState.beamLength !== null) {
        window.update3DModel(
            currentModelState.beamLength,
            currentModelState.supports,
            currentModelState.loads,
            currentModelState.reactions,
            currentModelState.beamType,
            currentModelState.sectionProps,
            currentModelState.feaResults
        );
    }
};

console.log('3D Viewer module loaded');