/**
 * Markup Viewer - Standalone window for screenshot annotation
 */

// Get markup ID from URL
const urlParams = new URLSearchParams(window.location.search);
const markupId = urlParams.get('id');

// Markup state
let markupFabricCanvas = null;
let currentTool = 'select';
let currentColor = '#ff0000';
let currentLetter = 'A';
let currentLetterSize = 40;
let isDrawing = false;
let startPoint = null;
let currentDrawingObject = null;
let lastPlacedObject = null; // Track the last placed object for color changes
let screenshotDataUrl = null;
let markupData = null;

// DOM elements
const markupCanvas = document.getElementById('markupCanvas');
const closeBtn = document.getElementById('closeBtn');
const copyMarkupBtn = document.getElementById('copyMarkupBtn');

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    // Load screenshot and markup data from storage
    loadMarkupData();
    
    // Setup event listeners
    setupEventListeners();
    
    // Initialize Fabric.js canvas
    initializeMarkupCanvas();
});

// Load screenshot and markup data from storage
function loadMarkupData() {
    if (!markupId) {
        console.error('[Markup Viewer] No markup ID provided');
        return;
    }
    
    chrome.storage.local.get([`markup_${markupId}_screenshot`, `markup_${markupId}_data`], (result) => {
        screenshotDataUrl = result[`markup_${markupId}_screenshot`];
        markupData = result[`markup_${markupId}_data`] || null;
        
        if (!screenshotDataUrl) {
            console.error('[Markup Viewer] No screenshot data found');
            alert('No screenshot data available');
            return;
        }
        
        // Initialize canvas after data is loaded
        if (markupFabricCanvas) {
            loadScreenshotToCanvas();
        }
    });
}

// Setup event listeners
function setupEventListeners() {
    // Close button
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            window.close();
        });
    }
    
    // Copy button
    if (copyMarkupBtn) {
        copyMarkupBtn.addEventListener('click', copyMarkupToClipboard);
    }
    
    // Undo/Redo/Clear buttons
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    const clearAllBtn = document.getElementById('clearAllBtn');
    
    if (undoBtn) {
        undoBtn.addEventListener('click', () => {
            // If there's a last placed object, remove it directly for immediate undo
            if (lastPlacedObject && markupFabricCanvas) {
                const objects = markupFabricCanvas.getObjects();
                if (objects.includes(lastPlacedObject)) {
                    markupFabricCanvas.remove(lastPlacedObject);
                    lastPlacedObject = null;
                    markupFabricCanvas.renderAll();
                    setTimeout(() => {
                        saveState();
                        saveMarkupData();
                    }, 50);
                    return;
                }
            }
            undo();
        });
    }
    
    if (redoBtn) {
        redoBtn.addEventListener('click', () => {
            redo();
        });
    }
    
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', () => {
            if (confirm('Clear all markup? This cannot be undone.')) {
                clearAll();
            }
        });
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // ESC: Cancel current drawing action
        if (e.key === 'Escape') {
            cancelDrawing();
            e.preventDefault();
            return;
        }
        
        // Undo: Ctrl+Z or Cmd+Z
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            // If there's a last placed object, remove it directly for immediate undo
            if (lastPlacedObject && markupFabricCanvas) {
                const objects = markupFabricCanvas.getObjects();
                if (objects.includes(lastPlacedObject)) {
                    markupFabricCanvas.remove(lastPlacedObject);
                    lastPlacedObject = null;
                    markupFabricCanvas.renderAll();
                    setTimeout(() => {
                        saveState();
                        saveMarkupData();
                    }, 50);
                    return;
                }
            }
            undo();
        }
        
        // Redo: Ctrl+Y, Ctrl+Shift+Z, or Cmd+Shift+Z
        if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault();
            redo();
        }
        
        // Delete: Delete or Backspace key (only when select tool is active)
        if (currentTool === 'select' && (e.key === 'Delete' || e.key === 'Backspace')) {
            e.preventDefault();
            deleteSelected();
        }
    });
}

// Initialize Fabric.js canvas
function initializeMarkupCanvas() {
    if (!markupCanvas || typeof fabric === 'undefined') {
        console.error('[Markup Viewer] Fabric.js not loaded or canvas not found');
        // Retry after a short delay
        setTimeout(initializeMarkupCanvas, 100);
        return;
    }
    
    markupFabricCanvas = new fabric.Canvas('markupCanvas', {
        selection: true,
        preserveObjectStacking: true,
        defaultCursor: 'default',
        hoverCursor: 'move',
        stateful: true // Enable state management for undo/redo
    });
    
    // Initialize history for undo/redo
    markupFabricCanvas.historyUndo = [];
    markupFabricCanvas.historyRedo = [];
    
    // Load screenshot if data is available
    if (screenshotDataUrl) {
        loadScreenshotToCanvas();
    }
    
    // Initialize tools
    initializeMarkupTools();
    
    // Setup canvas event handlers
    setupCanvasHandlers();
    
    // Update button states (will be updated after screenshot loads)
    updateHistoryButtons();
    
    // Note: Initial state will be saved after screenshot loads in loadScreenshotToCanvas()
}

// Load screenshot to canvas
function loadScreenshotToCanvas() {
    if (!markupFabricCanvas || !screenshotDataUrl) return;
    
    // Clear existing objects
    markupFabricCanvas.clear();
    
    fabric.Image.fromURL(screenshotDataUrl, (img) => {
        // Use actual image dimensions for canvas
        const canvasWidth = img.width;
        const canvasHeight = img.height;
        
        markupFabricCanvas.setWidth(canvasWidth);
        markupFabricCanvas.setHeight(canvasHeight);
        markupFabricCanvas.setBackgroundImage(img, () => {
            markupFabricCanvas.renderAll();
            
            // Resize window to fit screenshot (with padding for toolbar/footer)
            resizeWindowToFitCanvas(canvasWidth, canvasHeight);
            
            // Load markup data if exists
            if (markupData) {
                setTimeout(() => {
                    loadMarkupDataObjects();
                    // Save state after loading markup
                    setTimeout(() => {
                        saveState();
                        updateHistoryButtons();
                    }, 200);
                }, 100);
            } else {
                // Save initial state (empty canvas with screenshot)
                setTimeout(() => {
                    saveState();
                    updateHistoryButtons();
                }, 100);
            }
        });
    });
}

// Resize window to fit canvas
function resizeWindowToFitCanvas(canvasWidth, canvasHeight) {
    // Get screen dimensions
    chrome.windows.getCurrent((window) => {
        if (chrome.runtime.lastError) return;
        
        // Calculate window size: screenshot + toolbar + footer + padding
        const toolbarHeight = 60; // Approximate toolbar height
        const footerHeight = 60; // Approximate footer height
        const padding = 40; // Padding around canvas
        
        const windowWidth = Math.min(canvasWidth + padding, screen.width * 0.9);
        const windowHeight = Math.min(canvasHeight + toolbarHeight + footerHeight + padding, screen.height * 0.9);
        
        // Center window
        const left = Math.max(0, (screen.width - windowWidth) / 2);
        const top = Math.max(0, (screen.height - windowHeight) / 2);
        
        chrome.windows.update(window.id, {
            width: Math.round(windowWidth),
            height: Math.round(windowHeight),
            left: Math.round(left),
            top: Math.round(top)
        });
    });
}

// Initialize markup tools
function initializeMarkupTools() {
    // Tool buttons
    const toolSelect = document.getElementById('toolSelect');
    const toolHighlighter = document.getElementById('toolHighlighter');
    const toolArrow = document.getElementById('toolArrow');
    const toolRectangle = document.getElementById('toolRectangle');
    const toolCircle = document.getElementById('toolCircle');
    const toolLetter = document.getElementById('toolLetter');
    
    // Color swatches
    const colorSwatches = document.querySelectorAll('.color-swatch');
    
    // Layer controls
    const layerUp = document.getElementById('layerUp');
    const layerDown = document.getElementById('layerDown');
    
    // Letter controls
    const letterSelect = document.getElementById('letterSelect');
    const letterSize = document.getElementById('letterSize');
    const letterSizeValue = document.getElementById('letterSizeValue');
    const letterControls = document.getElementById('letterControls');
    
    // Tool selection
    [toolSelect, toolHighlighter, toolArrow, toolRectangle, toolCircle, toolLetter].forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentTool = btn.id.replace('tool', '').toLowerCase();
                
                // Show/hide letter controls
                if (currentTool === 'letter') {
                    letterControls.style.display = 'flex';
                } else {
                    letterControls.style.display = 'none';
                }
                
                // When select tool is active, ensure selection is enabled
                if (currentTool === 'select' && markupFabricCanvas) {
                    markupFabricCanvas.selection = true;
                    markupFabricCanvas.defaultCursor = 'default';
                    markupFabricCanvas.hoverCursor = 'move';
                    // Make all objects selectable
                    markupFabricCanvas.getObjects().forEach(obj => {
                        obj.selectable = true;
                        obj.evented = true;
                    });
                    markupFabricCanvas.renderAll();
                } else if (markupFabricCanvas) {
                    // When drawing tool is active, disable selection
                    markupFabricCanvas.selection = false;
                    // Make all objects non-selectable
                    markupFabricCanvas.getObjects().forEach(obj => {
                        obj.selectable = false;
                        obj.evented = false;
                    });
                    // Deselect any selected objects
                    markupFabricCanvas.discardActiveObject();
                    markupFabricCanvas.renderAll();
                }
            });
        }
    });
    
    // Color selection
    colorSwatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            const newColor = swatch.getAttribute('data-color');
            currentColor = newColor;
            
            // Update selected object if one is selected
            if (markupFabricCanvas) {
                const activeObject = markupFabricCanvas.getActiveObject();
                if (activeObject) {
                    updateObjectColor(activeObject, newColor);
                    markupFabricCanvas.renderAll();
                    setTimeout(() => {
                        saveState();
                        saveMarkupData();
                    }, 50);
                    return;
                }
            }
            
            // Update last placed object if no selection
            if (lastPlacedObject && markupFabricCanvas) {
                // Check if object still exists on canvas
                const objects = markupFabricCanvas.getObjects();
                if (objects.includes(lastPlacedObject)) {
                    updateObjectColor(lastPlacedObject, newColor);
                    markupFabricCanvas.renderAll();
                    setTimeout(() => {
                        saveState();
                        saveMarkupData();
                    }, 50);
                } else {
                    lastPlacedObject = null; // Object was removed
                }
            }
        });
    });
    
    // Letter selection
    if (letterSelect) {
        letterSelect.addEventListener('change', (e) => {
            currentLetter = e.target.value;
        });
    }
    
    // Letter size
    if (letterSize && letterSizeValue) {
        letterSize.addEventListener('input', (e) => {
            currentLetterSize = parseInt(e.target.value);
            letterSizeValue.textContent = currentLetterSize;
        });
    }
    
    // Layer controls
    if (layerUp) {
        layerUp.addEventListener('click', () => {
            const activeObject = markupFabricCanvas.getActiveObject();
            if (activeObject) {
                activeObject.bringToFront();
                markupFabricCanvas.renderAll();
                // State will be saved by debounced saveState handler
            }
        });
    }
    
    if (layerDown) {
        layerDown.addEventListener('click', () => {
            const activeObject = markupFabricCanvas.getActiveObject();
            if (activeObject) {
                activeObject.sendToBack();
                markupFabricCanvas.renderAll();
                // State will be saved by debounced saveState handler
            }
        });
    }
}

// Setup canvas event handlers
function setupCanvasHandlers() {
    if (!markupFabricCanvas) return;
    
    // Save state on canvas changes (with debounce to avoid too many states)
    let saveStateTimeout = null;
    let isSavingState = false;
    
    const debouncedSaveState = () => {
        if (isSavingState) return; // Prevent recursive saves
        clearTimeout(saveStateTimeout);
        saveStateTimeout = setTimeout(() => {
            isSavingState = true;
            saveState();
            saveMarkupData();
            isSavingState = false;
        }, 300); // Debounce time
    };
    
    // Only save state for final objects, not preview objects
    markupFabricCanvas.on('path:created', (e) => {
        // Only save if not a preview (preview objects are removed/re-added)
        if (e.path && e.path !== currentDrawingObject) {
            debouncedSaveState();
        }
    });
    
    markupFabricCanvas.on('object:added', (e) => {
        // Only save if not a preview object
        if (e.target && e.target !== currentDrawingObject) {
            debouncedSaveState();
        }
    });
    
    markupFabricCanvas.on('object:modified', debouncedSaveState);
    markupFabricCanvas.on('object:removed', debouncedSaveState);
    
    // Prevent context menu on canvas when drawing
    markupCanvas.addEventListener('contextmenu', (e) => {
        if (isDrawing || currentDrawingObject) {
            e.preventDefault();
            cancelDrawing();
        }
    });
    
    // Mouse down - start drawing (only if not in select mode)
    markupFabricCanvas.on('mouse:down', (options) => {
        // Right-click cancels drawing
        if (options.e.button === 2) { // Right mouse button
            if (isDrawing || currentDrawingObject) {
                cancelDrawing();
                options.e.preventDefault();
                return;
            }
        }
        
        // If select tool is active, let Fabric.js handle selection naturally
        if (currentTool === 'select') {
            return;
        }
        
        // Clear last placed object when starting a new drawing
        lastPlacedObject = null;
        
        if (currentTool === 'highlighter' || currentTool === 'rectangle' || currentTool === 'circle' || currentTool === 'arrow') {
            isDrawing = true;
            const pointer = markupFabricCanvas.getPointer(options.e);
            startPoint = pointer;
        } else if (currentTool === 'letter') {
            const pointer = markupFabricCanvas.getPointer(options.e);
            createLetter(pointer.x, pointer.y);
        }
    });
    
    // Mouse move - update drawing
    markupFabricCanvas.on('mouse:move', (options) => {
        if (!isDrawing || !startPoint) return;
        
        const pointer = markupFabricCanvas.getPointer(options.e);
        
        if (currentTool === 'highlighter') {
            updateHighlighter(startPoint, pointer);
        } else if (currentTool === 'rectangle') {
            updateRectangle(startPoint, pointer);
        } else if (currentTool === 'circle') {
            updateCircle(startPoint, pointer);
        } else if (currentTool === 'arrow') {
            updateArrow(startPoint, pointer);
        }
    });
    
    // Mouse up - finish drawing
    markupFabricCanvas.on('mouse:up', () => {
        if (isDrawing && currentDrawingObject) {
            // Finalize the current drawing object (make it permanent and non-selectable until select tool)
            currentDrawingObject.selectable = false;
            currentDrawingObject.evented = false;
            // Set as last placed object for color changes
            lastPlacedObject = currentDrawingObject;
            // Clear the reference
            currentDrawingObject = null;
            isDrawing = false;
            startPoint = null;
            // Save state after finalizing (only save the finalized object, not preview)
            setTimeout(() => {
                saveState();
                saveMarkupData();
            }, 50);
        }
    });
}

// Highlighter tool
function updateHighlighter(start, end) {
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    
    if (width > 0 && height > 0) {
        // Remove previous preview if exists
        if (currentDrawingObject) {
            markupFabricCanvas.remove(currentDrawingObject);
        }
        
        // Create new preview object (non-selectable during drawing)
        currentDrawingObject = new fabric.Rect({
            left: left,
            top: top,
            width: width,
            height: height,
            fill: currentColor,
            opacity: 0.3,
            selectable: false,
            evented: false,
            strokeWidth: 0
        });
        
        markupFabricCanvas.add(currentDrawingObject);
        markupFabricCanvas.renderAll();
    }
}

// Rectangle tool
function updateRectangle(start, end) {
    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    
    if (width > 0 && height > 0) {
        // Remove previous preview if exists
        if (currentDrawingObject) {
            markupFabricCanvas.remove(currentDrawingObject);
        }
        
        // Create new preview object (non-selectable during drawing)
        currentDrawingObject = new fabric.Rect({
            left: left,
            top: top,
            width: width,
            height: height,
            fill: 'transparent',
            stroke: currentColor,
            strokeWidth: 2,
            selectable: false,
            evented: false
        });
        
        markupFabricCanvas.add(currentDrawingObject);
        markupFabricCanvas.renderAll();
    }
}

// Circle tool
function updateCircle(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const radius = Math.sqrt(dx * dx + dy * dy) / 2;
    
    if (radius > 0) {
        // Remove previous preview if exists
        if (currentDrawingObject) {
            markupFabricCanvas.remove(currentDrawingObject);
        }
        
        // Create new preview object (non-selectable during drawing)
        currentDrawingObject = new fabric.Circle({
            left: start.x,
            top: start.y,
            radius: radius,
            fill: 'transparent',
            stroke: currentColor,
            strokeWidth: 2,
            selectable: false,
            evented: false,
            originX: 'center',
            originY: 'center'
        });
        
        markupFabricCanvas.add(currentDrawingObject);
        markupFabricCanvas.renderAll();
    }
}

// Arrow tool
function updateArrow(start, end) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length > 5) {
        // Remove previous preview if exists
        if (currentDrawingObject) {
            markupFabricCanvas.remove(currentDrawingObject);
        }
        
        // Create arrow path
        const angle = Math.atan2(dy, dx);
        const arrowLength = 15;
        
        const arrowHeadX = end.x;
        const arrowHeadY = end.y;
        
        const arrowPoint1X = arrowHeadX - arrowLength * Math.cos(angle - Math.PI / 6);
        const arrowPoint1Y = arrowHeadY - arrowLength * Math.sin(angle - Math.PI / 6);
        
        const arrowPoint2X = arrowHeadX - arrowLength * Math.cos(angle + Math.PI / 6);
        const arrowPoint2Y = arrowHeadY - arrowLength * Math.sin(angle + Math.PI / 6);
        
        const pathData = `M ${start.x} ${start.y} L ${end.x} ${end.y} M ${arrowPoint1X} ${arrowPoint1Y} L ${arrowHeadX} ${arrowHeadY} L ${arrowPoint2X} ${arrowPoint2Y}`;
        
        // Create new preview object (non-selectable during drawing)
        currentDrawingObject = new fabric.Path(pathData, {
            stroke: currentColor,
            strokeWidth: 2,
            fill: '',
            selectable: false,
            evented: false
        });
        
        markupFabricCanvas.add(currentDrawingObject);
        markupFabricCanvas.renderAll();
    }
}

// Letter tool
function createLetter(x, y) {
    const text = new fabric.Text(currentLetter, {
        left: x,
        top: y,
        fontSize: currentLetterSize,
        fill: currentColor,
        selectable: false, // Non-selectable until select tool is active
        evented: false,
        originX: 'center',
        originY: 'center'
    });
    
    markupFabricCanvas.add(text);
    // Set as last placed object for color changes
    lastPlacedObject = text;
    markupFabricCanvas.renderAll();
    // Save state after adding letter
    setTimeout(() => {
        saveState();
        saveMarkupData();
    }, 50);
}

// Save markup data to storage
function saveMarkupData() {
    if (!markupFabricCanvas || !markupId) return;
    
    // Save canvas state (excludes background image data)
    const json = markupFabricCanvas.toJSON(['data']);
    if (json.objects) {
        const markupDataString = JSON.stringify(json);
        
        // Save to storage
        chrome.storage.local.set({
            [`markup_${markupId}_data`]: markupDataString
        });
    }
}

// Load markup data objects
function loadMarkupDataObjects() {
    if (!markupFabricCanvas || !markupData) return;
    
    try {
        const jsonData = JSON.parse(markupData);
        // Load objects (background will be preserved from loadScreenshotToCanvas)
        if (jsonData.objects && jsonData.objects.length > 0) {
            fabric.util.enlivenObjects(jsonData.objects, (objects) => {
                objects.forEach(obj => {
                    // Set selectability based on current tool
                    obj.selectable = (currentTool === 'select');
                    obj.evented = (currentTool === 'select');
                    markupFabricCanvas.add(obj);
                });
                markupFabricCanvas.renderAll();
            });
        }
    } catch (err) {
        console.error('[Markup Viewer] Error loading markup data:', err);
        markupData = null;
    }
}

// Save state for undo/redo
function saveState() {
    if (!markupFabricCanvas) return;
    
    // Save canvas state (objects only, background is preserved separately)
    const json = markupFabricCanvas.toJSON(['data']);
    const state = JSON.stringify(json);
    
    // Don't save if state is the same as last saved state (avoid duplicates)
    if (markupFabricCanvas.historyUndo.length > 0) {
        const lastState = markupFabricCanvas.historyUndo[markupFabricCanvas.historyUndo.length - 1];
        if (lastState === state) {
            return; // Skip duplicate state
        }
    }
    
    markupFabricCanvas.historyUndo.push(state);
    
    // Limit history size
    if (markupFabricCanvas.historyUndo.length > 50) {
        markupFabricCanvas.historyUndo.shift();
    }
    
    // Clear redo history when new action is performed
    markupFabricCanvas.historyRedo = [];
    
    updateHistoryButtons();
}

// Undo function
function undo() {
    if (!markupFabricCanvas || !markupFabricCanvas.historyUndo || markupFabricCanvas.historyUndo.length === 0) {
        return;
    }
    
    // Save current state to redo
    const currentState = JSON.stringify(markupFabricCanvas.toJSON(['data']));
    markupFabricCanvas.historyRedo.push(currentState);
    
    // Restore previous state (preserve background image)
    const previousState = markupFabricCanvas.historyUndo.pop();
    const previousJson = JSON.parse(previousState);
    
    // Clear canvas objects but keep background
    const objects = markupFabricCanvas.getObjects();
    objects.forEach(obj => {
        markupFabricCanvas.remove(obj);
    });
    
    // Load previous objects
    if (previousJson.objects && previousJson.objects.length > 0) {
        fabric.util.enlivenObjects(previousJson.objects, (objects) => {
            objects.forEach(obj => {
                // Set selectability based on current tool
                obj.selectable = (currentTool === 'select');
                obj.evented = (currentTool === 'select');
                markupFabricCanvas.add(obj);
            });
            markupFabricCanvas.renderAll();
            updateHistoryButtons();
            saveMarkupData();
        });
    } else {
        markupFabricCanvas.renderAll();
        updateHistoryButtons();
        saveMarkupData();
    }
}

// Redo function
function redo() {
    if (!markupFabricCanvas || !markupFabricCanvas.historyRedo || markupFabricCanvas.historyRedo.length === 0) {
        return;
    }
    
    // Save current state to undo
    const currentState = JSON.stringify(markupFabricCanvas.toJSON(['data']));
    markupFabricCanvas.historyUndo.push(currentState);
    
    // Restore next state (preserve background image)
    const nextState = markupFabricCanvas.historyRedo.pop();
    const nextJson = JSON.parse(nextState);
    
    // Clear canvas objects but keep background
    const objects = markupFabricCanvas.getObjects();
    objects.forEach(obj => {
        markupFabricCanvas.remove(obj);
    });
    
    // Load next objects
    if (nextJson.objects && nextJson.objects.length > 0) {
        fabric.util.enlivenObjects(nextJson.objects, (objects) => {
            objects.forEach(obj => {
                // Set selectability based on current tool
                obj.selectable = (currentTool === 'select');
                obj.evented = (currentTool === 'select');
                markupFabricCanvas.add(obj);
            });
            // Clear lastPlacedObject after redo (can't reliably track it)
            lastPlacedObject = null;
            markupFabricCanvas.renderAll();
            updateHistoryButtons();
            saveMarkupData();
        });
    } else {
        // Clear lastPlacedObject if no objects
        lastPlacedObject = null;
        markupFabricCanvas.renderAll();
        updateHistoryButtons();
        saveMarkupData();
    }
}

// Update undo/redo button states
function updateHistoryButtons() {
    const undoBtn = document.getElementById('undoBtn');
    const redoBtn = document.getElementById('redoBtn');
    
    if (undoBtn) {
        undoBtn.disabled = !markupFabricCanvas || !markupFabricCanvas.historyUndo || markupFabricCanvas.historyUndo.length === 0;
    }
    
    if (redoBtn) {
        redoBtn.disabled = !markupFabricCanvas || !markupFabricCanvas.historyRedo || markupFabricCanvas.historyRedo.length === 0;
    }
}

// Delete selected objects
function deleteSelected() {
    if (!markupFabricCanvas) return;
    
    const activeObjects = markupFabricCanvas.getActiveObjects();
    
    if (activeObjects && activeObjects.length > 0) {
        activeObjects.forEach(obj => {
            // Clear lastPlacedObject if it's being deleted
            if (obj === lastPlacedObject) {
                lastPlacedObject = null;
            }
            markupFabricCanvas.remove(obj);
        });
        markupFabricCanvas.discardActiveObject();
        markupFabricCanvas.renderAll();
        setTimeout(() => {
            saveState();
            saveMarkupData();
        }, 50);
    } else {
        const activeObject = markupFabricCanvas.getActiveObject();
        if (activeObject) {
            // Clear lastPlacedObject if it's being deleted
            if (activeObject === lastPlacedObject) {
                lastPlacedObject = null;
            }
            markupFabricCanvas.remove(activeObject);
            markupFabricCanvas.renderAll();
            setTimeout(() => {
                saveState();
                saveMarkupData();
            }, 50);
        }
    }
}

// Clear all markup objects
function clearAll() {
    if (!markupFabricCanvas) return;
    
    // Remove all objects except background
    const objects = markupFabricCanvas.getObjects();
    objects.forEach(obj => {
        markupFabricCanvas.remove(obj);
    });
    
    // Clear last placed object reference
    lastPlacedObject = null;
    
    markupFabricCanvas.discardActiveObject();
    markupFabricCanvas.renderAll();
    
    // Save state and markup data
    setTimeout(() => {
        saveState();
        saveMarkupData();
    }, 50);
}

// Cancel current drawing action
function cancelDrawing() {
    if (!markupFabricCanvas) return;
    
    // Remove preview object if exists
    if (currentDrawingObject) {
        markupFabricCanvas.remove(currentDrawingObject);
        currentDrawingObject = null;
        markupFabricCanvas.renderAll();
    }
    
    // Reset drawing state
    isDrawing = false;
    startPoint = null;
}

// Update object color based on object type
function updateObjectColor(obj, color) {
    if (!obj) return;
    
    // Determine object type and update appropriate color property
    if (obj.type === 'text' || obj.type === 'i-text' || obj.type === 'textbox') {
        // Text objects use fill
        obj.set('fill', color);
    } else if (obj.type === 'rect' && obj.opacity === 0.3) {
        // Highlighter rectangles use fill with opacity
        obj.set('fill', color);
    } else if (obj.type === 'rect' || obj.type === 'circle') {
        // Shapes use stroke (and may have transparent fill)
        obj.set('stroke', color);
    } else if (obj.type === 'path' || obj.type === 'line') {
        // Arrows and paths use stroke
        obj.set('stroke', color);
    } else {
        // Default: try both fill and stroke
        if (obj.fill && obj.fill !== 'transparent' && obj.fill !== '') {
            obj.set('fill', color);
        }
        if (obj.stroke && obj.stroke !== 'transparent' && obj.stroke !== '') {
            obj.set('stroke', color);
        }
    }
}

// Copy markup to clipboard
function copyMarkupToClipboard() {
    if (!markupFabricCanvas) {
        alert('Canvas not initialized');
        return;
    }
    
    // Export canvas to data URL
    const dataURL = markupFabricCanvas.toDataURL({
        format: 'png',
        quality: 1.0,
        multiplier: 1
    });
    
    // Convert to blob
    fetch(dataURL)
        .then(res => res.blob())
        .then(blob => {
            const item = new ClipboardItem({ 'image/png': blob });
            return navigator.clipboard.write([item]);
        })
        .then(() => {
            // Show success feedback
            if (copyMarkupBtn) {
                const originalText = copyMarkupBtn.textContent;
                copyMarkupBtn.textContent = 'Copied!';
                copyMarkupBtn.style.background = '#4caf50';
                setTimeout(() => {
                    copyMarkupBtn.textContent = originalText;
                    copyMarkupBtn.style.background = '';
                }, 1500);
            }
        })
        .catch(err => {
            console.error('[Markup Viewer] Failed to copy markup to clipboard:', err);
            alert('Failed to copy markup to clipboard. Please try again.');
        });
}
