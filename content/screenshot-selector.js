/**
 * Screenshot Selection Overlay
 * Injected into page to allow user to select a region for cropping
 */

(function() {
  'use strict';
  
  let isSelecting = false;
  let startX = 0;
  let startY = 0;
  let selectionBox = null;
  let overlay = null;
  
  // Create overlay and selection box
  function createOverlay() {
    // Remove existing overlay if any
    removeOverlay();
    
    overlay = document.createElement('div');
    overlay.id = 'screenshot-selector-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.3);
      cursor: crosshair;
      z-index: 999999;
      user-select: none;
    `;
    
    selectionBox = document.createElement('div');
    selectionBox.id = 'screenshot-selection-box';
    selectionBox.style.cssText = `
      position: absolute;
      border: 2px dashed #0e639c;
      background: rgba(14, 99, 156, 0.1);
      pointer-events: none;
      display: none;
    `;
    
    overlay.appendChild(selectionBox);
    document.body.appendChild(overlay);
    
    // Add instructions
    const instructions = document.createElement('div');
    instructions.id = 'screenshot-instructions';
    instructions.textContent = 'Click and drag to select area. Press ESC to cancel.';
    instructions.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 10px 20px;
      border-radius: 4px;
      font-family: Arial, sans-serif;
      font-size: 14px;
      z-index: 1000000;
      pointer-events: none;
    `;
    document.body.appendChild(instructions);
  }
  
  // Remove overlay
  function removeOverlay() {
    const existingOverlay = document.getElementById('screenshot-selector-overlay');
    const existingInstructions = document.getElementById('screenshot-instructions');
    if (existingOverlay) {
      existingOverlay.remove();
    }
    if (existingInstructions) {
      existingInstructions.remove();
    }
    overlay = null;
    selectionBox = null;
    isSelecting = false;
  }
  
  // Update selection box
  function updateSelectionBox(currentX, currentY, width, height) {
    if (!selectionBox) return;
    
    // Calculate top-left corner
    const left = Math.min(startX, currentX);
    const top = Math.min(startY, currentY);
    
    selectionBox.style.left = left + 'px';
    selectionBox.style.top = top + 'px';
    selectionBox.style.width = Math.abs(width) + 'px';
    selectionBox.style.height = Math.abs(height) + 'px';
    selectionBox.style.display = 'block';
  }
  
  // Get selection coordinates
  // Note: captureVisibleTab captures the viewport, so coordinates should be viewport-relative
  function getSelectionRect() {
    if (!selectionBox || selectionBox.style.display === 'none') {
      return null;
    }
    
    const rect = selectionBox.getBoundingClientRect();
    
    // Return viewport-relative coordinates (not page-relative)
    // captureVisibleTab captures what's visible in the viewport
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height
    };
  }
  
  // Mouse down - start selection
  function handleMouseDown(e) {
    if (e.button !== 0) return; // Only left mouse button
    
    isSelecting = true;
    // Use clientX/Y for viewport-relative coordinates
    startX = e.clientX;
    startY = e.clientY;
    
    e.preventDefault();
    e.stopPropagation();
  }
  
  // Mouse move - update selection
  function handleMouseMove(e) {
    if (!isSelecting) return;
    
    // Use clientX/Y for viewport-relative coordinates
    const currentX = e.clientX;
    const currentY = e.clientY;
    
    const width = currentX - startX;
    const height = currentY - startY;
    
    updateSelectionBox(currentX, currentY, width, height);
    
    e.preventDefault();
    e.stopPropagation();
  }
  
  // Mouse up - finish selection
  function handleMouseUp(e) {
    if (!isSelecting) return;
    
    isSelecting = false;
    
    const selection = getSelectionRect();
    console.log('[Screenshot Selector] Mouse up - Selection rect:', selection);
    
    if (selection && selection.width > 10 && selection.height > 10) {
      // Send selection to content script via postMessage
      console.log('[Screenshot Selector] Sending selection to content script via postMessage:', selection);
      const message = {
        type: 'SCREENSHOT_SELECTION_COMPLETE',
        selection: selection
      };
      console.log('[Screenshot Selector] Posting message:', message);
      window.postMessage(message, '*');
      console.log('[Screenshot Selector] Message posted');
      // Don't remove overlay yet - wait for screenshot to complete
    } else {
      // Selection too small, cancel
      console.log('[Screenshot Selector] Selection too small (' + (selection ? selection.width + 'x' + selection.height : 'null') + '), cancelling');
      removeOverlay();
      window.postMessage({
        type: 'SCREENSHOT_SELECTION_CANCELLED'
      }, '*');
    }
    
    e.preventDefault();
    e.stopPropagation();
  }
  
  // ESC key - cancel selection
  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      removeOverlay();
      window.postMessage({
        type: 'SCREENSHOT_SELECTION_CANCELLED'
      }, '*');
    }
  }
  
  // Listen for start selection message
  window.addEventListener('message', function(event) {
    if (event.source !== window) return;
    
    if (event.data && event.data.type === 'START_SCREENSHOT_SELECTION') {
      createOverlay();
      
      // Add event listeners
      overlay.addEventListener('mousedown', handleMouseDown);
      overlay.addEventListener('mousemove', handleMouseMove);
      overlay.addEventListener('mouseup', handleMouseUp);
      document.addEventListener('keydown', handleKeyDown);
    }
    
    if (event.data && event.data.type === 'STOP_SCREENSHOT_SELECTION') {
      removeOverlay();
      document.removeEventListener('keydown', handleKeyDown);
    }
  });
  
  // Cleanup on page unload
  window.addEventListener('beforeunload', function() {
    removeOverlay();
  });
})();
