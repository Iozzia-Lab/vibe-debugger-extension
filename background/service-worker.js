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
let markupViewerWindowId = null; // Track markup viewer window ID

// Track the tab ID being monitored (where side panel was opened)
let monitoredTabId = null;

// Load monitoredTabId from storage on startup
chrome.storage.local.get(['monitoredTabId'], (result) => {
  if (result.monitoredTabId) {
    // Verify tab still exists
    chrome.tabs.get(result.monitoredTabId, (tab) => {
      if (chrome.runtime.lastError) {
        // Tab no longer exists, clear it
        chrome.storage.local.remove(['monitoredTabId']);
        monitoredTabId = null;
      } else {
        monitoredTabId = result.monitoredTabId;
        console.log('[Network Capture] Restored monitored tab:', monitoredTabId);
      }
    });
  }
});

// Clear monitoredTabId when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (monitoredTabId === tabId) {
    monitoredTabId = null;
    chrome.storage.local.remove(['monitoredTabId']);
    console.log('[Network Capture] Monitored tab closed, cleared tracking');
  }
});

// Clear data when switching to a new monitored tab
function clearTabData() {
  capturedRequests = [];
  capturedConsoleLogs = [];
}

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

// Open side panel when extension icon is clicked - tied to specific tab
chrome.action.onClicked.addListener(async (tab) => {
  // Clear data if switching to a different tab
  if (monitoredTabId !== null && monitoredTabId !== tab.id) {
    clearTabData();
  }
  
  // Set the monitored tab to the tab where panel was opened
  monitoredTabId = tab.id;
  // Persist to storage
  chrome.storage.local.set({ monitoredTabId: tab.id });
  
  // Open side panel FIRST (must be in response to user gesture)
  await chrome.sidePanel.open({ tabId: tab.id });
  
  // Then inject scripts into the page if not already injected
  // This ensures data flows immediately without requiring a page reload
  if (tab.url && (tab.url.startsWith('http') || tab.url.startsWith('https'))) {
    try {
      // Check if script is already injected
      const isInjected = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          return !!window.__NETWORK_CAPTURE_INJECTED;
        },
        world: 'MAIN'
      });
      
      // Only inject if not already present
      if (!isInjected || !isInjected[0] || !isInjected[0].result) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/injected.js'],
          world: 'MAIN'
        });
        console.log('[Network Capture] Scripts already injected in tab:', tab.id);
      }
    } catch (e) {
      console.error('[Network Capture] Error injecting script:', e);
    }
  }
});

// Listen for messages from content scripts and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'NETWORK_REQUEST') {
    // Only capture if recording is enabled
    if (isRecording) {
      // Add tabId to request data
      const requestData = {
        ...message.data,
        tabId: sender.tab ? sender.tab.id : null
      };
      
      // Check if this is an update to an existing request
      const existingIndex = capturedRequests.findIndex(req => req.id === message.data.id);
      
      if (existingIndex >= 0) {
        // Update existing request
        capturedRequests[existingIndex] = requestData;
      } else {
        // Add new request
        capturedRequests.push(requestData);
        
        // Limit array size
        if (capturedRequests.length > MAX_REQUESTS) {
          capturedRequests.shift(); // Remove oldest
        }
      }
    }
    
    sendResponse({ success: true });
    return false; // Keep channel open for async response
  }
  
  if (message.type === 'CONSOLE_LOG') {
    // Only capture if console recording is enabled
    if (isConsoleRecording) {
      // Add console log with tab ID
      const logEntry = {
        ...message.data,
        tabId: sender.tab ? sender.tab.id : null
      };
      
      capturedConsoleLogs.push(logEntry);
      
      // Limit array size
      if (capturedConsoleLogs.length > MAX_CONSOLE_LOGS) {
        capturedConsoleLogs.shift(); // Remove oldest
      }
    }
    
    sendResponse({ success: true });
    return false; // Keep channel open for async response
  }
  
  if (message.type === 'GET_REQUESTS') {
    // Filter requests by monitored tab if specified
    let requestsToReturn = capturedRequests;
    if (monitoredTabId !== null) {
      requestsToReturn = capturedRequests.filter(req => req.tabId === monitoredTabId);
    }
    
    sendResponse({ requests: requestsToReturn });
    return false;
  }
  
  if (message.type === 'GET_CONSOLE_LOGS') {
    // Filter logs by monitored tab if specified
    let logsToReturn = capturedConsoleLogs;
    if (monitoredTabId !== null) {
      logsToReturn = capturedConsoleLogs.filter(log => log.tabId === monitoredTabId);
    }
    
    sendResponse({ logs: logsToReturn });
    return false;
  }
  
  if (message.type === 'CLEAR_REQUESTS') {
    // Clear requests for the monitored tab only
    if (monitoredTabId !== null) {
      capturedRequests = capturedRequests.filter(req => req.tabId !== monitoredTabId);
    } else {
      capturedRequests = [];
    }
    sendResponse({ success: true });
    return false;
  }
  
  if (message.type === 'CLEAR_CONSOLE_LOGS') {
    // Clear logs for the monitored tab only
    if (monitoredTabId !== null) {
      capturedConsoleLogs = capturedConsoleLogs.filter(log => log.tabId !== monitoredTabId);
    } else {
      capturedConsoleLogs = [];
    }
    sendResponse({ success: true });
    return false;
  }
  
  if (message.type === 'SET_RECORDING') {
    isRecording = message.recording;
    sendResponse({ success: true });
    return false;
  }
  
  if (message.type === 'GET_RECORDING') {
    sendResponse({ recording: isRecording });
    return false;
  }
  
  if (message.type === 'SET_CONSOLE_RECORDING') {
    isConsoleRecording = message.recording;
    // Sync with storage for console viewer
    chrome.storage.local.set({ isConsoleRecording: isConsoleRecording });
    sendResponse({ success: true });
    return false;
  }
  
  if (message.type === 'GET_CONSOLE_RECORDING') {
    sendResponse({ recording: isConsoleRecording });
    return false;
  }
  
  if (message.type === 'GET_MONITORED_TAB_ID') {
    sendResponse({ tabId: monitoredTabId });
    return false;
  }
  
  if (message.type === 'SCREENSHOT_SELECTION_COMPLETE' || message.type === 'SCREENSHOT_SELECTION_CANCELLED') {
    // Allow these messages to pass through to side panel
    // Return false to allow side panel to receive them
    return false;
  }
  
  if (message.type === 'CROP_COPY_SUCCESS' || message.type === 'CROP_COPY_ERROR') {
    // Allow these messages to pass through to side panel
    return false;
  }
  
  if (message.type === 'OPEN_CONSOLE_VIEWER') {
    // Open or focus console viewer window
    openConsoleViewer();
    sendResponse({ success: true });
    return false;
  }
  
  if (message.type === 'OPEN_MARKUP_VIEWER') {
    // Open or focus markup viewer window
    openMarkupViewer(message.markupId).then(() => {
      sendResponse({ success: true });
    }).catch((err) => {
      console.error('[Markup Viewer] Error opening viewer:', err);
      sendResponse({ success: false, error: err.message });
    });
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'NOTIFY_CONSOLE_VIEWER_RECORDING') {
    // Recording state is already synced via storage, no action needed
    sendResponse({ success: true });
    return false;
  }
  
  if (message.type === 'NOTIFY_CONSOLE_VIEWER_CLEAR') {
    // Set a flag in storage that console viewer can check
    chrome.storage.local.set({ consoleViewerClearFlag: Date.now() });
    sendResponse({ success: true });
    return false;
  }
  
  if (message.type === 'GET_CACHE_DATA') {
    // Get cache data from monitored tab
    if (monitoredTabId === null || monitoredTabId === undefined) {
      sendResponse({ error: 'No monitored tab' });
      return false;
    }
    
    chrome.tabs.sendMessage(monitoredTabId, { type: 'GET_CACHE_DATA' }, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse(response || { error: 'No response' });
      }
    });
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'GET_LOCAL_STORAGE_DATA') {
    // Get localStorage data from monitored tab
    if (monitoredTabId === null || monitoredTabId === undefined) {
      sendResponse({ error: 'No monitored tab' });
      return false;
    }
    
    chrome.tabs.sendMessage(monitoredTabId, { type: 'GET_LOCAL_STORAGE_DATA' }, (response) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
      } else {
        sendResponse(response || { error: 'No response' });
      }
    });
    return true; // Keep channel open for async response
  }
  
  if (message.type === 'RELOAD_TAB' || message.type === 'RELOAD_PAGE') {
    // Reload the monitored tab
    if (monitoredTabId !== null && monitoredTabId !== undefined) {
      chrome.tabs.reload(monitoredTabId, { bypassCache: true });
      sendResponse({ success: true });
    } else {
      sendResponse({ error: 'No monitored tab' });
    }
    return false;
  }
  
  if (message.type === 'SET_RECORDING_STATE') {
    isRecording = message.isRecording;
    sendResponse({ success: true });
    return false;
  }
  
  if (message.type === 'SET_CONSOLE_RECORDING_STATE') {
    isConsoleRecording = message.isRecording;
    // Sync with storage for console viewer
    chrome.storage.local.set({ isConsoleRecording: isConsoleRecording });
    sendResponse({ success: true });
    return false;
  }
  
  if (message.type === 'GET_ACTIVE_TAB_INFO') {
    // Get monitored tab info, or fallback to active tab
    if (monitoredTabId !== null && monitoredTabId !== undefined) {
      chrome.tabs.get(monitoredTabId, (tab) => {
        if (chrome.runtime.lastError) {
          // Monitored tab no longer exists, try active tab as fallback
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs.length > 0) {
              const activeTab = tabs[0];
              // Update monitoredTabId to active tab
              monitoredTabId = activeTab.id;
              chrome.storage.local.set({ monitoredTabId: activeTab.id });
              sendResponse({ 
                tabInfo: {
                  id: activeTab.id,
                  url: activeTab.url,
                  title: activeTab.title,
                  favIconUrl: activeTab.favIconUrl
                }
              });
            } else {
              sendResponse({ error: 'No active tab found' });
            }
          });
        } else {
          sendResponse({ 
            tabInfo: {
              id: tab.id,
              url: tab.url,
              title: tab.title,
              favIconUrl: tab.favIconUrl
            }
          });
        }
      });
    } else {
      // No monitored tab, use active tab
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
        } else if (tabs && tabs.length > 0) {
          const tab = tabs[0];
          // Set as monitored tab
          monitoredTabId = tab.id;
          chrome.storage.local.set({ monitoredTabId: tab.id });
          sendResponse({ 
            tabInfo: {
              id: tab.id,
              url: tab.url,
              title: tab.title,
              favIconUrl: tab.favIconUrl
            }
          });
        } else {
          sendResponse({ error: 'No active tab found' });
        }
      });
    }
    return true; // Keep channel open for async response
  }
  
  return false;
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
    const window = await chrome.windows.create({
      url: chrome.runtime.getURL('console-viewer/console-viewer.html'),
      type: 'popup',
      width: bounds.width,
      height: bounds.height,
      left: bounds.left,
      top: bounds.top
    });
    
    consoleViewerWindowId = window.id;
    
    // Save window bounds when changed
    chrome.windows.onBoundsChanged.addListener((changedWindowId) => {
      if (changedWindowId === consoleViewerWindowId) {
        chrome.windows.get(changedWindowId, (win) => {
          if (win) {
            chrome.storage.local.set({
              consoleViewerBounds: {
                width: win.width,
                height: win.height,
                left: win.left,
                top: win.top
              }
            });
          }
        });
      }
    });
  });
  
  // Clean up window ID when window is closed
  chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === consoleViewerWindowId) {
      consoleViewerWindowId = null;
    }
    if (windowId === markupViewerWindowId) {
      markupViewerWindowId = null;
    }
  });
}

// Open markup viewer window
async function openMarkupViewer(markupId) {
  if (!markupId) {
    console.error('[Markup Viewer] No markup ID provided');
    return;
  }
  
  // Check if window already exists
  if (markupViewerWindowId !== null) {
    try {
      const window = await chrome.windows.get(markupViewerWindowId);
      // Window exists, focus it
      await chrome.windows.update(markupViewerWindowId, { focused: true });
      return;
    } catch (e) {
      // Window doesn't exist anymore, reset ID
      markupViewerWindowId = null;
    }
  }
  
  // Create new window with markup ID in URL
  const url = chrome.runtime.getURL(`markup-viewer/markup-viewer.html?id=${markupId}`);
  
  const window = await chrome.windows.create({
    url: url,
    type: 'popup',
    width: 1000,
    height: 700,
    left: 100,
    top: 100
  });
  
  markupViewerWindowId = window.id;
  
  // Save window bounds when changed
  chrome.windows.onBoundsChanged.addListener((changedWindowId) => {
    if (changedWindowId === markupViewerWindowId) {
      chrome.windows.get(changedWindowId, (win) => {
        if (win) {
          chrome.storage.local.set({
            [`markupViewerBounds_${markupId}`]: {
              width: win.width,
              height: win.height,
              left: win.left,
              top: win.top
            }
          });
        }
      });
    }
  });
}
