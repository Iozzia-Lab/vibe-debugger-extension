/**
 * Background Service Worker
 * Receives and stores captured network requests
 */

// Store captured requests in memory
let capturedRequests = [];
const MAX_REQUESTS = 200; // Limit to prevent memory issues
let isRecording = true; // Default to recording on

// Store captured console logs in memory
let capturedConsoleLogs = [];
const MAX_CONSOLE_LOGS = 500; // Limit to prevent memory issues
let isConsoleRecording = true; // Default to recording on
let consoleViewerWindowId = null; // Track console viewer window ID

// Register content script in MAIN world (page context) on install
chrome.runtime.onInstalled.addListener(async () => {
  capturedRequests = [];
  
  try {
    // Unregister existing script if any
    try {
      await chrome.scripting.unregisterContentScripts({ ids: ['network-capture-injected'] });
    } catch (e) {
      // Ignore if doesn't exist
    }
    
    // Register injected script to run in page context (MAIN world)
    await chrome.scripting.registerContentScripts([{
      id: 'network-capture-injected',
      js: ['content/injected.js'],
      matches: ['<all_urls>'],
      runAt: 'document_start',
      world: 'MAIN', // This runs in page context, not isolated world
      allFrames: true
    }]);
    
    console.log('[Network Capture] Registered injected script in MAIN world');
    
    // Also inject into all existing tabs
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.url && (tab.url.startsWith('http') || tab.url.startsWith('https'))) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content/injected.js'],
            world: 'MAIN'
          });
        } catch (e) {
          // Ignore errors (e.g., chrome:// pages)
          console.log('[Network Capture] Could not inject into tab:', tab.url);
        }
      }
    }
  } catch (err) {
    console.error('[Network Capture] Failed to register script:', err);
  }
});

// Open side panel when extension icon is clicked
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});

// Inject into new tabs when they're created/updated
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && tab.url && 
      (tab.url.startsWith('http') || tab.url.startsWith('https'))) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content/injected.js'],
        world: 'MAIN',
        runAt: 'document_start'
      });
    } catch (e) {
      // Ignore errors
    }
  }
});

// Single message listener for all message types
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'NETWORK_REQUEST') {
    // Only capture if recording is enabled
    if (!isRecording) {
      return false;
    }
    
    const requestData = message.data;
    
    // Add to array
    capturedRequests.unshift(requestData); // Add to beginning (newest first)
    
    // Limit array size
    if (capturedRequests.length > MAX_REQUESTS) {
      capturedRequests = capturedRequests.slice(0, MAX_REQUESTS);
    }
    
    // Fire-and-forget message - no response needed
    // Return false to indicate synchronous handling
    return false;
  }
  
  if (message.type === 'SET_RECORDING_STATE') {
    isRecording = message.isRecording !== undefined ? message.isRecording : true;
    sendResponse({ success: true });
    return false;
  }
  
  if (message.type === 'GET_REQUESTS') {
    // Return all captured requests
    sendResponse({ requests: capturedRequests });
    return false; // Synchronous response sent
  }
  
  if (message.type === 'CLEAR_REQUESTS') {
    // Clear all requests
    capturedRequests = [];
    sendResponse({ success: true });
    return false; // Synchronous response sent
  }
  
  if (message.type === 'GET_REQUEST_COUNT') {
    // Return request count
    sendResponse({ count: capturedRequests.length });
    return false; // Synchronous response sent
  }
  
  if (message.type === 'OPEN_POPUP') {
    // Open the popup
    chrome.action.openPopup();
    sendResponse({ success: true });
    return false;
  }
  
  if (message.type === 'TOGGLE_SIDE_PANEL') {
    // Toggle side panel using Chrome Side Panel API
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.windows.get(tabs[0].windowId, (window) => {
          chrome.sidePanel.open({ windowId: window.id });
        });
      }
    });
    sendResponse({ success: true });
    return false;
  }
  
  if (message.type === 'CLOSE_SIDE_PANEL') {
    // Close side panel - Chrome handles this automatically when user clicks X
    // But we can set it to disabled if needed
    sendResponse({ success: true });
    return false;
  }
  
  if (message.type === 'RELOAD_PAGE') {
    // Reload the current active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.reload(tabs[0].id);
      }
    });
    sendResponse({ success: true });
    return false;
  }
  
  // Console log handling
  if (message.type === 'CONSOLE_LOG') {
    // Only capture if console recording is enabled
    if (!isConsoleRecording) {
      return false;
    }
    
    const logData = message.data;
    
    // Add to array
    capturedConsoleLogs.unshift(logData); // Add to beginning (newest first)
    
    // Limit array size
    if (capturedConsoleLogs.length > MAX_CONSOLE_LOGS) {
      capturedConsoleLogs = capturedConsoleLogs.slice(0, MAX_CONSOLE_LOGS);
    }
    
    // Fire-and-forget message - no response needed
    return false;
  }
  
  if (message.type === 'SET_CONSOLE_RECORDING_STATE') {
    isConsoleRecording = message.isRecording !== undefined ? message.isRecording : true;
    sendResponse({ success: true });
    return false;
  }
  
  if (message.type === 'GET_CONSOLE_LOGS') {
    // Return all captured console logs
    sendResponse({ logs: capturedConsoleLogs });
    return false;
  }
  
  if (message.type === 'CLEAR_CONSOLE_LOGS') {
    // Clear all console logs
    capturedConsoleLogs = [];
    sendResponse({ success: true });
    return false;
  }
  
  if (message.type === 'OPEN_CONSOLE_VIEWER') {
    // Open or focus console viewer window
    openConsoleViewer();
    sendResponse({ success: true });
    return false;
  }
  
  return false;
});

// Set up window event listeners once
chrome.windows.onBoundsChanged.addListener((windowId) => {
  if (windowId === consoleViewerWindowId) {
    chrome.windows.get(windowId, (win) => {
      chrome.storage.local.set({
        consoleViewerBounds: {
          width: win.width,
          height: win.height,
          left: win.left,
          top: win.top
        }
      });
    });
  }
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === consoleViewerWindowId) {
    consoleViewerWindowId = null;
  }
});

// Open console viewer window
async function openConsoleViewer() {
  // Check if window already exists
  if (consoleViewerWindowId !== null) {
    try {
      const window = await chrome.windows.get(consoleViewerWindowId);
      // Window exists, focus it
      await chrome.windows.update(consoleViewerWindowId, { focused: true });
      return;
    } catch (e) {
      // Window doesn't exist anymore, reset ID
      consoleViewerWindowId = null;
    }
  }
  
  // Load saved window position/size
  chrome.storage.local.get(['consoleViewerBounds'], async (result) => {
    const defaultBounds = {
      width: 1200,
      height: 800,
      left: 100,
      top: 100
    };
    
    const bounds = result.consoleViewerBounds || defaultBounds;
    
    // Create new window
    try {
      const window = await chrome.windows.create({
        url: chrome.runtime.getURL('console-viewer/console-viewer.html'),
        type: 'popup',
        width: bounds.width,
        height: bounds.height,
        left: bounds.left,
        top: bounds.top
      });
      
      consoleViewerWindowId = window.id;
    } catch (err) {
      console.error('[Network Capture] Failed to open console viewer:', err);
    }
  });
}

// Load requests from storage on startup (optional)
chrome.runtime.onStartup.addListener(() => {
  // Optionally load from storage
  // chrome.storage.local.get(['requests'], (result) => {
  //   if (result.requests) {
  //     capturedRequests = result.requests.slice(0, MAX_REQUESTS);
  //   }
  // });
});
