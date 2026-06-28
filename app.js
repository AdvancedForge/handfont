window.onload = function() {
    // --- Core UI Elements ---
    const canvas = document.getElementById('paintCanvas');
    const ctx = canvas.getContext('2d');
    const clearBtn = document.getElementById('clearBtn');
    const backBtn = document.getElementById('backBtn');
    const nextBtn = document.getElementById('nextBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const btnGlobalReset = document.getElementById('btnGlobalReset');
    const currentCharLabel = document.getElementById('currentChar');
    const ghostLetter = document.getElementById('ghostLetter');

    // --- Onboarding Panel Hook Selectors ---
    const welcomeModal = document.getElementById('welcomeModal');
    const btnStartDrawing = document.getElementById('btnStartDrawing');
    const btnLoadExample = document.getElementById('btnLoadExample');

    // --- Config & Notification Elements ---
    const btnUpper = document.getElementById('btnUpper');
    const btnLower = document.getElementById('btnLower');
    const btnNumbers = document.getElementById('btnNumbers');
    const btnSymbols = document.getElementById('btnSymbols'); 
    const configAlert = document.getElementById('configAlert');
    const btnApplyConfig = document.getElementById('btnApplyConfig');
    const toggleGhost = document.getElementById('toggleGhost');
    const liveTesterInput = document.getElementById('liveTesterInput');
    const previewCanvas = document.getElementById('previewRenderCanvas');
    const pCtx = previewCanvas.getContext('2d');

    // --- App State Engine ---
    const rawUpper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
    const rawLower = "abcdefghijklmnopqrstuvwxyz".split("");
    const rawNumbers = "0123456789".split("");
    const rawSymbols = ".,!?&@#+-/=()*\"':;<>_[]{}|\\^`~%$".split(""); 
    
    const masterAlphabet = [...rawUpper, ...rawLower, ...rawNumbers, ...rawSymbols];
    let alphabet = [...masterAlphabet];
    let currentIndex = 0;
    let fontDatabase = {};
    let drawing = false;
    let currentStroke = [];

    let includeUpper = true;
    let includeLower = true;
    let includeNumbers = true;
    let includeSymbols = true;

    let stagedUpper = true;
    let stagedLower = true;
    let stagedNumbers = true;
    let stagedSymbols = true;

    function resetDatabase() {
        fontDatabase = {};
        masterAlphabet.forEach(char => { fontDatabase[char] = []; });
    }
    resetDatabase();

    // --- Onboarding Evaluation Hook ---
    function checkOnboarding() {
        const hasVisited = localStorage.getItem('fontforge_visited');
        if (!hasVisited) {
            if (welcomeModal) welcomeModal.style.display = 'flex';
        } else {
            if (welcomeModal) welcomeModal.style.display = 'none';
        }
    }

    if (btnStartDrawing) {
        btnStartDrawing.addEventListener('click', () => {
            localStorage.setItem('fontforge_visited', 'true');
            if (welcomeModal) {
                welcomeModal.style.opacity = '0';
                setTimeout(() => { welcomeModal.style.display = 'none'; }, 250);
            }
        });
    }

    if (btnLoadExample) {
        btnLoadExample.addEventListener('click', () => {
            window.location.href = "preview.html";
        });
    }

    function stageSubsetChange(type) {
        if (type === 'upper') stagedUpper = !stagedUpper;
        if (type === 'lower') stagedLower = !stagedLower;
        if (type === 'numbers') stagedNumbers = !stagedNumbers;
        if (type === 'symbols') stagedSymbols = !stagedSymbols;

        btnUpper.classList.toggle('active', stagedUpper);
        btnLower.classList.toggle('active', stagedLower);
        btnNumbers.classList.toggle('active', stagedNumbers);
        btnSymbols.classList.toggle('active', stagedSymbols);

        const hasChanges = (stagedUpper !== includeUpper) || 
                          (stagedLower !== includeLower) || 
                          (stagedNumbers !== includeNumbers) ||
                          (stagedSymbols !== includeSymbols);

        configAlert.style.display = hasChanges ? "flex" : "none";
    }

    btnApplyConfig.addEventListener('click', () => {
        resetDatabase();
        includeUpper = stagedUpper;
        includeLower = stagedLower;
        includeNumbers = stagedNumbers;
        includeSymbols = stagedSymbols;
        configAlert.style.display = "none";
        rebuildAlphabetSequence();
        renderLivePreview();
    });

    function rebuildAlphabetSequence() {
        let filtered = [];
        if (includeUpper) filtered = filtered.concat(rawUpper);
        if (includeLower) filtered = filtered.concat(rawLower);
        if (includeNumbers) filtered = filtered.concat(rawNumbers);
        if (includeSymbols) filtered = filtered.concat(rawSymbols);
        
        alphabet = filtered.length > 0 ? filtered : ["A"];
        currentIndex = 0;
        updateUI();
    }

    // --- Geometry Vector Calculations ---
    function getStrokeOutline(points, thickness = 16) {
        if (points.length < 2) return [];
        let leftSide = []; let rightSide = [];
        for (let i = 0; i < points.length; i++) {
            const current = points[i];
            let dx, dy;
            if (i === points.length - 1) {
                dx = current.x - points[i - 1].x; dy = current.y - points[i - 1].y;
            } else {
                dx = points[i + 1].x - current.x; dy = points[i + 1].y - current.y;
            }
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = dx / len; const ny = dy / len;
            const px = -ny * (thickness / 2); const py = nx * (thickness / 2);
            leftSide.push({ x: current.x + px, y: current.y + py });
            rightSide.unshift({ x: current.x - px, y: current.y - py });
        }
        return leftSide.concat(rightSide);
    }

    function isDot(stroke) {
        if (stroke.length <= 2) return true;
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        stroke.forEach(pt => {
            if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y;
        });
        return (maxX - minX < 8 && maxY - minY < 8);
    }

    // --- Interactive Canvas Hooks ---
    canvas.addEventListener('pointerdown', (e) => {
        drawing = true;
        const pt = getCanvasPos(e);
        currentStroke = [{ x: pt.x, y: pt.y }];
        drawAll();
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!drawing) return;
        const pt = getCanvasPos(e);
        currentStroke.push({ x: pt.x, y: pt.y });
        drawAll();
    });

    const endDrawing = () => {
        if (!drawing) return;
        const activeChar = alphabet[currentIndex];
        if (currentStroke.length > 0) {
            fontDatabase[activeChar].push(currentStroke);
        }
        currentStroke = [];
        drawing = false;
        renderLivePreview();
    };

    canvas.addEventListener('pointerup', endDrawing);
    canvas.addEventListener('pointercancel', endDrawing);

    function getCanvasPos(e) {
        const rect = canvas.getBoundingClientRect();
        return { 
            x: ((e.clientX - rect.left) / rect.width) * canvas.width, 
            y: ((e.clientY - rect.top) / rect.height) * canvas.height 
        };
    }

    function drawAll() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000000';
        const activeChar = alphabet[currentIndex];
        if (fontDatabase[activeChar]) {
            fontDatabase[activeChar].forEach(stroke => {
                if (isDot(stroke)) {
                    ctx.beginPath();
                    ctx.arc(stroke[0].x, stroke[0].y, 8, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    drawSingleStroke(ctx, stroke, 16);
                }
            });
        }
        if (currentStroke.length > 0) {
            if (currentStroke.length === 1) {
                ctx.beginPath();
                ctx.arc(currentStroke[0].x, currentStroke[0].y, 8, 0, Math.PI * 2);
                ctx.fill();
            } else {
                drawSingleStroke(ctx, currentStroke, 16);
            }
        }
    }

    function drawSingleStroke(targetCtx, stroke, size) {
        const strokePoints = getStrokeOutline(stroke, size);
        if (strokePoints.length === 0) return;
        targetCtx.beginPath();
        targetCtx.moveTo(strokePoints[0].x, strokePoints[0].y);
        for (let i = 1; i < strokePoints.length; i++) targetCtx.lineTo(strokePoints[i].x, strokePoints[i].y);
        targetCtx.closePath();
        targetCtx.fill();
    }

    clearBtn.addEventListener('click', () => {
        fontDatabase[alphabet[currentIndex]] = [];
        currentStroke = [];
        drawAll();
        renderLivePreview();
    });

    nextBtn.addEventListener('click', () => { if (currentIndex < alphabet.length - 1) { currentIndex++; updateUI(); } });
    backBtn.addEventListener('click', () => { if (currentIndex > 0) { currentIndex--; updateUI(); } });

    btnGlobalReset.addEventListener('click', () => {
        if (confirm("Permanently drop all drawn data matrices and start over from 'A'?")) {
            resetDatabase();
            currentStroke = [];
            currentIndex = 0;
            updateUI();
            renderLivePreview();
        }
    });

    function updateUI() {
        const targetChar = alphabet[currentIndex] || 'A';
        currentCharLabel.innerText = targetChar;
        ghostLetter.innerText = targetChar;
        ghostLetter.style.display = toggleGhost.checked ? "flex" : "none";
        
        backBtn.disabled = (currentIndex === 0);
        nextBtn.disabled = (currentIndex === alphabet.length - 1);
        nextBtn.innerText = (currentIndex === alphabet.length - 1) ? "Done" : "Next / Skip →";
        drawAll();
    }

    // --- Dynamic Live Preview Engine ---
    function renderLivePreview() {
        const textToRender = liveTesterInput.value;
        
        let globalMinY = Infinity;
        let globalMaxY = -Infinity;
        let fontHasAnyDrawings = false;

        alphabet.forEach(char => {
            const strokes = fontDatabase[char];
            if (strokes && strokes.length > 0) {
                strokes.forEach(stroke => {
                    fontHasAnyDrawings = true;
                    if (isDot(stroke)) {
                        const pt = stroke[0];
                        if (pt.y - 9 < globalMinY) globalMinY = pt.y - 9;
                        if (pt.y + 9 > globalMaxY) globalMaxY = pt.y + 9;
                    } else {
                        const strokePoints = getStrokeOutline(stroke, 18);
                        strokePoints.forEach(pt => {
                            if (pt.y < globalMinY) globalMinY = pt.y;
                            if (pt.y > globalMaxY) globalMaxY = pt.y;
                        });
                    }
                });
            }
        });

        if (!fontHasAnyDrawings || globalMaxY <= globalMinY) {
            globalMinY = 50;
            globalMaxY = 350;
        }

        const globalDrawHeight = globalMaxY - globalMinY;
        
        const rowHeight = 36; 
        const renderScale = 22 / (globalDrawHeight || 1); 
        const activeFontScale = 1180 / globalDrawHeight;
        
        const proportionalSidebearing = 60 * (renderScale / activeFontScale);
        const antiJumbleOffset = 2.5; 
        const spaceCharacterWidth = 10; 
        
        pCtx.font = `bold ${Math.floor(rowHeight * 0.65)}px sans-serif`;

        let testX = 8;
        let estimatedRows = 1;
        
        for (let i = 0; i < textToRender.length; i++) {
            const char = textToRender[i];
            if (char === " ") {
                testX += spaceCharacterWidth;
                if (testX > previewCanvas.width - 24) { testX = 8; estimatedRows++; }
                continue;
            }
            
            const strokes = fontDatabase[char];
            let charWidth = 12; 
            
            if (strokes && strokes.length > 0) {
                let minX = Infinity, maxX = -Infinity;
                strokes.forEach(s => {
                    s.forEach(pt => {
                        if (pt.x < minX) minX = pt.x;
                        if (pt.x > maxX) maxX = pt.x;
                    });
                });
                
                const finalFontWidth = (maxX - minX) * renderScale;
                charWidth = finalFontWidth + proportionalSidebearing + antiJumbleOffset;
                if (charWidth < 10) charWidth = 10;
            } else {
                charWidth = pCtx.measureText(char).width;
            }

            if (testX + charWidth > previewCanvas.width - 16) { testX = 8; estimatedRows++; }
            testX += charWidth;
        }

        const calculatedHeight = Math.max(90, estimatedRows * rowHeight + 20);
        previewCanvas.height = calculatedHeight;

        pCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        
        let currentXOffset = 8;
        let currentYOffset = 10; 
        
        for (let i = 0; i < textToRender.length; i++) {
            const char = textToRender[i];
            
            if (char === " ") { 
                currentXOffset += spaceCharacterWidth; 
                if (currentXOffset > previewCanvas.width - 24) {
                    currentXOffset = 8;
                    currentYOffset += rowHeight;
                }
                continue; 
            }
            
            const strokes = fontDatabase[char];
            let minX = 0, maxX = 0;
            let hasStrokes = false;

            if (strokes && strokes.length > 0) {
                let sMinX = Infinity, sMaxX = -Infinity;
                strokes.forEach(s => {
                    hasStrokes = true;
                    s.forEach(pt => {
                        if (pt.x < sMinX) sMinX = pt.x;
                        if (pt.x > sMaxX) sMaxX = pt.x;
                    });
                });
                minX = sMinX;
                maxX = sMaxX;
            }
            
            const drawWidth = maxX - minX;
            const pixelSidebearing = 30 * (renderScale / activeFontScale);
            
            pCtx.font = `bold ${Math.floor(rowHeight * 0.65)}px sans-serif`;
            let charWidth = 12;
            
            if (hasStrokes) {
                const finalFontWidth = drawWidth * renderScale;
                charWidth = finalFontWidth + proportionalSidebearing + antiJumbleOffset;
                if (charWidth < 10) charWidth = 10;
            } else {
                charWidth = pCtx.measureText(char).width;
            }
            
            if (currentXOffset + charWidth > previewCanvas.width - 16) {
                currentXOffset = 8;        
                currentYOffset += rowHeight; 
            }
            
            pCtx.save();
            
            if (hasStrokes) {
                pCtx.fillStyle = "#000000";
                pCtx.translate(currentXOffset + pixelSidebearing + (antiJumbleOffset / 2), currentYOffset + 6);
                strokes.forEach(stroke => {
                    const transformStroke = stroke.map(pt => ({
                        x: (pt.x - minX) * renderScale,
                        y: (pt.y - globalMinY) * renderScale
                    }));

                    if (isDot(stroke)) {
                        pCtx.beginPath();
                        pCtx.arc(transformStroke[0].x, transformStroke[0].y, 16 * renderScale * 0.5, 0, Math.PI * 2);
                        pCtx.fill();
                    } else {
                        drawSingleStroke(pCtx, transformStroke, 16 * renderScale);
                    }
                });
            } else {
                pCtx.fillStyle = "#cbd5e1";
                pCtx.translate(currentXOffset, currentYOffset + 4);
                pCtx.fillText(char, 0, rowHeight * 0.55);
            }
            pCtx.restore();
            
            currentXOffset += charWidth; 
        }
    }

    // --- Interactive Listener Setup ---
    btnUpper.addEventListener('click', () => stageSubsetChange('upper'));
    btnLower.addEventListener('click', () => stageSubsetChange('lower'));
    btnNumbers.addEventListener('click', () => stageSubsetChange('numbers'));
    btnSymbols.addEventListener('click', () => stageSubsetChange('symbols')); 
    toggleGhost.addEventListener('change', updateUI);
    liveTesterInput.addEventListener('input', renderLivePreview);

    rebuildAlphabetSequence();
    checkOnboarding();
    renderLivePreview();

    // --- OpenType Compilation Exporter ---
    downloadBtn.addEventListener('click', () => {
        const notdefGlyph = new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 500, path: new opentype.Path() });
        const fontGlyphs = [notdefGlyph];

        let globalMinY = Infinity;
        let globalMaxY = -Infinity;
        let fontHasAnyDrawings = false;

        alphabet.forEach(char => {
            const strokes = fontDatabase[char];
            if (strokes && strokes.length > 0) {
                strokes.forEach(stroke => {
                    fontHasAnyDrawings = true;
                    if (isDot(stroke)) {
                        const pt = stroke[0];
                        if (pt.y - 9 < globalMinY) globalMinY = pt.y - 9;
                        if (pt.y + 9 > globalMaxY) globalMaxY = pt.y + 9;
                    } else {
                        const strokePoints = getStrokeOutline(stroke, 18);
                        strokePoints.forEach(pt => {
                            if (pt.y < globalMinY) globalMinY = pt.y;
                            if (pt.y > globalMaxY) globalMaxY = pt.y;
                        });
                    }
                });
            }
        });

        if (!fontHasAnyDrawings || globalMaxY <= globalMinY) {
            globalMinY = 50;
            globalMaxY = 350;
        }

        const globalDrawHeight = globalMaxY - globalMinY;
        const fontScaleFactor = 1180 / globalDrawHeight;

        alphabet.forEach(char => {
            const strokes = fontDatabase[char];
            const glyphPath = new opentype.Path();
            
            let minX = Infinity, maxX = -Infinity;
            let hasStrokes = false;

            if (strokes && strokes.length > 0) {
                strokes.forEach(stroke => {
                    hasStrokes = true;
                    if (isDot(stroke)) {
                        const pt = stroke[0];
                        if (pt.x - 9 < minX) minX = pt.x - 9;
                        if (pt.x + 9 > maxX) maxX = pt.x + 9;
                    } else {
                        const strokePoints = getStrokeOutline(stroke, 18);
                        if (strokePoints.length === 0) return;
                        strokePoints.forEach(pt => {
                            if (pt.x < minX) minX = pt.x;
                            if (pt.x > maxX) maxX = pt.x;
                        });
                    }
                });
            }

            if (hasStrokes) {
                const drawWidth = maxX - minX;

                const transformPoint = (x, y) => {
                    const localX = (x - minX) * fontScaleFactor;
                    const localY = (globalMaxY - y) * fontScaleFactor;
                    
                    return {
                        x: localX + 30,              
                        y: localY - 240              
                    };
                };

                strokes.forEach(stroke => {
                    if (isDot(stroke)) {
                        const center = stroke[0];
                        const r = 9; 
                        
                        const p1 = transformPoint(center.x - r, center.y - r);
                        const p2 = transformPoint(center.x + r, center.y - r);
                        const p3 = transformPoint(center.x + r, center.y + r);
                        const p4 = transformPoint(center.x - r, center.y + r);

                        glyphPath.moveTo(p1.x, p1.y);
                        glyphPath.lineTo(p2.x, p2.y);
                        glyphPath.lineTo(p3.x, p3.y);
                        glyphPath.lineTo(p4.x, p4.y);
                        glyphPath.close();
                    } else {
                        const strokePoints = getStrokeOutline(stroke, 18);
                        if (strokePoints.length === 0) return;

                        const startPt = transformPoint(strokePoints[0].x, strokePoints[0].y);
                        glyphPath.moveTo(startPt.x, startPt.y);
                        for (let i = 1; i < strokePoints.length; i++) {
                            const pt = transformPoint(strokePoints[i].x, strokePoints[i].y);
                            glyphPath.lineTo(pt.x, pt.y);
                        }
                        glyphPath.close();
                    }
                });

                const finalFontWidth = drawWidth * fontScaleFactor;
                let calculatedAdvance = Math.ceil(finalFontWidth + 60); 
                if (calculatedAdvance < 180) calculatedAdvance = 180; 

                const glyph = new opentype.Glyph({
                    name: char,
                    unicode: char.charCodeAt(0),
                    advanceWidth: calculatedAdvance,
                    path: glyphPath
                });
                fontGlyphs.push(glyph);

            } else {
                const glyph = new opentype.Glyph({
                    name: char,
                    unicode: char.charCodeAt(0),
                    advanceWidth: 300,
                    path: glyphPath
                });
                fontGlyphs.push(glyph);
            }
        });

        const font = new opentype.Font({
            familyName: 'CustomDashboardFont',
            styleName: 'Regular',
            unitsPerEm: 1000,
            ascender: 940,
            descender: -60,
            glyphs: fontGlyphs
        });

        const buffer = font.toArrayBuffer();
        const blob = new Blob([buffer], { type: 'font/opentype' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'MyHandwriting.otf';
        link.click();
    });
};

function resizeCanvas() {
    const canvas = document.getElementById("paintCanvas");
    const size = canvas.clientWidth;

    canvas.width = size;
    canvas.height = size;

    // redraw existing strokes if necessary
}

//window.addEventListener("resize", resizeCanvas);
resizeCanvas();
