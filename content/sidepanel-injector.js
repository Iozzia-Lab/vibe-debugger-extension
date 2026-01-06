/**
 * Side Panel Injector - Injects/removes side panel that resizes viewport
 * The panel pushes page content to the left instead of overlaying
 */

(function() {
  'use strict';
  
  const PANEL_ID = 'network-capture-sidepanel';
  const PANEL_WIDTH = 350; // Default width in pixels (30% narrower than 500px)
  let panelIframe = null;
  let currentPanelWidth = PANEL_WIDTH;
  let styleElement = null;
  
  // Listen for messages to show/hide side panel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TOGGLE_SIDE_PANEL') {
      if (panelIframe && document.getElementById(PANEL_ID)) {
        // Panel exists - remove it
        removeSidePanel();
        sendResponse({ success: true, action: 'removed' });
      } else {
        // Panel doesn't exist - create it
        createSidePanel();
        sendResponse({ success: true, action: 'created' });
      }
      return false;
    }
    
    if (message.type === 'REMOVE_SIDE_PANEL') {
      removeSidePanel();
      sendResponse({ success: true });
      return false;
    }
    
    if (message.type === 'PANEL_RESIZE') {
      if (message.width) {
        resizePanel(message.width);
        sendResponse({ success: true });
      }
      return false;
    }
    
    return false;
  });
  
  function createSidePanel() {
    // Remove existing panel if any
    removeSidePanel();
    
    // Create style element to resize viewport
    styleElement = document.createElement('style');
    styleElement.id = 'network-capture-viewport-style';
    updateViewportStyle(currentPanelWidth);
    document.head.appendChild(styleElement);
    
    // Create container - append to document.documentElement (html) instead of body
    // This ensures it's positioned relative to the actual viewport, not the constrained body
    const container = document.createElement('div');
    container.id = PANEL_ID;
    container.style.cssText = `
      position: fixed !important;
      top: 0 !important;
      right: 0 !important;
      width: ${currentPanelWidth}px !important;
      height: 100vh !important;
      z-index: 2147483647 !important;
      background: #1e1e1e !important;
      box-shadow: -2px 0 10px rgba(0,0,0,0.5) !important;
      display: flex !important;
      flex-direction: column !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: hidden !important;
      pointer-events: auto !important;
    `;
    
    // Create iframe
    panelIframe = document.createElement('iframe');
    panelIframe.src = chrome.runtime.getURL('sidepanel/sidepanel.html');
    panelIframe.style.cssText = `
      width: 100%;
      height: 100%;
      border: none;
      background: #1e1e1e;
    `;
    
    container.appendChild(panelIframe);
    // Append to documentElement (html) instead of body to avoid constraint issues
    document.documentElement.appendChild(container);
    
    // Add resize handle
    const resizeHandle = document.createElement('div');
    resizeHandle.style.cssText = `
      position: absolute;
      left: 0;
      top: 0;
      width: 4px;
      height: 100%;
      cursor: ew-resize;
      background: transparent;
      z-index: 1;
    `;
    
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    
    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = currentPanelWidth;
      e.preventDefault();
      e.stopPropagation();
    });
    
    document.addEventListener('mousemove', (e) => {
      if (isResizing) {
        const diff = startX - e.clientX; // Inverted because we're resizing from right
        const newWidth = Math.max(250, Math.min(900, startWidth + diff)); // Adjusted min/max for narrower default
        resizePanel(newWidth);
      }
    });
    
    document.addEventListener('mouseup', () => {
      isResizing = false;
    });
    
    container.appendChild(resizeHandle);
  }
  
  function resizePanel(newWidth) {
    currentPanelWidth = newWidth;
    const container = document.getElementById(PANEL_ID);
    if (container) {
      container.style.width = newWidth + 'px';
    }
    updateViewportStyle(newWidth);
    
    // Notify iframe if needed (for internal updates)
    if (panelIframe && panelIframe.contentWindow) {
      try {
        panelIframe.contentWindow.postMessage({ type: 'PANEL_RESIZED', width: newWidth }, '*');
      } catch (e) {
        // Ignore cross-origin errors
      }
    }
  }
  
  function updateViewportStyle(width) {
    if (!styleElement) return;
    
    // Resize viewport by adjusting body/html margins and constraining content
    // The panel itself is positioned relative to the actual viewport (100vw)
    // while the content is constrained to leave space for it
    styleElement.textContent = `
      /* Constrain viewport at root level - but panel is positioned outside this */
      html {
        overflow-x: hidden !important;
        box-sizing: border-box !important;
      }
      body {
        margin-right: ${width}px !important;
        overflow-x: hidden !important;
        width: calc(100vw - ${width}px) !important;
        max-width: calc(100vw - ${width}px) !important;
        box-sizing: border-box !important;
        position: relative !important;
      }
      /* Constrain all direct children of body (except our panel) */
      body > *:not(#${PANEL_ID}) {
        max-width: calc(100vw - ${width}px) !important;
        box-sizing: border-box !important;
      }
      /* Constrain common container elements */
      main, section, article, header, footer, nav, aside, div.container, div.wrapper, div.content {
        max-width: 100% !important;
        box-sizing: border-box !important;
      }
      /* Ensure fixed/sticky elements are constrained and repositioned */
      /* But exclude our panel from these rules */
      body [style*="position: fixed"]:not(#${PANEL_ID}):not(#${PANEL_ID} *),
      body [style*="position:fixed"]:not(#${PANEL_ID}):not(#${PANEL_ID} *) {
        max-width: calc(100vw - ${width}px) !important;
      }
      body [style*="position: sticky"]:not(#${PANEL_ID}):not(#${PANEL_ID} *),
      body [style*="position:sticky"]:not(#${PANEL_ID}):not(#${PANEL_ID} *) {
        max-width: calc(100vw - ${width}px) !important;
      }
      /* Reposition fixed elements that are on the right edge (but not our panel) */
      body [style*="right: 0"]:not(#${PANEL_ID}):not(#${PANEL_ID} *),
      body [style*="right:0"]:not(#${PANEL_ID}):not(#${PANEL_ID} *),
      body [style*="right: 0px"]:not(#${PANEL_ID}):not(#${PANEL_ID} *),
      body [style*="right:0px"]:not(#${PANEL_ID}):not(#${PANEL_ID} *) {
        right: ${width}px !important;
      }
      /* Exception for our panel itself - positioned relative to actual viewport */
      #${PANEL_ID} {
        position: fixed !important;
        right: 0 !important;
        top: 0 !important;
        width: ${width}px !important;
        height: 100vh !important;
        max-width: none !important;
        box-sizing: border-box !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      #${PANEL_ID} * {
        max-width: none !important;
        box-sizing: border-box !important;
      }
      /* Prevent horizontal scrolling */
      html, body {
        overflow-x: hidden !important;
        overflow-y: auto !important;
      }
    `;
  }
  
  function removeSidePanel() {
    const panel = document.getElementById(PANEL_ID);
    if (panel) {
      panel.remove();
      panelIframe = null;
    }
    
    // Remove viewport style
    const style = document.getElementById('network-capture-viewport-style');
    if (style) {
      style.remove();
      styleElement = null;
    }
    
    currentPanelWidth = PANEL_WIDTH;
  }
  
  // Listen for close message from side panel
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'CLOSE_SIDE_PANEL') {
      removeSidePanel();
    }
  });
})();
