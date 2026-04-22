// Global data storage
let sectionDatabase = {};
let currentSectionProps = {
    area: 5000,
    Ix: 18000000,
    Iy: 9000000,
    Zx: 200000,
    Zy: 100000,
    weight: 39.2,
    rx: 60,
    ry: 40
};

let supports = [
    {id: 1, type: 'pinned', position: 0},
    {id: 2, type: 'roller', position: 6}
];
let loads = [];
let nextSupportId = 3;
let nextLoadId = 1;
let updateTimeout = null;
let currentReactions = [];
let currentMemberForces = null;
let currentFEAResult = null; // Store FEA result for visualization mode switching

// Beam type mapping for BS standard
const bsBeamTypeMapping = {
    'Hbeam': ['Universal_Columns', 'Universal_Bearing_Piles'],
    'Ibeam': ['Universal_Beams', 'Joists'],
    'PFC': ['Parallel_Flange_Channels'],
    'RHS': ['Rectangular_Hollow_Sections'],
    'SHS': ['Square_Hollow_Sections'],
    'CHS': ['Circular_Hollow_Sections'],
    'EA': ['Equal_Angles'],
    'UA': ['Unequal_Angles']
};

// Beam type mapping for GB standard
const gbBeamTypeMapping = {
    'Hbeam': ['H-Beam_Wide', 'H-Beam_Medium', 'H-Beam_Narrow','H-Beam_Thin'],
    'Ibeam': ['I-Beam'],
    'PFC': ['Parallel_Flange_Channels'],
    'RHS': ['Rectangular_Hollow_Sections'],
    'SHS': ['Square_Hollow_Sections'],
    'CHS': ['Circular_Hollow_Sections'],
    'EA': ['Equal_Angles'],
    'UA': ['Unequal_Angles']
};

// Display names for beam types
const beamTypeDisplayNames = {
    'Hbeam': 'H-Beam',
    'Ibeam': 'I-Beam',
    'PFC': 'Parallel Flange Channel',
    'RHS': 'Rectangular Hollow Section',
    'SHS': 'Square Hollow Section',
    'CHS': 'Circular Hollow Section',
    'EA': 'Equal Angle',
    'UA': 'Unequal Angle'
};

// Beam type order
const beamTypeOrder = ['Hbeam', 'Ibeam', 'PFC', 'RHS', 'SHS', 'CHS', 'EA', 'UA'];

// Load JSON files
async function loadJSONFiles() {
    const files = ['BS.json', 'GB.json'];
    for (const file of files) {
        try {
            const response = await fetch(`/static/${file}`);
            if (response.ok) {
                const data = await response.json();
                sectionDatabase[file.replace('.json', '')] = data;
                console.log(`Loaded ${file}`);
                console.log('Available categories:', Object.keys(data));
                console.log(sectionDatabase['BS'])
            } else {
                console.error(`Failed to load ${file}: ${response.status}`);
            }
        } catch (error) {
            console.error(`Error loading ${file}:`, error);
        }
    }
}

// Clear section properties display
function clearSectionProperties() {
    const sectionPropsDiv = document.getElementById('sectionProps');
    if (sectionPropsDiv) {
        sectionPropsDiv.innerHTML = '<p><strong>Section Properties:</strong></p><p style="color: #6c757d;">Select a designation to view properties</p>';
    }
    
    // Clear section shape canvas
    const canvas = document.getElementById('sectionShapeCanvas');
    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
}

// Update beam type options based on standard
function updateBeamTypeOptions() {
    const standard = document.querySelector('input[name="standard"]:checked').value;
    const beamTypeSelect = document.getElementById('beamType');
    const designationSelect = document.getElementById('designation');
    const beamTypeGroup = document.getElementById('beamTypeGroup');
    const designationGroup = document.getElementById('designationGroup');
    const sectionPropsGroup = document.getElementById('sectionPropsGroup');
    
    console.log('Updating beam type options for standard:', standard);
    
    if (standard === 'Customized') {
        beamTypeGroup.style.display = 'none';
        designationGroup.style.display = 'none';
        sectionPropsGroup.style.display = 'none';
        return;
    }
    
    beamTypeGroup.style.display = 'block';
    designationGroup.style.display = 'block';
    sectionPropsGroup.style.display = 'block';
    
    // // Check if database is loaded
    // if (!sectionDatabase[standard]) {
    //     console.warn(`Database for ${standard} not loaded yet. Waiting...`);
    //     beamTypeSelect.innerHTML = '<option value="">Loading data...</option>';
    //     beamTypeSelect.disabled = true;
    //     designationSelect.innerHTML = '<option value="">Wait for data to load</option>';
    //     designationSelect.disabled = true;
    //     return;
    // }
    
    // Populate beam type options
    beamTypeSelect.innerHTML = '<option value="">Select Beam Type</option>';
    beamTypeSelect.disabled = false;
    
    beamTypeOrder.forEach(type => {
        // Check if this beam type has any categories defined for the current standard
        const categories = standard === 'BS' ? bsBeamTypeMapping[type] : gbBeamTypeMapping[type];
        if (categories && categories.length > 0) {
            beamTypeSelect.innerHTML += `<option value="${type}">${beamTypeDisplayNames[type]}</option>`;
        }
    });
    
    if (beamTypeSelect.options.length === 1) {
        beamTypeSelect.innerHTML = '<option value="">No beam types available</option>';
        beamTypeSelect.disabled = true;
    }
    
    designationSelect.innerHTML = '<option value="">Select Beam Type first</option>';
    designationSelect.disabled = true;
    clearSectionProperties();
}

// Get the actual category names from JSON based on selected beam type
function getCategoryNames(standard, beamType) {
    if (standard === 'BS') {
        return bsBeamTypeMapping[beamType] || [];
    } else if (standard === 'GB') {
        return gbBeamTypeMapping[beamType] || [];
    }
    return [];
}

// Update designation options based on beam type
function updateDesignationOptions() {
    const standard = document.querySelector('input[name="standard"]:checked').value;
    const beamType = document.getElementById('beamType').value;
    const designationSelect = document.getElementById('designation');
    
    console.log('Updating designation options:', { standard, beamType });
    
    if (!beamType || standard === 'Customized') {
        designationSelect.innerHTML = '<option value="">Select Beam Type first</option>';
        designationSelect.disabled = true;
        clearSectionProperties();
        return;
    }
    
    const db = sectionDatabase[standard];
    if (!db) {
        console.log('Database not found for standard:', standard);
        designationSelect.innerHTML = '<option value="">Database not loaded</option>';
        designationSelect.disabled = true;
        clearSectionProperties();
        return;
    }
    
    // Get the actual category names from JSON
    const categoryNames = getCategoryNames(standard, beamType);
    console.log('Category names for', beamType, ':', categoryNames);
    
    if (categoryNames.length === 0) {
        designationSelect.innerHTML = '<option value="">No sections available for this type</option>';
        designationSelect.disabled = true;
        clearSectionProperties();
        return;
    }
    
    // Collect all sections from all categories
    let allSections = [];
    categoryNames.forEach(category => {
        if (db[category] && Array.isArray(db[category])) {
            console.log(`Found ${db[category].length} sections in category: ${category}`);
            allSections = allSections.concat(db[category]);
        } else {
            console.log(`Category not found in ${standard}.json: ${category}`);
            console.log('Available categories:', Object.keys(db));
        }
    });
    
    if (allSections.length === 0) {
        designationSelect.innerHTML = '<option value="">No sections available</option>';
        designationSelect.disabled = true;
        clearSectionProperties();
        return;
    }
    
    // Sort sections by designation
    allSections.sort((a, b) => a.designation.localeCompare(b.designation));
    
    designationSelect.innerHTML = '<option value="">Select Designation</option>';
    designationSelect.disabled = false;
    
    allSections.forEach(section => {
        designationSelect.innerHTML += `<option value="${section.designation}">${section.designation}</option>`;
    });
    
    console.log(`✅ Loaded ${allSections.length} designations for ${beamType}`);
    
    // Reset current section properties
    currentSectionProps = {
        area: 0,
        Ix: 0,
        Iy: 0,
        Zx: 0,
        Zy: 0,
        rx: 0,
        ry: 0,
        weight: 0,
        j: 0
    };
    
    clearSectionProperties();
}

// Find section across multiple categories
function findSectionInCategories(standard, beamType, designation) {
    const db = sectionDatabase[standard];
    if (!db) return null;
    
    const categoryNames = getCategoryNames(standard, beamType);
    
    for (const category of categoryNames) {
        if (db[category] && Array.isArray(db[category])) {
            const section = db[category].find(s => s.designation === designation);
            if (section) {
                console.log(`Found section in category: ${category}`);
                return section;
            }
        }
    }
    
    return null;
}

// Load section properties from the selected designation
function loadSectionProperties(standard, beamType, designation) {
    const section = findSectionInCategories(standard, beamType, designation);
    
    if (!section) {
        console.log('Section not found:', designation);
        clearSectionProperties();
        return false;
    }
    
    console.log('Section properties loaded:', section);
    
    // Map section properties with proper naming
    currentSectionProps = {
        area: section.area || 0,
        Ix: section.ix || section.Ix || 0,
        Iy: section.iy || section.Iy || 0,
        // Add these to currentSectionProps
        Zpx: section.zpx || 0,  // Plastic modulus major axis
        Zpy: section.zpy || 0,  // Plastic modulus minor axis
        Zex: section.zex || 0,  // Elastic modulus major axis
        Zey: section.zey || 0,  // Elastic modulus minor axis
        rx: section.rx || 0,
        ry: section.ry || 0,
        weight: section.weight || 0,
        j: section.j || 0,
        // Additional properties for member check
        D: section.h || section.d || 0,
        B: section.b || 0,
        T: section.tf || section.T || 0,  // Flange thickness
        t: section.tw || section.t || 0,  // Web thickness or wall thickness
        ro: section.r || section.ro || 0,
        Sz: section.zpx || section.Sz || 0,
        Sy: section.zpy || section.Sy || 0,
        // Include original names for compatibility
        h: section.h || section.d || 0,
        b: section.b || 0,
        tf: section.tf || section.T || 0,
        tw: section.tw || section.t || 0,
        r: section.r || section.ro || 0
    };
    
    // Update section properties display
    const sectionPropsDiv = document.getElementById('sectionProps');
    if (sectionPropsDiv) {
        const fmt = (v, digits = 2) => {
            const n = Number(v);
            return Number.isFinite(n) && n !== 0 ? n.toLocaleString(undefined, { maximumFractionDigits: digits }) : '-';
        };
        const fmtSci = (v, digits = 2) => {
            const n = Number(v);
            if (!Number.isFinite(n) || n === 0) return '-';
            const exp = Math.floor(Math.log10(Math.abs(n)));
            const mantissa = (n / Math.pow(10, exp)).toFixed(digits);
            return `${mantissa} x 10<sup>${exp}</sup>`;
        };

        const rows = [
            ['Name', designation || '-'],
            ['Height', `${fmt(currentSectionProps.D, 2)} mm`],
            ['Width', `${fmt(currentSectionProps.B, 2)} mm`],
            ['Flange Thickness', `${fmt(currentSectionProps.T, 2)} mm`],
            ['Web Thickness', `${fmt(currentSectionProps.t, 2)} mm`],
            ['Moment of Inertia(x-x)', `${fmtSci(currentSectionProps.Ix, 2)} mm<sup>4</sup>`],
            ['Moment of Inertia(y-y)', `${fmtSci(currentSectionProps.Iy, 2)} mm<sup>4</sup>`],
            ['Radius of Gyration(x-x)', `${fmt(currentSectionProps.rx, 3)} mm`],
            ['Radius of Gyration(y-y)', `${fmt(currentSectionProps.ry, 3)} mm`],
            ['Torsional Constant', `${fmtSci(currentSectionProps.j, 2)} mm<sup>4</sup>`],
            ['Cross-sectional Area', `${fmt(currentSectionProps.area, 2)} mm<sup>2</sup>`],
            ['Elastic Modulus(x-x)', `${fmtSci(currentSectionProps.Zex || currentSectionProps.Zz, 2)} mm<sup>3</sup>`],
            ['Elastic Modulus(y-y)', `${fmtSci(currentSectionProps.Zey || currentSectionProps.Zy, 2)} mm<sup>3</sup>`],
            ['Plastic Modulus(x-x)', `${fmtSci(currentSectionProps.Zpx || currentSectionProps.Sz, 2)} mm<sup>3</sup>`],
            ['Plastic Modulus(y-y)', `${fmtSci(currentSectionProps.Zpy || currentSectionProps.Sy, 2)} mm<sup>3</sup>`],
            ['Weight', `${fmt(currentSectionProps.weight, 3)} kg/m`]
        ];

        let propsHTML = '<table class="data-table" style="width:100%; font-size:10px; table-layout: fixed;">';
        rows.forEach(([label, value]) => {
            propsHTML += `<tr><td style="width:48%; padding:2px 4px; line-height:1.05;">${label}</td><td style="width:52%; padding:2px 4px; line-height:1.05; text-align:right; font-family:monospace;">${value}</td></tr>`;
        });
        propsHTML += '</table>';
        sectionPropsDiv.innerHTML = propsHTML;
    }
    
    // Draw scaled section shape
    drawSectionShape(beamType, currentSectionProps);
    
    console.log('Loaded section properties:', currentSectionProps);
    return true;
}

// Handle designation selection
function onDesignationChange() {
    const standard = document.querySelector('input[name="standard"]:checked').value;
    const beamType = document.getElementById('beamType').value;
    const designation = document.getElementById('designation').value;
    
    console.log('Designation changed:', { standard, beamType, designation });
    
    if (standard !== 'Customized' && designation && beamType) {
        const loaded = loadSectionProperties(standard, beamType, designation);
        if (loaded) {
            scheduleCalculation();
        }
    } else if (!designation) {
        clearSectionProperties();
        currentSectionProps = {
            area: 0,
            Ix: 0,
            Iy: 0,
            Zx: 0,
            Zy: 0,
            rx: 0,
            ry: 0,
            weight: 0,
            j: 0,
            D: 0, B: 0, T: 0, t: 0, ro: 0, Sz: 0, Sy: 0
        };
    }
}

function drawSectionShape(beamType, props) {
    const canvas = document.getElementById('sectionShapeCanvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    
    // Clear canvas and draw a soft background panel
    ctx.clearRect(0, 0, width, height);
    const bgGrad = ctx.createLinearGradient(0, 0, 0, height);
    bgGrad.addColorStop(0, '#fdfefe');
    bgGrad.addColorStop(1, '#f1f5f9');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = '#d6dee8';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

    // Section designation label at top
    const designation = (document.getElementById('designation')?.value || '').trim();
    if (designation) {
        ctx.fillStyle = '#333';
        ctx.font = 'bold 11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(designation, width / 2, 14);
    }
    
    // Get dimensions
    const D = props.D || props.h || 0;
    const B = props.B || props.b || D || 0;
    const T = props.T || props.tf || 0;
    const t = props.t || props.tw || 0;
    const r = props.ro || props.r || 0;
    
    if (D === 0 || B === 0) {
        ctx.fillStyle = '#999';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('No geometry', width/2, height/2);
        return;
    }
    
    // Calculate scale to fit canvas with margins (extra top space for designation)
    const marginX = 34;
    const marginTop = 50;
    const marginBottom = 30;
    const availWidth = width - 2 * marginX;
    const availHeight = height - marginTop - marginBottom;
    const scale = Math.min(availWidth / B, availHeight / D);
    
    // Center position within drawing region
    const cx = width / 2;
    const cy = marginTop + availHeight / 2;

    // Centroid location in canvas coordinates
    const centroid = getSectionCentroid(beamType, D, B, T, t);
    const sectionTop = cy - (D * scale) / 2;
    const cgY = sectionTop + centroid.y * scale;
    
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 1.6;
    const sectionGrad = ctx.createLinearGradient(0, cy - (D * scale) / 2, 0, cy + (D * scale) / 2);
    sectionGrad.addColorStop(0, '#b9d9ff');
    sectionGrad.addColorStop(1, '#8ec5ff');
    ctx.fillStyle = sectionGrad;
    ctx.shadowColor = 'rgba(26, 54, 93, 0.18)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 2;
    
    // Draw based on beam type
    if (beamType === 'Hbeam' || beamType === 'Ibeam') {
        drawIorHSection(ctx, cx, cy, D, B, T, t, r, scale);
    } else if (beamType === 'PFC') {
        drawChannelSection(ctx, cx, cy, D, B, T, t, r, scale);
    } else if (beamType === 'RHS') {
        drawRHSSection(ctx, cx, cy, D, B, t, r, scale);
    } else if (beamType === 'SHS') {
        drawSHSSection(ctx, cx, cy, D, t, r, scale);
    } else if (beamType === 'CHS') {
        drawCHSSection(ctx, cx, cy, D, t, scale);
    } else if (beamType === 'EA') {
        drawEqualAngleSection(ctx, cx, cy, D, t, r, scale);
    } else if (beamType === 'UA') {
        drawUnequalAngleSection(ctx, cx, cy, D, B, t, r, scale);
    }
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Centroid and principal axes
    drawCentroidAndAxes(ctx, cx, cy, D, B, T, t, beamType, scale);
    
    // Draw dimension annotations
    ctx.strokeStyle = '#4b5563';
    ctx.fillStyle = '#4b5563';
    ctx.font = '10px Arial';
    ctx.lineWidth = 1;
    
    // Height dimension (D)
    const dLineX = cx + B * scale / 2 + 15;
    drawDimensionLine(ctx, dLineX, cy - D * scale / 2, dLineX, cy + D * scale / 2, `${D.toFixed(1)} mm`, 'vertical');
    
    // Width dimension (B)
    if (beamType !== 'CHS') {
        const bLineY = cy + D * scale / 2 + 15;
        drawDimensionLine(ctx, cx - B * scale / 2, bLineY, cx + B * scale / 2, bLineY, `${B.toFixed(1)} mm`, 'horizontal');
    }

    // Thickness dimensions (flange T and web t)
    if ((beamType === 'Hbeam' || beamType === 'Ibeam' || beamType === 'PFC') && T > 0) {
        const tLineX = cx - B * scale / 2 - 18;
        const topY = cy - D * scale / 2;
        drawSeparatedThicknessArrows(
            ctx,
            tLineX,
            topY,
            tLineX,
            topY + T * scale,
            `T = ${T.toFixed(1)} mm`,
            'vertical',
            { labelPosition: 'top' }
        );
    }

    if ((beamType === 'Hbeam' || beamType === 'Ibeam') && t > 0) {
        const webY = cgY + 22;
        drawSeparatedThicknessArrows(
            ctx,
            cx - (t * scale) / 2,
            webY,
            cx + (t * scale) / 2,
            webY,
            `t = ${t.toFixed(1)} mm`,
            'horizontal',
            { labelPosition: 'left' }
        );
    }

    if (beamType === 'PFC' && t > 0) {
        const webY = cgY + 22;
        const webLeft = cx - (B * scale) / 2;
        drawSeparatedThicknessArrows(
            ctx,
            webLeft,
            webY,
            webLeft + t * scale,
            webY,
            `t = ${t.toFixed(1)} mm`,
            'horizontal',
            { labelPosition: 'left' }
        );
    }
}

function drawCentroidAndAxes(ctx, cx, cy, D, B, T, t, beamType, scale) {
    const centroid = getSectionCentroid(beamType, D, B, T, t);
    const sectionLeft = cx - (B * scale) / 2;
    const sectionTop = cy - (D * scale) / 2;

    const cgX = sectionLeft + centroid.x * scale;
    const cgY = sectionTop + centroid.y * scale;

    // Draw centroid point
    ctx.fillStyle = '#d32f2f';
    ctx.beginPath();
    ctx.arc(cgX, cgY, 2.5, 0, 2 * Math.PI);
    ctx.fill();

    // Draw local coordinate axes
    ctx.strokeStyle = '#d32f2f';
    ctx.fillStyle = '#d32f2f';
    ctx.lineWidth = 1;
    ctx.font = '9px Arial';

    const axisLen = 28;
    drawArrow(ctx, cgX, cgY, cgX + axisLen, cgY, 4); // +x
    drawArrow(ctx, cgX, cgY, cgX, cgY - axisLen, 4); // +y

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('x', cgX + axisLen + 4, cgY);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('y', cgX + 10, cgY - axisLen - 4);
}

function getSectionCentroid(beamType, D, B, T, t) {
    // Default to geometric center
    const defaultCg = { x: B / 2, y: D / 2 };

    if (beamType === 'Hbeam' || beamType === 'Ibeam' || beamType === 'RHS' || beamType === 'SHS' || beamType === 'CHS') {
        return defaultCg;
    }

    if (beamType === 'PFC') {
        const a1 = B * T;                    // top flange
        const x1 = B / 2;
        const y1 = T / 2;

        const a2 = B * T;                    // bottom flange
        const x2 = B / 2;
        const y2 = D - T / 2;

        const a3 = t * Math.max(D - 2 * T, 0); // web
        const x3 = t / 2;
        const y3 = D / 2;

        const a = a1 + a2 + a3;
        if (a <= 0) return defaultCg;
        return {
            x: (a1 * x1 + a2 * x2 + a3 * x3) / a,
            y: (a1 * y1 + a2 * y2 + a3 * y3) / a
        };
    }

    if (beamType === 'EA') {
        // Equal angle = horizontal leg + vertical leg - overlap square
        const a1 = D * t;
        const x1 = D / 2;
        const y1 = t / 2;

        const a2 = t * D;
        const x2 = t / 2;
        const y2 = D / 2;

        const a3 = t * t;
        const x3 = t / 2;
        const y3 = t / 2;

        const a = a1 + a2 - a3;
        if (a <= 0) return defaultCg;
        return {
            x: (a1 * x1 + a2 * x2 - a3 * x3) / a,
            y: (a1 * y1 + a2 * y2 - a3 * y3) / a
        };
    }

    if (beamType === 'UA') {
        // Unequal angle = horizontal leg + vertical leg - overlap square
        const a1 = B * t;
        const x1 = B / 2;
        const y1 = t / 2;

        const a2 = t * D;
        const x2 = t / 2;
        const y2 = D / 2;

        const a3 = t * t;
        const x3 = t / 2;
        const y3 = t / 2;

        const a = a1 + a2 - a3;
        if (a <= 0) return defaultCg;
        return {
            x: (a1 * x1 + a2 * x2 - a3 * x3) / a,
            y: (a1 * y1 + a2 * y2 - a3 * y3) / a
        };
    }

    return defaultCg;
}

function drawSeparatedThicknessArrows(ctx, x1, y1, x2, y2, label, orientation, options = {}) {
    const arrowSize = 4;
    const gap = 10;
    const labelPosition = options.labelPosition || 'top';

    ctx.strokeStyle = '#666';
    ctx.fillStyle = '#666';
    ctx.lineWidth = 1;
    ctx.font = '10px Arial';

    if (orientation === 'vertical') {
        const midY = (y1 + y2) / 2;

        // Top separated arrow toward center
        drawArrow(ctx, x1, y1, x1, midY - gap / 2, arrowSize);
        // Bottom separated arrow toward center
        drawArrow(ctx, x2, y2, x2, midY + gap / 2, arrowSize);

        // Short extension ticks at measured faces
        ctx.beginPath();
        ctx.moveTo(x1 - 5, y1);
        ctx.lineTo(x1 + 5, y1);
        ctx.moveTo(x2 - 5, y2);
        ctx.lineTo(x2 + 5, y2);
        ctx.stroke();

        if (labelPosition === 'top') {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(label, x1, y1 - 6);
        } else if (labelPosition === 'left') {
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x1 - 7, midY);
        } else {
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x1 + 7, midY);
        }
    } else {
        const midX = (x1 + x2) / 2;

        // Left separated arrow toward center
        drawArrow(ctx, x1, y1, midX - gap / 2, y1, arrowSize);
        // Right separated arrow toward center
        drawArrow(ctx, x2, y2, midX + gap / 2, y2, arrowSize);

        // Short extension ticks at measured faces
        ctx.beginPath();
        ctx.moveTo(x1, y1 - 5);
        ctx.lineTo(x1, y1 + 5);
        ctx.moveTo(x2, y2 - 5);
        ctx.lineTo(x2, y2 + 5);
        ctx.stroke();

        if (labelPosition === 'left') {
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, x1 - 6, y1);
        } else if (labelPosition === 'top') {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(label, midX, y1 - 6);
        } else {
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(label, midX, y1 + 6);
        }
    }
}

function drawArrow(ctx, fromX, fromY, toX, toY, arrowSize = 4) {
    ctx.beginPath();
    ctx.moveTo(fromX, fromY);
    ctx.lineTo(toX, toY);
    ctx.stroke();

    const angle = Math.atan2(toY - fromY, toX - fromX);
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
        toX - arrowSize * Math.cos(angle - Math.PI / 6),
        toY - arrowSize * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
        toX - arrowSize * Math.cos(angle + Math.PI / 6),
        toY - arrowSize * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
}

function drawIorHSection(ctx, cx, cy, D, B, T, t, r, scale) {
    const dScaled = D * scale;
    const bScaled = B * scale;
    const tScaled = T * scale;
    const tWebScaled = t * scale;

    const left = cx - bScaled / 2;
    const right = cx + bScaled / 2;
    const top = cy - dScaled / 2;
    const bottom = cy + dScaled / 2;
    const webLeft = cx - tWebScaled / 2;
    const webRight = cx + tWebScaled / 2;

    // Single closed boundary to avoid internal seam lines between flange and web.
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(right, top);
    ctx.lineTo(right, top + tScaled);
    ctx.lineTo(webRight, top + tScaled);
    ctx.lineTo(webRight, bottom - tScaled);
    ctx.lineTo(right, bottom - tScaled);
    ctx.lineTo(right, bottom);
    ctx.lineTo(left, bottom);
    ctx.lineTo(left, bottom - tScaled);
    ctx.lineTo(webLeft, bottom - tScaled);
    ctx.lineTo(webLeft, top + tScaled);
    ctx.lineTo(left, top + tScaled);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

function drawChannelSection(ctx, cx, cy, D, B, T, t, r, scale) {
    const dScaled = D * scale;
    const bScaled = B * scale;
    const tScaled = T * scale;
    const tWebScaled = t * scale;

    const left = cx - bScaled / 2;
    const right = cx + bScaled / 2;
    const top = cy - dScaled / 2;
    const bottom = cy + dScaled / 2;
    const webRight = left + tWebScaled;

    // Single closed boundary to avoid internal seam lines between flange and web.
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(right, top);
    ctx.lineTo(right, top + tScaled);
    ctx.lineTo(webRight, top + tScaled);
    ctx.lineTo(webRight, bottom - tScaled);
    ctx.lineTo(right, bottom - tScaled);
    ctx.lineTo(right, bottom);
    ctx.lineTo(left, bottom);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

function drawRHSSection(ctx, cx, cy, D, B, t, r, scale) {
    const dScaled = D * scale;
    const bScaled = B * scale;
    const tScaled = t * scale;
    
    // Outer rectangle
    ctx.fillRect(cx - bScaled/2, cy - dScaled/2, bScaled, dScaled);
    ctx.strokeRect(cx - bScaled/2, cy - dScaled/2, bScaled, dScaled);
    
    // Inner rectangle (hollow)
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(cx - bScaled/2 + tScaled, cy - dScaled/2 + tScaled, bScaled - 2*tScaled, dScaled - 2*tScaled);
    ctx.strokeRect(cx - bScaled/2 + tScaled, cy - dScaled/2 + tScaled, bScaled - 2*tScaled, dScaled - 2*tScaled);
}

function drawSHSSection(ctx, cx, cy, D, t, r, scale) {
    const dScaled = D * scale;
    const tScaled = t * scale;
    
    // Outer square
    ctx.fillRect(cx - dScaled/2, cy - dScaled/2, dScaled, dScaled);
    ctx.strokeRect(cx - dScaled/2, cy - dScaled/2, dScaled, dScaled);
    
    // Inner square (hollow)
    ctx.fillStyle = '#f8f9fa';
    ctx.fillRect(cx - dScaled/2 + tScaled, cy - dScaled/2 + tScaled, dScaled - 2*tScaled, dScaled - 2*tScaled);
    ctx.strokeRect(cx - dScaled/2 + tScaled, cy - dScaled/2 + tScaled, dScaled - 2*tScaled, dScaled - 2*tScaled);
}

function drawCHSSection(ctx, cx, cy, D, t, scale) {
    const radius = D * scale / 2;
    const tScaled = t * scale;
    
    // Outer circle
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
    
    // Inner circle (hollow)
    ctx.fillStyle = '#f8f9fa';
    ctx.beginPath();
    ctx.arc(cx, cy, radius - tScaled, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
}

function drawEqualAngleSection(ctx, cx, cy, D, t, r, scale) {
    const dScaled = D * scale;
    const tScaled = t * scale;
    
    ctx.beginPath();
    ctx.moveTo(cx - dScaled/2, cy - dScaled/2);
    ctx.lineTo(cx + dScaled/2, cy - dScaled/2);
    ctx.lineTo(cx + dScaled/2, cy - dScaled/2 + tScaled);
    ctx.lineTo(cx - dScaled/2 + tScaled, cy - dScaled/2 + tScaled);
    ctx.lineTo(cx - dScaled/2 + tScaled, cy + dScaled/2);
    ctx.lineTo(cx - dScaled/2, cy + dScaled/2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

function drawUnequalAngleSection(ctx, cx, cy, D, B, t, r, scale) {
    const dScaled = D * scale;
    const bScaled = B * scale;
    const tScaled = t * scale;
    
    ctx.beginPath();
    ctx.moveTo(cx - bScaled/2, cy - dScaled/2);
    ctx.lineTo(cx + bScaled/2, cy - dScaled/2);
    ctx.lineTo(cx + bScaled/2, cy - dScaled/2 + tScaled);
    ctx.lineTo(cx - bScaled/2 + tScaled, cy - dScaled/2 + tScaled);
    ctx.lineTo(cx - bScaled/2 + tScaled, cy + dScaled/2);
    ctx.lineTo(cx - bScaled/2, cy + dScaled/2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

function drawDimensionLine(ctx, x1, y1, x2, y2, label, orientation) {
    const arrowSize = 4;
    
    // Draw line
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    
    // Draw arrows
    if (orientation === 'vertical') {
        // Top arrow
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - arrowSize, y1 + arrowSize);
        ctx.lineTo(x1 + arrowSize, y1 + arrowSize);
        ctx.closePath();
        ctx.fill();
        
        // Bottom arrow
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - arrowSize, y2 - arrowSize);
        ctx.lineTo(x2 + arrowSize, y2 - arrowSize);
        ctx.closePath();
        ctx.fill();
        
        // Label
        ctx.save();
        ctx.translate(x1 + 14, (y1 + y2) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillText(label, 0, 0);
        ctx.restore();
    } else {
        // Left arrow
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 + arrowSize, y1 - arrowSize);
        ctx.lineTo(x1 + arrowSize, y1 + arrowSize);
        ctx.closePath();
        ctx.fill();
        
        // Right arrow
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - arrowSize, y2 - arrowSize);
        ctx.lineTo(x2 - arrowSize, y2 + arrowSize);
        ctx.closePath();
        ctx.fill();
        
        // Label
        ctx.textAlign = 'center';
        ctx.fillText(label, (x1 + x2) / 2, y1 + 12);
    }
}

function formatUtilizationWithStatus(ratio) {
    const percent = (ratio * 100).toFixed(1);
    let className = 'utilization-ok';
    let status = '<span class="util-status status-ok">✓ OK</span>';
    
    if (ratio > 1.0) {
        className = 'utilization-danger';
        status = '<span class="util-status status-no">✗ NO</span>';
    } else if (ratio > 0.85) {
        className = 'utilization-warning';
        status = '<span class="util-status status-ok">⚠ Warning</span>';
    }

    return `<span class="utilization-cell"><span class="util-value ${className}">${percent}%</span>${status}</span>`;
}

function updateMemberCheckUI(memberForces, beamLength, steelGrade) {
    // If we have member check results from the backend, use them
    if (window.lastMemberCheckResults && window.lastMemberCheckResults.section_class) {
        const results = window.lastMemberCheckResults;
        
        document.getElementById('verticalDeflectionUtil').innerHTML = formatUtilizationWithStatus(results.vertical_deflection_util || 0);
        document.getElementById('horizontalDeflectionUtil').innerHTML = formatUtilizationWithStatus(0);
        document.getElementById('shearMajorUtil').innerHTML = formatUtilizationWithStatus(results.ur_shear_y || 0);
        document.getElementById('shearMinorUtil').innerHTML = formatUtilizationWithStatus(results.ur_shear_z || 0);
        document.getElementById('momentMajorUtil').innerHTML = formatUtilizationWithStatus(results.ur_moment_z || 0);
        document.getElementById('momentMinorUtil').innerHTML = formatUtilizationWithStatus(results.ur_moment_y || 0);
        document.getElementById('biaxialMomentUtil').innerHTML = formatUtilizationWithStatus(results.ur_moment_z || 0);
        document.getElementById('tensionUtil').innerHTML = formatUtilizationWithStatus(results.ur_tension || 0);
        document.getElementById('compressionUtil').innerHTML = formatUtilizationWithStatus(results.ur_compression || 0);
        document.getElementById('ltbUtil').innerHTML = formatUtilizationWithStatus(results.ur_ltb || 0);
        document.getElementById('tensionBiaxialUtil').innerHTML = formatUtilizationWithStatus(results.combined_tension_moment || 0);
        document.getElementById('tensionBucklingUtil').innerHTML = formatUtilizationWithStatus(results.combined_tension_buckling || 0);
        document.getElementById('compressionBiaxialUtil').innerHTML = formatUtilizationWithStatus(results.combined_compression_moment || 0);
        document.getElementById('compressionBucklingUtil').innerHTML = formatUtilizationWithStatus(results.combined_compression_buckling || 0);
        
        const categories = [
            'Shear Maj', 'Shear Min', 'Moment Maj', 'Moment Min', 'Biaxial M',
            'Tension', 'Compression', 'LTB',
            'T+Biax', 'T+Buck', 'C+Biax', 'C+Buck'
        ];
        const values = [
            results.ur_shear_y || 0,
            results.ur_shear_z || 0,
            results.ur_moment_z || 0,
            results.ur_moment_y || 0,
            results.ur_biaxial_moment || Math.max(results.ur_moment_z || 0, results.ur_moment_y || 0),
            results.ur_tension || 0,
            results.ur_compression || 0,
            results.ur_ltb || 0,
            results.combined_tension_moment || 0,
            results.combined_tension_buckling || 0,
            results.combined_compression_moment || 0,
            results.combined_compression_buckling || 0
        ];
        
        const colors = values.map(v => v > 1.0 ? '#dc3545' : (v > 0.85 ? '#ffc107' : '#28a745'));
        
        Plotly.newPlot('utilizationChart', [{
            x: categories,
            y: values.map(v => v * 100),
            type: 'bar',
            marker: { color: colors, opacity: 0.85 },
            text: values.map(v => `${(v * 100).toFixed(1)}%`),
            textposition: 'outside'
        }], {
            margin: { l: 40, r: 20, t: 40, b: 85 },
            yaxis: { title: 'Utilization (%)', range: [0, 120] },
            xaxis: { tickangle: -35 },
            shapes: [{
                type: 'line',
                x0: -0.5,
                x1: categories.length - 0.5,
                y0: 100,
                y1: 100,
                line: { color: '#dc3545', width: 2, dash: 'dash' }
            }],
            height: 350,
            autosize: true,
            responsive: true
        }, { responsive: true });
        
        const maxUtil = Math.max(...values);
        const maxUtilElem = document.getElementById('maxUtilValue');
        maxUtilElem.innerHTML = `${(maxUtil * 100).toFixed(1)}%`;
        maxUtilElem.className = maxUtil > 1.0 ? 'util-critical' : 'util-acceptable';
    } else {
        // Backend results not available - keep initialized 0% values
        console.log('Member check results not available from backend (incomplete section properties)');
        initializeMemberCheckUI();
    }
}

function initializeMemberCheckUI() {
    const zeroValue = formatUtilizationWithStatus(0);
    
    // Initialize all utilization ratios to 0%
    document.getElementById('verticalDeflectionUtil').innerHTML = zeroValue;
    document.getElementById('horizontalDeflectionUtil').innerHTML = zeroValue;
    document.getElementById('shearMajorUtil').innerHTML = zeroValue;
    document.getElementById('shearMinorUtil').innerHTML = zeroValue;
    document.getElementById('momentMajorUtil').innerHTML = zeroValue;
    document.getElementById('momentMinorUtil').innerHTML = zeroValue;
    document.getElementById('biaxialMomentUtil').innerHTML = zeroValue;
    document.getElementById('tensionUtil').innerHTML = zeroValue;
    document.getElementById('compressionUtil').innerHTML = zeroValue;
    document.getElementById('ltbUtil').innerHTML = zeroValue;
    document.getElementById('tensionBiaxialUtil').innerHTML = zeroValue;
    document.getElementById('tensionBucklingUtil').innerHTML = zeroValue;
    document.getElementById('compressionBiaxialUtil').innerHTML = zeroValue;
    document.getElementById('compressionBucklingUtil').innerHTML = zeroValue;
    
    // Initialize utilization chart
    const categories = [
        'Shear Maj', 'Shear Min', 'Moment Maj', 'Moment Min', 'Biaxial M',
        'Tension', 'Compression', 'LTB',
        'T+Biax', 'T+Buck', 'C+Biax', 'C+Buck'
    ];
    const values = new Array(categories.length).fill(0);
    const colors = values.map(v => '#28a745'); // All green for 0%
    
    Plotly.newPlot('utilizationChart', [{
        x: categories,
        y: values,
        type: 'bar',
        marker: { color: colors, opacity: 0.85 },
        text: values.map(v => '0.0%'),
        textposition: 'outside'
    }], {
        margin: { l: 40, r: 20, t: 40, b: 85 },
        yaxis: { title: 'Utilization (%)', range: [0, 120] },
        xaxis: { tickangle: -35 },
        shapes: [{
            type: 'line',
            x0: -0.5,
            x1: categories.length - 0.5,
            y0: 100,
            y1: 100,
            line: { color: '#dc3545', width: 2, dash: 'dash' }
        }],
        height: 350,
        autosize: true,
        responsive: true
    }, { responsive: true });
    
    const maxUtilElem = document.getElementById('maxUtilValue');
    maxUtilElem.innerHTML = '0.0%';
    maxUtilElem.className = 'util-acceptable';
}

function resizeCanvas() {
    const canvas = document.getElementById('freeBodyCanvas');
    const container = canvas.parentElement;
    if (container) {
        const rect = container.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;
        updateFreeBodyDiagram();
    }
}

function drawCanvasArrow(ctx, x1, y1, x2, y2, color, arrowSize = 8, lineWidth = 2, slashMark = false) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lineWidth;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - arrowSize * Math.cos(angle - Math.PI / 6), y2 - arrowSize * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - arrowSize * Math.cos(angle + Math.PI / 6), y2 - arrowSize * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();

    if (slashMark) {
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const slashLen = 5;

        ctx.beginPath();
        ctx.moveTo(mx - slashLen, my + slashLen);
        ctx.lineTo(mx + slashLen, my - slashLen);
        ctx.stroke();
    }
    ctx.restore();
}

function drawMomentReaction2D(ctx, x, centerY, magnitude, color = '#000000') {
    const radius = 14;
    const arrowSize = 7;
    const clockwise = magnitude >= 0;
    const startAngle = clockwise ? Math.PI * 0.15 : Math.PI * 1.85;
    const endAngle = clockwise ? Math.PI * 1.85 : Math.PI * 0.15;

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(x, centerY, radius, startAngle, endAngle, !clockwise);
    ctx.stroke();

    const ex = x + radius * Math.cos(endAngle);
    const ey = centerY + radius * Math.sin(endAngle);
    const tx = clockwise ? -Math.sin(endAngle) : Math.sin(endAngle);
    const ty = clockwise ? Math.cos(endAngle) : -Math.cos(endAngle);
    const nx = -ty;
    const ny = tx;

    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - arrowSize * tx + arrowSize * 0.6 * nx, ey - arrowSize * ty + arrowSize * 0.6 * ny);
    ctx.lineTo(ex - arrowSize * tx - arrowSize * 0.6 * nx, ey - arrowSize * ty - arrowSize * 0.6 * ny);
    ctx.closePath();
    ctx.fill();

    // Diagonal slash marker on moment reaction arrow
    const sx = x + radius * 0.7;
    const sy = centerY - radius * 0.7;
    ctx.beginPath();
    ctx.moveTo(sx - 4, sy + 4);
    ctx.lineTo(sx + 4, sy - 4);
    ctx.stroke();

    ctx.restore();
}

function drawPinnedSupport2D(ctx, x, beamY, size) {
    const centerY = beamY + size * 1.35;
    const rotation = Math.PI / 3 + Math.PI;
    ctx.save();
    ctx.translate(x, centerY);
    ctx.rotate(rotation);
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.lineTo(size * 0.95, size * 0.75);
    ctx.lineTo(-size * 0.95, size * 0.75);
    ctx.closePath();
    ctx.fillStyle = '#dc3545';
    ctx.fill();
    ctx.restore();
}

function drawRollerSupport2D(ctx, x, beamY, size) {
    const radius = size * 0.9;
    const centerY = beamY + radius + 3;
    ctx.save();
    ctx.strokeStyle = '#28a745';
    ctx.fillStyle = '#28a745';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, centerY, radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - radius * 1.2, centerY + radius + 4);
    ctx.lineTo(x + radius * 1.2, centerY + radius + 4);
    ctx.stroke();
    ctx.restore();
}

function drawFixedSupport2D(ctx, x, beamY, size) {
    ctx.save();
    ctx.fillStyle = '#ffc107';
    ctx.strokeStyle = '#cc9800';
    ctx.lineWidth = 1.5;
    ctx.fillRect(x - size * 0.9, beamY - size * 1.1, size * 1.8, size * 2.2);
    ctx.strokeRect(x - size * 0.9, beamY - size * 1.1, size * 1.8, size * 2.2);
    ctx.restore();
}

function drawTransverseDot2D(ctx, x, beamY) {
    ctx.save();
    ctx.fillStyle = '#ff9800';
    ctx.beginPath();
    ctx.arc(x, beamY, 5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.restore();
}

function drawGlobalCoordinate2D(ctx, width, height) {
    const originX = 36;
    const originY = height - 28;
    const axisLen = 34;

    ctx.save();
    ctx.strokeStyle = '#495057';
    ctx.fillStyle = '#495057';
    ctx.lineWidth = 2;
    ctx.font = '12px Arial';

    // x-axis (right)
    drawCanvasArrow(ctx, originX, originY, originX + axisLen, originY, '#495057', 6, 2, false);
    ctx.fillText('x', originX + axisLen + 6, originY + 4);

    // y-axis (up)
    drawCanvasArrow(ctx, originX, originY, originX, originY - axisLen, '#495057', 6, 2, false);
    ctx.fillText('y', originX - 4, originY - axisLen - 8);

    ctx.restore();
}

function getReferenceSupportPosition(loadPosition, beamLength, startX, beamWidth) {
    const axialSupports = supports.filter(s => s.type === 'pinned' || s.type === 'fixed');
    const searchSupports = axialSupports.length > 0 ? axialSupports : supports;

    if (!searchSupports.length) return startX;
    let nearest = searchSupports[0];
    let minDist = Math.abs(loadPosition - searchSupports[0].position);
    searchSupports.forEach((support) => {
        const dist = Math.abs(loadPosition - support.position);
        if (dist < minDist) {
            minDist = dist;
            nearest = support;
        }
    });
    return startX + (nearest.position / beamLength) * beamWidth;
}

function getShortAxialArrowPoints(loadPosition, magnitude, beamLength, startX, beamWidth, arrowLen = 34) {
    const actingX = startX + (loadPosition / beamLength) * beamWidth;
    const refX = getReferenceSupportPosition(loadPosition, beamLength, startX, beamWidth);
    const supportIsLeft = refX <= actingX;

    if (magnitude >= 0) {
        // Positive: from support side toward acting point, ending at acting point
        return supportIsLeft
            ? { x1: actingX - arrowLen, x2: actingX }
            : { x1: actingX + arrowLen, x2: actingX };
    }

    // Negative: from acting point toward support side, starting at acting point
    return supportIsLeft
        ? { x1: actingX, x2: actingX - arrowLen }
        : { x1: actingX, x2: actingX + arrowLen };
}

function drawClampedLabel(ctx, text, preferredX, y, canvasWidth, margin = 8) {
    const textW = ctx.measureText(text).width;
    const x = Math.max(margin, Math.min(preferredX, canvasWidth - textW - margin));
    ctx.fillText(text, x, y);
}

function buildDisplayReactions2D(supports, currentReactions, loads) {
    const base = supports.map((support) => {
        const found = currentReactions.find(r => Math.abs(r.position - support.position) < 1e-6 || Math.abs(r.position - support.position) < 1);
        return found ? { ...found } : { position: support.position, Fx: 0, Fy: 0, Fz: 0, Mz: 0 };
    });

    const hasSolverFx = base.some(r => Math.abs(r.Fx || 0) > 0.01);
    if (hasSolverFx) return base;

    const axialLoads = loads.filter(l => l.type === 'point load' && l.direction === 'axial');
    if (axialLoads.length === 0 || supports.length === 0) return base;

    const eligibleIndices = supports
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.type === 'pinned' || s.type === 'fixed')
        .map(({ i }) => i);
    if (eligibleIndices.length === 0) return base;

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

    return base.map((r, i) => ({ ...r, Fx: fxBySupport[i] }));
}

function updateFreeBodyDiagram() {
    const canvas = document.getElementById('freeBodyCanvas');
    const ctx = canvas.getContext('2d');
    const beamLength = parseFloat(document.getElementById('beamLength').value);
    const width = canvas.width;
    const height = canvas.height;
    
    if (width === 0 || height === 0) return;
    
    ctx.clearRect(0, 0, width, height);
    const startX = width * 0.1;
    const endX = width - width * 0.1;
    const beamY = height / 2;
    const beamWidth = endX - startX;
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    ctx.beginPath();
    ctx.moveTo(startX, beamY);
    ctx.lineTo(endX, beamY);
    ctx.lineWidth = Math.max(2, width / 150);
    ctx.strokeStyle = '#495057';
    ctx.stroke();

    drawGlobalCoordinate2D(ctx, width, height);

    const displayReactions = buildDisplayReactions2D(supports, currentReactions, loads);
    
    supports.forEach(support => {
        const x = startX + (support.position / beamLength) * beamWidth;
        const scale = Math.min(1, width / 400);
        const triSize = 8 * scale;
        
        if (support.type === 'pinned') {
            drawPinnedSupport2D(ctx, x, beamY, triSize);
        } else if (support.type === 'roller') {
            drawRollerSupport2D(ctx, x, beamY, triSize);
        } else if (support.type === 'fixed') {
            drawFixedSupport2D(ctx, x, beamY, 10 * scale);
        }

        const reaction = displayReactions.find(r => Math.abs(r.position - support.position) < 1e-6 || Math.abs(r.position - support.position) < 1);
        if (reaction) {
            const fontSize = Math.max(10, width / 42);
            ctx.font = `${fontSize}px Arial`;
            ctx.textAlign = 'left';

            const reactionColor = '#000000';
            const reactionBaseY = beamY + 44;

            // Vertical reaction: displayed below support shape.
            const Fy = reaction.Fy || 0;
            if (Math.abs(Fy) > 0.01) {
                const arrowLen = 28 + Math.min(24, Math.abs(Fy) * 1.5);
                if (Fy > 0) {
                    // Positive: restore original direction convention
                    drawCanvasArrow(ctx, x, reactionBaseY, x, reactionBaseY + arrowLen, reactionColor, 8, 2, true);
                    ctx.fillStyle = reactionColor;
                    drawClampedLabel(ctx, `Ry=${Math.abs(Fy).toFixed(1)} kN`, x + 6, reactionBaseY + arrowLen + 12, width);
                } else {
                    // Negative: restore original direction convention
                    drawCanvasArrow(ctx, x, reactionBaseY + arrowLen, x, reactionBaseY, reactionColor, 8, 2, true);
                    ctx.fillStyle = reactionColor;
                    drawClampedLabel(ctx, `Ry=${Math.abs(Fy).toFixed(1)} kN`, x + 6, reactionBaseY + arrowLen + 12, width);
                }
            }

            // Transverse reaction: dot + label only, no arrow
            const Fz = reaction.Fz || 0;
            if (Math.abs(Fz) > 0.01) {
                ctx.save();
                ctx.fillStyle = reactionColor;
                ctx.beginPath();
                ctx.arc(x, reactionBaseY - 2, 5, 0, 2 * Math.PI);
                ctx.fill();
                ctx.font = `${fontSize}px Arial`;
                drawClampedLabel(ctx, `Rz=${Math.abs(Fz).toFixed(1)} kN`, x + 8, reactionBaseY - 8, width);
                ctx.restore();
            }

            // Axial reaction (Fx)
            const Fx = reaction.Fx || 0;
            if (Math.abs(Fx) > 0.01) {
                const axialLen = 34;
                const yFx = reactionBaseY + 18;
                const x2 = Fx >= 0 ? x + axialLen : x - axialLen;
                drawCanvasArrow(ctx, x, yFx, x2, yFx, reactionColor, 8, 2, true);
                ctx.fillStyle = reactionColor;
                drawClampedLabel(ctx, `Rx=${Math.abs(Fx).toFixed(1)} kN`, Math.min(x, x2) + 6, yFx + 14, width);
            }

            // Fixed support moment reaction (Mz)
            const Mz = reaction.Mz || 0;
            if (support.type === 'fixed' && Math.abs(Mz) > 0.01) {
                drawMomentReaction2D(ctx, x, reactionBaseY + 2, Mz, reactionColor);
                ctx.fillStyle = reactionColor;
                drawClampedLabel(ctx, `Mz=${Math.abs(Mz).toFixed(1)} kN·m`, x + 10, reactionBaseY - 20, width);
            }
        }
    });
    
    loads.forEach(load => {
        const x = startX + (load.position / beamLength) * beamWidth;
        ctx.font = `${Math.max(10, width / 40)}px Arial`;

        if (load.type === 'point load' && load.direction === 'vertical') {
            const isPositive = load.magnitude > 0;
            const arrowTopY = beamY - 34;
            const arrowBottomY = beamY;
            if (isPositive) {
                drawCanvasArrow(ctx, x, arrowTopY, x, arrowBottomY, '#007bff', 8, 2, false);
                ctx.fillStyle = '#007bff';
                ctx.fillText(`${Math.abs(load.magnitude)} kN`, x + 6, arrowTopY - 4);
            } else {
                drawCanvasArrow(ctx, x, beamY, x, beamY - 34, '#ef4444', 8, 2, false);
                ctx.fillStyle = '#ef4444';
                ctx.fillText(`${Math.abs(load.magnitude)} kN`, x + 6, beamY - 40);
            }
        } else if (load.type === 'point load' && load.direction === 'transverse') {
            drawTransverseDot2D(ctx, x, beamY);
            ctx.fillStyle = '#ff9800';
            ctx.fillText(`${Math.abs(load.magnitude)} kN`, x + 8, beamY - 8);
        } else if (load.type === 'point load' && load.direction === 'axial') {
            const y = beamY - 18;
            const arrowPts = getShortAxialArrowPoints(load.position, load.magnitude, beamLength, startX, beamWidth, 34);
            drawCanvasArrow(ctx, arrowPts.x1, y, arrowPts.x2, y, '#ffaa66', 8, 2, false);
            ctx.fillStyle = '#ffaa66';
            ctx.fillText(`${Math.abs(load.magnitude)} kN`, Math.min(arrowPts.x1, arrowPts.x2) + 6, y - 6);
        } else if (load.type === 'uniform distributed load' && load.direction === 'vertical') {
            const startPos = load.position;
            const endPos = load.position + (load.length || beamLength - load.position);
            const udlStartX = startX + (startPos / beamLength) * beamWidth;
            const udlEndX = startX + (Math.min(endPos, beamLength) / beamLength) * beamWidth;
            const udlWidth = udlEndX - udlStartX;
            const areaTop = beamY - 36;
            const areaHeight = 14;
            const lineY = areaTop + areaHeight;

            ctx.save();
            ctx.strokeStyle = 'rgba(59, 130, 246, 0.45)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(udlStartX, lineY);
            ctx.lineTo(udlEndX, lineY);
            ctx.stroke();

            const numArrows = Math.max(5, Math.min(9, Math.floor(udlWidth / 40)));
            for (let i = 0; i <= numArrows; i++) {
                const ax = udlStartX + (udlWidth * i / numArrows);
                if (load.magnitude >= 0) {
                    drawCanvasArrow(ctx, ax, lineY, ax, beamY, '#3b82f6', 7, 1.8, false);
                } else {
                    drawCanvasArrow(ctx, ax, beamY, ax, lineY, '#3b82f6', 7, 1.8, false);
                }
            }
            ctx.fillStyle = '#3b82f6';
            ctx.fillText(`${Math.abs(load.magnitude)} kN/m`, udlStartX + udlWidth / 2 - 18, areaTop - 4);
            ctx.restore();
        } else if (load.type === 'uniform distributed load' && load.direction === 'transverse') {
            const startPos = load.position;
            const endPos = load.position + (load.length || beamLength - load.position);
            const udlStartX = startX + (startPos / beamLength) * beamWidth;
            const udlEndX = startX + (Math.min(endPos, beamLength) / beamLength) * beamWidth;
            const udlWidth = udlEndX - udlStartX;
            const areaTop = beamY - 8;
            const areaHeight = 16;
            const lineY = areaTop + areaHeight / 2;

            ctx.save();
            ctx.strokeStyle = 'rgba(255, 152, 0, 0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(udlStartX, lineY);
            ctx.lineTo(udlEndX, lineY);
            ctx.stroke();

            const numPts = Math.max(5, Math.min(11, Math.floor(udlWidth / 35)));
            for (let i = 0; i <= numPts; i++) {
                const px = udlStartX + (udlWidth * i / numPts);
                if (load.magnitude >= 0) {
                    drawTransverseDot2D(ctx, px, beamY);
                } else {
                    ctx.beginPath();
                    ctx.arc(px, beamY, 4.5, 0, 2 * Math.PI);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(px - 3, beamY - 3);
                    ctx.lineTo(px + 3, beamY + 3);
                    ctx.moveTo(px - 3, beamY + 3);
                    ctx.lineTo(px + 3, beamY - 3);
                    ctx.stroke();
                }
            }
            ctx.fillStyle = '#ff9800';
            ctx.fillText(`${Math.abs(load.magnitude)} kN/m`, udlStartX + udlWidth / 2 - 20, areaTop - 4);
            ctx.restore();
        }
    });
}

function addSupportRow() {
    const beamLength = parseFloat(document.getElementById('beamLength').value);
    supports.push({ id: nextSupportId++, type: 'pinned', position: beamLength / 2 });
    updateSupportsTable();
    updateFreeBodyDiagram();
    scheduleCalculation();
}

function updateSupportsTable() {
    const tbody = document.getElementById('supportsBody');
    tbody.innerHTML = '';
    supports.sort((a, b) => a.position - b.position);
    supports.forEach((support, index) => {
        const row = tbody.insertRow();
        row.insertCell(0).innerHTML = index + 1;
        row.insertCell(1).innerHTML = `<select onchange="updateSupport(${support.id}, 'type', this.value)">
            <option value="pinned" ${support.type === 'pinned' ? 'selected' : ''}>Pinned</option>
            <option value="roller" ${support.type === 'roller' ? 'selected' : ''}>Roller</option>
            <option value="fixed" ${support.type === 'fixed' ? 'selected' : ''}>Fixed</option>
        </select>`;
        row.insertCell(2).innerHTML = `<input type="number" value="${support.position}" step="0.1" onchange="updateSupport(${support.id}, 'position', this.value)" style="width: 70px;">`;
        row.insertCell(3).innerHTML = `<button class="btn btn-danger" onclick="deleteSupport(${support.id})">Del</button>`;
    });
}

function updateSupport(id, field, value) {
    const support = supports.find(s => s.id === id);
    if (support) {
        if (field === 'position') {
            let newPos = parseFloat(value);
            const beamLength = parseFloat(document.getElementById('beamLength').value);
            newPos = Math.max(0, Math.min(beamLength, newPos));
            support.position = newPos;
        } else {
            support[field] = value;
        }
        updateSupportsTable();
        updateFreeBodyDiagram();
        scheduleCalculation();
    }
}

function deleteSupport(id) {
    if (supports.length <= 1) {
        alert("At least one support is required!");
        return;
    }
    supports = supports.filter(s => s.id !== id);
    updateSupportsTable();
    updateFreeBodyDiagram();
    scheduleCalculation();
}

function addLoadRow() {
    const beamLength = parseFloat(document.getElementById('beamLength').value);
    loads.push({
        id: nextLoadId++,
        label: `L${nextLoadId}`,
        type: 'point load',
        magnitude: 10,
        position: beamLength / 2,
        direction: 'vertical'
    });
    updateLoadsTable();
    updateFreeBodyDiagram();
    scheduleCalculation();
}

function updateLoadsLengthColumnVisibility() {
    const header = document.getElementById('loadLengthHeader');
    if (!header) return;

    const showLengthCol = loads.some(l => l.type === 'uniform distributed load');
    header.style.display = showLengthCol ? '' : 'none';

    document.querySelectorAll('#loadsBody .load-length-col').forEach((cell) => {
        cell.style.display = showLengthCol ? '' : 'none';
    });
}

function updateLoadsTable() {
    const tbody = document.getElementById('loadsBody');
    tbody.innerHTML = '';
    loads.forEach((load) => {
        const directionOptions = load.type === 'uniform distributed load'
            ? `
            <option value="vertical" ${load.direction === 'vertical' ? 'selected' : ''}>Vert</option>
            <option value="transverse" ${load.direction === 'transverse' ? 'selected' : ''}>Trans</option>`
            : `
            <option value="vertical" ${load.direction === 'vertical' ? 'selected' : ''}>Vert</option>
            <option value="transverse" ${load.direction === 'transverse' ? 'selected' : ''}>Trans</option>
            <option value="axial" ${load.direction === 'axial' ? 'selected' : ''}>Axial</option>`;

        if (load.type === 'uniform distributed load' && load.direction === 'axial') {
            load.direction = 'vertical';
        }

        const row = tbody.insertRow();
        row.insertCell(0).innerHTML = load.label;
        row.insertCell(1).innerHTML = `<select onchange="updateLoad(${load.id}, 'type', this.value)">
            <option value="point load" ${load.type === 'point load' ? 'selected' : ''}>Point</option>
            <option value="uniform distributed load" ${load.type === 'uniform distributed load' ? 'selected' : ''}>UDL</option>
            <option value="moment" ${load.type === 'moment' ? 'selected' : ''}>Moment</option>
        </select>`;
        row.insertCell(2).innerHTML = `<input type="number" value="${load.magnitude}" step="1" onchange="updateLoad(${load.id}, 'magnitude', this.value)" style="width: 55px;">`;
        row.insertCell(3).innerHTML = `<input type="number" value="${load.position}" step="0.1" onchange="updateLoad(${load.id}, 'position', this.value)" style="width: 65px;">`;
        const lengthCell = row.insertCell(4);
        lengthCell.className = 'load-length-col';
        if (load.type === 'uniform distributed load') {
            const beamLength = parseFloat(document.getElementById('beamLength').value);
            const currentLength = Number.isFinite(load.length) && load.length > 0
                ? load.length
                : Math.max(0.1, beamLength - load.position);
            load.length = currentLength;
            lengthCell.innerHTML = `<input type="number" value="${currentLength}" min="0.1" step="0.1" onchange="updateLoad(${load.id}, 'length', this.value)" style="width: 58px;">`;
        } else {
            lengthCell.innerHTML = `<span style="color:#999;">-</span>`;
        }

        row.insertCell(5).innerHTML = `<select onchange="updateLoad(${load.id}, 'direction', this.value)">${directionOptions}
        </select>`;
        row.insertCell(6).innerHTML = `<button class="btn btn-danger" onclick="deleteLoad(${load.id})">Del</button>`;
    });

    updateLoadsLengthColumnVisibility();
}

function updateLoad(id, field, value) {
    const load = loads.find(l => l.id === id);
    if (load) {
        if (field === 'magnitude') load.magnitude = parseFloat(value);
        else if (field === 'position') {
            load.position = parseFloat(value);
            if (load.type === 'uniform distributed load' && (!Number.isFinite(load.length) || load.length <= 0)) {
                const beamLength = parseFloat(document.getElementById('beamLength').value);
                load.length = Math.max(0.1, beamLength - load.position);
            }
        }
        else if (field === 'length') {
            load.length = Math.max(0.1, parseFloat(value) || 0.1);
        }
        else {
            load[field] = value;
            if (field === 'type') {
                const beamLength = parseFloat(document.getElementById('beamLength').value);
                if (load.type === 'uniform distributed load') {
                    load.length = Number.isFinite(load.length) && load.length > 0
                        ? load.length
                        : Math.max(0.1, beamLength - load.position);
                    if (load.direction === 'axial') load.direction = 'vertical';
                } else {
                    delete load.length;
                }
            }
        }
        updateLoadsTable();
        updateFreeBodyDiagram();
        scheduleCalculation();
    }
}

function deleteLoad(id) {
    loads = loads.filter(l => l.id !== id);
    updateLoadsTable();
    updateFreeBodyDiagram();
    scheduleCalculation();
}

function scheduleCalculation() {
    updateDeflectionLimitLabel();
    if (updateTimeout) clearTimeout(updateTimeout);
    updateTimeout = setTimeout(calculateResults, 300);
}

function getDeflectionLimitState() {
    const beamLength = parseFloat(document.getElementById('beamLength')?.value || '0');
    const purpose = (document.getElementById('beamPurpose')?.value || 'general').toLowerCase();
    const isCrane = purpose.includes('crane');

    const tol = 1e-6;
    let hasCantileverPart = false;

    if (supports.length === 1) {
        hasCantileverPart = true;
    } else if (supports.length >= 1 && beamLength > 0) {
        const positions = supports.map(s => parseFloat(s.position)).filter(v => !Number.isNaN(v)).sort((a, b) => a - b);
        if (positions.length > 0) {
            const leftOverhang = positions[0] > tol;
            const rightOverhang = positions[positions.length - 1] < (beamLength - tol);
            hasCantileverPart = leftOverhang || rightOverhang;
        }
    }

    const denominator = hasCantileverPart
        ? (isCrane ? 250 : 180)
        : (isCrane ? 600 : 200);

    return { denominator, hasCantileverPart, isCrane };
}

function updateDeflectionLimitLabel() {
    const infoEl = document.getElementById('deflectionLimitInfo');
    if (!infoEl) return;

    const state = getDeflectionLimitState();
    const purposeText = state.isCrane ? 'Crane' : 'General';
    const spanText = state.hasCantileverPart ? 'with cantilever part' : 'no cantilever part';
    infoEl.textContent = `Deflection limit (SLS): L/${state.denominator} (${purposeText}, ${spanText})`;
}

async function calculateResults() {
    const beamLength = parseFloat(document.getElementById('beamLength').value);
    const beamType = document.getElementById('beamType').value;
    const steelGrade = document.getElementById('steelGrade').value;
    const beampurpose = document.getElementById('beamPurpose').value;

    const data = {
        beam_length: beamLength,
        beam_type: beamType,
        material: "Steel",
        section_props: currentSectionProps,
        supports: supports.map(s => ({ position: s.position, type: s.type })),
        beam_purpose: beampurpose,
        steel_grade: steelGrade,
        loads: loads.map(l => ({
            type: l.type,
            magnitude: l.magnitude,
            position: l.position,
            direction: l.direction || 'vertical',
            ...(l.type === 'uniform distributed load' ? { length: l.length } : {})
        }))
    };
    
    try {
        const response = await fetch('/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await response.json();
        
        if (result.success) {
            currentReactions = result.reactions;
            currentMemberForces = result.member_forces;
            currentFEAResult = result; // Store for visualization mode switching
            window.lastMemberCheckResults = result.member_check;
            updateMemberForces(result.member_forces);
            plotDiagrams(result);
            updateFreeBodyDiagram();
            updateMemberCheckUI(result.member_forces, beamLength, steelGrade);
            
            if (window.update3DModel) {
                window.update3DModel(beamLength, supports, loads, result.reactions, beamType, currentSectionProps, result);
            }
        }
    } catch (error) {
        console.error('Request error:', error);
    }
}

function updateMemberForces(forces) {
    document.getElementById('memberForcesSummary').innerHTML = `
        <div class="force-card"><h4>Axial Force</h4><div class="value">${forces.axial_force} <span class="unit">kN</span></div></div>
        <div class="force-card"><h4>Shear (Major)</h4><div class="value">${forces.shear_major} <span class="unit">kN</span></div></div>
        <div class="force-card"><h4>Shear (Minor)</h4><div class="value">${forces.shear_minor || 0} <span class="unit">kN</span></div></div>
        <div class="force-card"><h4>Torsion</h4><div class="value">${forces.torsion || 0} <span class="unit">kN·m</span></div></div>
        <div class="force-card"><h4>Moment (Major)</h4><div class="value">${forces.bending_major} <span class="unit">kN·m</span></div></div>
        <div class="force-card"><h4>Moment (Minor)</h4><div class="value">${forces.bending_minor || 0} <span class="unit">kN·m</span></div></div>
        <div class="force-card"><h4>Max Deflection</h4><div class="value">${forces.max_deflection} <span class="unit">mm</span></div></div>
    `;
}

function plotDiagrams(result) {
    const layout = { 
        margin: { l: 40, r: 20, t: 30, b: 35 }, 
        showlegend: false, 
        plot_bgcolor: '#ffffff', 
        paper_bgcolor: '#ffffff', 
        autosize: true, 
        responsive: true,
        height: 250,
        xaxis: { title: 'Position (m)' }
    };
    
    // Vertical direction (Major Axis) diagrams
    Plotly.newPlot('shearDiagram', [{ 
        x: result.shear_diagram.x, 
        y: result.shear_diagram.y, 
        type: 'scatter', 
        mode: 'lines', 
        line: { color: '#dc3545', width: 2 }, 
        fill: 'tozeroy' 
    }], { 
        ...layout, 
        title: 'Shear Force (Vertical) - kN'
    }, { responsive: true });
    
    Plotly.newPlot('momentDiagram', [{ 
        x: result.moment_diagram.x, 
        y: result.moment_diagram.y, 
        type: 'scatter', 
        mode: 'lines', 
        line: { color: '#28a745', width: 2 }, 
        fill: 'tozeroy' 
    }], { 
        ...layout, 
        title: 'Bending Moment (Major Axis) - kN·m'
    }, { responsive: true });
    
    Plotly.newPlot('deflectionDiagram', [{ 
        x: result.deflection_diagram.x, 
        y: result.deflection_diagram.y, 
        type: 'scatter', 
        mode: 'lines', 
        line: { color: '#007bff', width: 2 }, 
        fill: 'tozeroy' 
    }], { 
        ...layout, 
        title: `Deflection (Vertical) - mm - Max: ${result.max_deflection.toFixed(2)} mm`
    }, { responsive: true });
    
    // Transverse direction (Minor Axis) diagrams
    if (result.shear_diagram_transverse && result.shear_diagram_transverse.x.length > 0) {
        Plotly.newPlot('shearDiagramTransverse', [{ 
            x: result.shear_diagram_transverse.x, 
            y: result.shear_diagram_transverse.y, 
            type: 'scatter', 
            mode: 'lines', 
            line: { color: '#ff6b6b', width: 2 }, 
            fill: 'tozeroy' 
        }], { 
            ...layout, 
            title: 'Shear Force (Transverse) - kN'
        }, { responsive: true });
        
        Plotly.newPlot('momentDiagramTransverse', [{ 
            x: result.moment_diagram_transverse.x, 
            y: result.moment_diagram_transverse.y, 
            type: 'scatter', 
            mode: 'lines', 
            line: { color: '#51cf66', width: 2 }, 
            fill: 'tozeroy' 
        }], { 
            ...layout, 
            title: 'Bending Moment (Minor Axis) - kN·m'
        }, { responsive: true });
        
        Plotly.newPlot('deflectionDiagramTransverse', [{ 
            x: result.deflection_diagram_transverse.x, 
            y: result.deflection_diagram_transverse.y, 
            type: 'scatter', 
            mode: 'lines', 
            line: { color: '#339af0', width: 2 }, 
            fill: 'tozeroy' 
        }], { 
            ...layout, 
            title: `Deflection (Transverse) - mm - Max: ${(result.max_deflection_transverse || 0).toFixed(2)} mm`
        }, { responsive: true });
    } else {
        // Clear transverse diagrams if no transverse loads
        ['shearDiagramTransverse', 'momentDiagramTransverse', 'deflectionDiagramTransverse'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<p style="text-align:center;color:#999;padding:80px 0;">No transverse loads applied</p>';
        });
    }
}

function testCase1() {
    document.getElementById('beamLength').value = 6;
    supports = [{id: 1, type: 'pinned', position: 0}, {id: 2, type: 'roller', position: 6}];
    loads = [{id: 1, label: 'L1', type: 'point load', magnitude: 10, position: 3, direction: 'vertical'}];
    nextSupportId = 3; nextLoadId = 2;
    updateSupportsTable(); updateLoadsTable(); updateFreeBodyDiagram(); scheduleCalculation();
}

function testCase2() {
    document.getElementById('beamLength').value = 4;
    supports = [{id: 1, type: 'fixed', position: 0}];
    loads = [{id: 1, label: 'L1', type: 'point load', magnitude: 10, position: 4, direction: 'vertical'}];
    nextSupportId = 2; nextLoadId = 2;
    updateSupportsTable(); updateLoadsTable(); updateFreeBodyDiagram(); scheduleCalculation();
}

function testCase3() {
    document.getElementById('beamLength').value = 6;
    supports = [{id: 1, type: 'pinned', position: 0}, {id: 2, type: 'roller', position: 6}];
    loads = [{id: 1, label: 'L1', type: 'uniform distributed load', magnitude: 5, position: 0, length: 6, direction: 'vertical'}];
    nextSupportId = 3; nextLoadId = 2;
    updateSupportsTable(); updateLoadsTable(); updateFreeBodyDiagram(); scheduleCalculation();
}

// Event listeners
document.getElementById('beamLength').addEventListener('change', scheduleCalculation);
document.getElementById('steelGrade').addEventListener('change', scheduleCalculation);
document.getElementById('beamPurpose').addEventListener('change', scheduleCalculation);

document.querySelectorAll('input[name="standard"]').forEach(radio => {
    radio.addEventListener('change', () => {
        updateBeamTypeOptions();
        const beamTypeSelect = document.getElementById('beamType');
        const designationSelect = document.getElementById('designation');
        beamTypeSelect.value = '';
        designationSelect.innerHTML = '<option value="">Select Beam Type first</option>';
        designationSelect.disabled = true;
        
        clearSectionProperties();
        
        currentSectionProps = {
            area: 5000,
            Ix: 18000000,
            Iy: 9000000,
            Zx: 200000,
            Zy: 100000,
            rx: 60,
            ry: 40,
            weight: 39.2,
            j: 0,
            D: 0, B: 0, T: 0, t: 0, ro: 0, Sz: 0, Sy: 0
        };
        
        scheduleCalculation();
    });
});

document.getElementById('beamType').addEventListener('change', function() {
    updateDesignationOptions();
    const designationSelect = document.getElementById('designation');
    if (designationSelect.value) {
        designationSelect.value = '';
    }
    clearSectionProperties();
    currentSectionProps = {
        area: 0,
        Ix: 0,
        Iy: 0,
        Zx: 0,
        Zy: 0,
        rx: 0,
        ry: 0,
        weight: 0,
        j: 0,
        D: 0, B: 0, T: 0, t: 0, ro: 0, Sz: 0, Sy: 0
    };
    scheduleCalculation();
});

document.getElementById('designation').addEventListener('change', function() {
    if (!this.value) {
        clearSectionProperties();
        currentSectionProps = {
            area: 0,
            Ix: 0,
            Iy: 0,
            Zx: 0,
            Zy: 0,
            rx: 0,
            ry: 0,
            weight: 0,
            j: 0,
            D: 0, B: 0, T: 0, t: 0, ro: 0, Sz: 0, Sy: 0
        };
    } else {
        onDesignationChange();
    }
});

// Click-to-add point load on 2D FBD is intentionally disabled.

window.addEventListener('resize', () => {
    if (document.getElementById('shearDiagram')) {
        Plotly.relayout('shearDiagram', { autosize: true });
        Plotly.relayout('momentDiagram', { autosize: true });
        Plotly.relayout('deflectionDiagram', { autosize: true });
    }
    resizeCanvas();
});

// Initialize
loadJSONFiles().then(() => {
    setTimeout(() => {
        updateBeamTypeOptions();
    }, 500);
});

setTimeout(() => {
    resizeCanvas();
    const canvasContainer = document.querySelector('#freeBodyCanvas').parentElement;
    if (canvasContainer) {
        new ResizeObserver(() => resizeCanvas()).observe(canvasContainer);
    }
}, 100);

updateSupportsTable();
updateLoadsTable();
updateFreeBodyDiagram();
initializeMemberCheckUI();
updateDeflectionLimitLabel();
scheduleCalculation();

// Visualization mode switching for 3D FEA contours
function set3DVisualizationMode(mode) {
    if (window.set3DVisualizationMode) {
        window.set3DVisualizationMode(mode);
    }
    
    // Update button states
    document.getElementById('btn3dNone').classList.toggle('btn-primary', mode === 'none');
    document.getElementById('btn3dMoment').classList.toggle('btn-primary', mode === 'moment');
    document.getElementById('btn3dShear').classList.toggle('btn-primary', mode === 'shear');
    document.getElementById('btn3dDeflection').classList.toggle('btn-primary', mode === 'deflection');
    
    // Show/hide legend and update units
    const legend = document.getElementById('colorLegend');
    if (mode === 'none') {
        legend.style.display = 'none';
    } else {
        legend.style.display = 'block';
        
        // Update legend based on mode
        if (currentFEAResult) {
            let data, unit;
            if (mode === 'moment') {
                data = currentFEAResult.vertical.moment.yCoords;
                unit = 'kN·m';
            } else if (mode === 'shear') {
                data = currentFEAResult.vertical.shear.yCoords;
                unit = 'kN';
            } else if (mode === 'deflection') {
                data = currentFEAResult.vertical.deflection.yCoords;
                unit = 'mm';
            }
            
            if (data) {
                const maxAbs = Math.max(...data.map(Math.abs));
                document.getElementById('legendMin').textContent = (-maxAbs).toFixed(1);
                document.getElementById('legendMax').textContent = (+maxAbs).toFixed(1);
                document.getElementById('legendUnit').textContent = unit;
            }
        }
    }
}

function getSelectedStandardLabel() {
    const selected = document.querySelector('input[name="standard"]:checked');
    if (!selected) return '-';
    return selected.value;
}

function getCanvasImageDataUrl(canvasId) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !canvas.toDataURL) return null;
    return canvas.toDataURL('image/png');
}

function get3DCanvasImageDataUrl() {
    const container = document.getElementById('canvas3d');
    if (!container) return null;
    const canvases = Array.from(container.querySelectorAll('canvas'));
    if (!canvases.length) return null;
    // Choose the largest canvas (WebGL renderer canvas)
    const selected = canvases.sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
    return selected.toDataURL('image/png');
}

async function getPlotlyImageDataUrl(plotId, width = 1200, height = 450) {
    const node = document.getElementById(plotId);
    if (!node || typeof Plotly === 'undefined' || !Plotly.toImage) return null;
    try {
        return await Plotly.toImage(node, { format: 'png', width, height, scale: 2 });
    } catch (err) {
        console.warn(`Plotly image capture failed for ${plotId}:`, err);
        return null;
    }
}

function addPdfHeader(doc, pageTitle, y = 12) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('Steel Beam Analysis Report', 10, y);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 140, y);
    doc.setFontSize(11);
    doc.text(pageTitle, 10, y + 6);
    doc.setDrawColor(160);
    doc.line(10, y + 8, 200, y + 8);
}

function addImageToPdf(doc, imgData, x, y, w, h, label) {
    doc.setDrawColor(210);
    doc.rect(x, y, w, h);
    if (label) {
        doc.setFontSize(9);
        doc.text(label, x + 2, y + 4);
    }
    if (imgData) {
        const topPad = label ? 6 : 1;
        doc.addImage(imgData, 'PNG', x + 1, y + topPad, w - 2, h - topPad - 1, undefined, 'FAST');
    } else {
        doc.setFontSize(9);
        doc.text('Image not available', x + 2, y + h / 2);
    }
}

function fmtNum(v, digits = 3) {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(digits) : '-';
}

function addSimpleRows(doc, rows, x, y, lineH = 5) {
    doc.setFontSize(9);
    rows.forEach((r, i) => {
        doc.text(`${r[0]}: ${r[1]}`, x, y + i * lineH);
    });
    return y + rows.length * lineH;
}

function addUtilSummaryTable(doc, startY, ratioRows) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Utilization Summary', 10, startY);
    doc.setFont('helvetica', 'normal');
    const x1 = 10;
    const x2 = 120;
    const x3 = 165;
    const rowH = 5;
    let y = startY + 4;
    doc.setDrawColor(180);
    doc.rect(x1, y, 190, rowH);
    doc.text('Check Item', x1 + 1, y + 3.5);
    doc.text('Utilization', x2 + 1, y + 3.5);
    doc.text('Status', x3 + 1, y + 3.5);
    y += rowH;
    ratioRows.forEach((row) => {
        doc.rect(x1, y, 190, rowH);
        doc.text(row.name, x1 + 1, y + 3.5);
        doc.text(fmtNum(row.value, 3), x2 + 1, y + 3.5);
        doc.text(row.value <= 1 ? 'OK' : 'NG', x3 + 1, y + 3.5);
        y += rowH;
    });
    return y;
}

function getMemberCheckFormulaLines(memberCheck, memberForces) {
    const lines = [];
    const Vmaj = Number(memberForces?.shear_major || 0);
    const Vmin = Number(memberForces?.shear_minor || 0);
    const Mmaj = Number(memberForces?.bending_major || 0);
    const Mmin = Number(memberForces?.bending_minor || 0);
    const N = Number(memberForces?.axial_force || 0);
    const dMax = Number(memberForces?.max_deflection || 0);

    lines.push('Member Check Detailed Equations (as available from solver outputs):');
    lines.push(`1) Deflection: UR = delta_max / delta_limit = ${fmtNum(dMax, 3)} / ${fmtNum(memberCheck.deflection_limit, 3)} = ${fmtNum(memberCheck.vertical_deflection_util, 4)}`);
    lines.push(`   Rule used: ${memberCheck.deflection_limit_rule || '-'}`);
    lines.push(`2) Shear Major: UR = V_Ed / V_Rd = ${fmtNum(Vmaj, 3)} / ${fmtNum(memberCheck.shear_capacity_y, 3)} = ${fmtNum(memberCheck.ur_shear_y, 4)}`);
    lines.push(`3) Shear Minor: UR = V_Ed / V_Rd = ${fmtNum(Vmin, 3)} / ${fmtNum(memberCheck.shear_capacity_z, 3)} = ${fmtNum(memberCheck.ur_shear_z, 4)}`);
    lines.push(`4) Moment Major: UR = M_Ed / M_Rd = ${fmtNum(Mmaj, 3)} / ${fmtNum(memberCheck.moment_capacity_z, 3)} = ${fmtNum(memberCheck.ur_moment_z, 4)}`);
    lines.push(`5) Moment Minor: UR = M_Ed / M_Rd = ${fmtNum(Mmin, 3)} / ${fmtNum(memberCheck.moment_capacity_y, 3)} = ${fmtNum(memberCheck.ur_moment_y, 4)}`);
    lines.push(`6) Axial Tension: UR = N_Ed / N_t,Rd = ${fmtNum(N, 3)} / ${fmtNum(memberCheck.tension_capacity, 3)} = ${fmtNum(memberCheck.ur_tension, 4)}`);
    lines.push(`7) Axial Compression: UR = N_Ed / N_c,Rd = ${fmtNum(N, 3)} / ${fmtNum(memberCheck.compression_capacity, 3)} = ${fmtNum(memberCheck.ur_compression, 4)}`);
    lines.push(`8) LTB Major: UR = M_Ed / M_b,Rd = ${fmtNum(Mmaj, 3)} / ${fmtNum(memberCheck.ltb_capacity, 3)} = ${fmtNum(memberCheck.ur_ltb, 4)}`);
    lines.push(`9) Combined Tension + Biaxial Moment = UR_t + UR_my + UR_mz = ${fmtNum(memberCheck.combined_tension_moment, 4)}`);
    lines.push(`10) Combined Tension + Buckling = UR_t + UR_ltb + UR_my = ${fmtNum(memberCheck.combined_tension_buckling, 4)}`);
    lines.push(`11) Combined Compression + Biaxial Moment = UR_c + UR_my + UR_mz = ${fmtNum(memberCheck.combined_compression_moment, 4)}`);
    lines.push(`12) Combined Compression + Buckling = UR_c + UR_ltb + UR_my = ${fmtNum(memberCheck.combined_compression_buckling, 4)}`);
    lines.push(`13) Section Classification: class = ${memberCheck.section_class || '-'}, reduction factor = ${fmtNum(memberCheck.reduction_factor, 4)}`);
    return lines;
}

async function exportReportAsPDF() {
    const button = document.getElementById('exportPdfBtn');
    const oldLabel = button ? button.textContent : '';
    try {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('PDF library is not loaded. Please refresh and try again.');
            return;
        }

        if (button) {
            button.disabled = true;
            button.textContent = 'Generating PDF...';
        }

        // Ensure report uses the latest analysis state.
        await calculateResults();

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });

        const standard = getSelectedStandardLabel();
        const beamLength = parseFloat(document.getElementById('beamLength').value || '0');
        const beamPurpose = document.getElementById('beamPurpose').value || '-';
        const steelGrade = document.getElementById('steelGrade').value || '-';
        const beamType = document.getElementById('beamType').value || '-';
        const designation = document.getElementById('designation').value || '-';

        const memberForces = currentMemberForces || {};
        const memberCheck = window.lastMemberCheckResults || {};

        const [
            sectionImg,
            fbd2dImg,
            fbd3dImg,
            shearMajorImg,
            momentMajorImg,
            deflMajorImg,
            shearMinorImg,
            momentMinorImg,
            deflMinorImg,
            utilChartImg
        ] = await Promise.all([
            Promise.resolve(getCanvasImageDataUrl('sectionShapeCanvas')),
            Promise.resolve(getCanvasImageDataUrl('freeBodyCanvas')),
            Promise.resolve(get3DCanvasImageDataUrl()),
            getPlotlyImageDataUrl('shearDiagram', 1400, 500),
            getPlotlyImageDataUrl('momentDiagram', 1400, 500),
            getPlotlyImageDataUrl('deflectionDiagram', 1400, 500),
            getPlotlyImageDataUrl('shearDiagramTransverse', 1400, 500),
            getPlotlyImageDataUrl('momentDiagramTransverse', 1400, 500),
            getPlotlyImageDataUrl('deflectionDiagramTransverse', 1400, 500),
            getPlotlyImageDataUrl('utilizationChart', 1400, 550)
        ]);

        // Page 1: Beam Section Properties
        addPdfHeader(doc, '1) Beam Section Properties');
        const sectionRows = [
            ['Standard', standard],
            ['Beam Type', beamType],
            ['Designation', designation],
            ['Steel Grade', steelGrade],
            ['Area (mm^2)', fmtNum(currentSectionProps.area, 3)],
            ['Ix (mm^4)', fmtNum(currentSectionProps.Ix, 3)],
            ['Iy (mm^4)', fmtNum(currentSectionProps.Iy, 3)],
            ['Zx/Sz major (mm^3)', fmtNum(currentSectionProps.Sz || currentSectionProps.Zx, 3)],
            ['Zy/Sy minor (mm^3)', fmtNum(currentSectionProps.Sy || currentSectionProps.Zy, 3)],
            ['rx (mm)', fmtNum(currentSectionProps.rx, 3)],
            ['ry (mm)', fmtNum(currentSectionProps.ry, 3)],
            ['Weight (kg/m)', fmtNum(currentSectionProps.weight, 3)],
            ['D (mm)', fmtNum(currentSectionProps.D, 3)],
            ['B (mm)', fmtNum(currentSectionProps.B, 3)],
            ['T (mm)', fmtNum(currentSectionProps.T, 3)],
            ['t (mm)', fmtNum(currentSectionProps.t, 3)],
            ['ro (mm)', fmtNum(currentSectionProps.ro, 3)],
            ['J (mm^4)', fmtNum(currentSectionProps.j, 3)]
        ];
        addSimpleRows(doc, sectionRows, 10, 24, 5);
        addImageToPdf(doc, sectionImg, 105, 24, 95, 120, 'Section Drawing');

        // Page 2: Beam Definition + FBD
        doc.addPage();
        addPdfHeader(doc, '2) Beam Definition, Supports, Loads, and Free Body Diagrams');
        const beamRows = [
            ['Beam Length (m)', fmtNum(beamLength, 3)],
            ['Beam Purpose', beamPurpose],
            ['Supports Count', supports.length],
            ['Loads Count', loads.length]
        ];
        addSimpleRows(doc, beamRows, 10, 24, 5);

        doc.setFontSize(9);
        doc.text('Supports:', 10, 50);
        supports.forEach((s, i) => {
            doc.text(`${i + 1}. ${s.type} at ${fmtNum(s.position, 3)} m`, 14, 55 + i * 4.5);
        });

        const loadStartY = 55 + Math.max(1, supports.length) * 4.5 + 4;
        doc.text('Loads:', 10, loadStartY);
        loads.forEach((l, i) => {
            const lenTxt = l.type === 'uniform distributed load' ? `, L=${fmtNum(l.length, 3)} m` : '';
            doc.text(`${i + 1}. ${l.type}, ${fmtNum(l.magnitude, 3)} (${l.direction || 'vertical'}), x=${fmtNum(l.position, 3)} m${lenTxt}`, 14, loadStartY + 5 + i * 4.5);
        });

        addImageToPdf(doc, fbd2dImg, 10, 95, 92, 90, '2D Free Body Diagram');
        addImageToPdf(doc, fbd3dImg, 108, 95, 92, 90, '3D Free Body Diagram');

        // Page 3: Member force summary + major diagrams
        doc.addPage();
        addPdfHeader(doc, '3) Member Force Summary and Major Axis Diagrams');
        const forceRows = [
            ['Axial Force (kN)', fmtNum(memberForces.axial_force, 3)],
            ['Shear Major (kN)', fmtNum(memberForces.shear_major, 3)],
            ['Shear Minor (kN)', fmtNum(memberForces.shear_minor, 3)],
            ['Torsion (kN.m)', fmtNum(memberForces.torsion, 3)],
            ['Bending Major (kN.m)', fmtNum(memberForces.bending_major, 3)],
            ['Bending Minor (kN.m)', fmtNum(memberForces.bending_minor, 3)],
            ['Max Deflection Vertical (mm)', fmtNum(memberForces.max_deflection, 3)],
            ['Max Deflection Transverse (mm)', fmtNum(memberForces.max_deflection_transverse, 3)]
        ];
        addSimpleRows(doc, forceRows, 10, 24, 5);
        addImageToPdf(doc, shearMajorImg, 10, 66, 190, 38, 'Shear Force Diagram (Major Axis)');
        addImageToPdf(doc, momentMajorImg, 10, 108, 190, 38, 'Bending Moment Diagram (Major Axis)');
        addImageToPdf(doc, deflMajorImg, 10, 150, 190, 38, 'Deflection Diagram (Vertical)');

        // Page 4: transverse diagrams + detailed member check formulas
        doc.addPage();
        addPdfHeader(doc, '4) Transverse Diagrams and Detailed Member Check');
        addImageToPdf(doc, shearMinorImg, 10, 22, 190, 33, 'Shear Force Diagram (Minor Axis)');
        addImageToPdf(doc, momentMinorImg, 10, 58, 190, 33, 'Bending Moment Diagram (Minor Axis)');
        addImageToPdf(doc, deflMinorImg, 10, 94, 190, 33, 'Deflection Diagram (Transverse)');

        let textY = 132;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Member Check Details', 10, textY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        textY += 5;

        const formulaLines = getMemberCheckFormulaLines(memberCheck, memberForces);
        formulaLines.forEach((line) => {
            const wrapped = doc.splitTextToSize(line, 188);
            wrapped.forEach((subLine) => {
                if (textY > 286) {
                    doc.addPage();
                    addPdfHeader(doc, '4) Transverse Diagrams and Detailed Member Check (cont.)');
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(9);
                    textY = 24;
                }
                doc.text(subLine, 10, textY);
                textY += 4.4;
            });
        });

        // Last page: utilization chart + summary table
        doc.addPage();
        addPdfHeader(doc, '5) Utilization Ratio Graph and Summary Table');
        addImageToPdf(doc, utilChartImg, 10, 24, 190, 84, 'Utilization Ratio Graph');

        const ratioRows = [
            { name: 'Vertical Deflection', value: Number(memberCheck.vertical_deflection_util || 0) },
            { name: 'Shear Capacity (Major)', value: Number(memberCheck.ur_shear_y || 0) },
            { name: 'Shear Capacity (Minor)', value: Number(memberCheck.ur_shear_z || 0) },
            { name: 'Moment Capacity (Major)', value: Number(memberCheck.ur_moment_z || 0) },
            { name: 'Moment Capacity (Minor)', value: Number(memberCheck.ur_moment_y || 0) },
            { name: 'Tension Capacity', value: Number(memberCheck.ur_tension || 0) },
            { name: 'Compression Capacity', value: Number(memberCheck.ur_compression || 0) },
            { name: 'Lateral Torsional Buckling', value: Number(memberCheck.ur_ltb || 0) },
            { name: 'Combined Tension + Moment', value: Number(memberCheck.combined_tension_moment || 0) },
            { name: 'Combined Tension + Buckling', value: Number(memberCheck.combined_tension_buckling || 0) },
            { name: 'Combined Compression + Moment', value: Number(memberCheck.combined_compression_moment || 0) },
            { name: 'Combined Compression + Buckling', value: Number(memberCheck.combined_compression_buckling || 0) }
        ];
        const yEnd = addUtilSummaryTable(doc, 114, ratioRows);
        const maxUtil = ratioRows.reduce((m, r) => Math.max(m, r.value), 0);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(`Max Utilization = ${fmtNum(maxUtil, 4)} (${maxUtil <= 1 ? 'PASS' : 'NOT PASS'})`, 10, Math.min(286, yEnd + 8));

        const ts = new Date();
        const stamp = `${ts.getFullYear()}${String(ts.getMonth() + 1).padStart(2, '0')}${String(ts.getDate()).padStart(2, '0')}_${String(ts.getHours()).padStart(2, '0')}${String(ts.getMinutes()).padStart(2, '0')}${String(ts.getSeconds()).padStart(2, '0')}`;
        const fileName = `beam_report_${stamp}.pdf`;
        doc.save(fileName);
    } catch (error) {
        console.error('PDF export failed:', error);
        alert('Failed to generate PDF report. Please try again.');
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = oldLabel || 'Export Report as PDF';
        }
    }
}