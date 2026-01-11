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

// Track the tab ID being monitored (where side panel was opened)
let monitoredTabId = null;

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
  
  // Open side panel for this specific tab
  await chrome.sidePanel.open({ tabId: tab.id });
});

// Listen for tab updates (URL changes, etc.)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // If the monitored tab's URL changed, clear data
  if (tabId === monitoredTabId && changeInfo.url) {
    clearTabData();
  }
  
  // Existing injection logic
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
    
    // Only capture from monitored tab
    if (!sender.tab || sender.tab.id !== monitoredTabId) {
      return false;
    }
    
    const requestData = message.data;
    
    // Check if this is an update to an existing pending request
    const existingIndex = capturedRequests.findIndex(req => req.id === requestData.id);
    
    if (existingIndex !== -1) {
      // Update existing request
      capturedRequests[existingIndex] = requestData;
    } else {
      // Add new request (add to end, newest at bottom)
      capturedRequests.push(requestData);
      
      // Limit array size (keep most recent items)
      if (capturedRequests.length > MAX_REQUESTS) {
        capturedRequests = capturedRequests.slice(-MAX_REQUESTS);
      }
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
    
    // Also clear project log file if active project exists
    chrome.storage.local.get(['activeProjectId', 'projectLogs'], (result) => {
      const activeProjectId = result.activeProjectId;
      if (activeProjectId) {
        const projectLogs = result.projectLogs || {};
        projectLogs[activeProjectId] = [];
        chrome.storage.local.set({ projectLogs: projectLogs });
      }
    });
    
    sendResponse({ success: true });
    return false; // Synchronous response sent
  }
  
  if (message.type === 'GET_REQUEST_COUNT') {
    // Return request count
    sendResponse({ count: capturedRequests.length });
    return false; // Synchronous response sent
  }
  
  if (message.type === 'GET_MONITORED_TAB_ID') {
    // Return monitored tab ID
    sendResponse({ tabId: monitoredTabId });
    return false; // Synchronous response sent
  }
  
  // Screenshot selection messages - forward to side panel
  // These messages come from content scripts and need to be forwarded
  // The side panel will handle them via its own chrome.runtime.onMessage listener
  if (message.type === 'SCREENSHOT_SELECTION_COMPLETE' || message.type === 'SCREENSHOT_SELECTION_CANCELLED') {
    // Don't send response - let side panel handle it
    // Return false to indicate we're not handling it here
    // The side panel listener will receive this message
    return false;
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
        chrome.sidePanel.open({ tabId: tabs[0].id });
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
    // Reload the monitored tab with hard reload (bypass cache)
    if (monitoredTabId !== null) {
      chrome.tabs.reload(monitoredTabId, { bypassCache: true });
    }
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
    
    // Handle messages from side panel (no sender.tab) or from content script (has sender.tab)
    let tabId = null;
    if (sender.tab) {
      // Message from content script - only capture from monitored tab
      if (sender.tab.id !== monitoredTabId) {
        return false;
      }
      tabId = sender.tab.id;
    } else if (message.tabId) {
      // Message from side panel with explicit tabId - use it if it matches monitored tab
      if (message.tabId !== monitoredTabId) {
        return false;
      }
      tabId = message.tabId;
    } else {
      // No tab info - skip
      return false;
    }
    
    // Add tab ID to log data for filtering
    logData.tabId = tabId;
    
    // Add to array (add to end, newest at bottom)
    capturedConsoleLogs.push(logData);
    
    // Limit array size (keep most recent items)
    if (capturedConsoleLogs.length > MAX_CONSOLE_LOGS) {
      capturedConsoleLogs = capturedConsoleLogs.slice(-MAX_CONSOLE_LOGS);
    }
    
    // Also save to project log file if active project exists
    chrome.storage.local.get(['activeProjectId', 'projectLogs'], (result) => {
      const activeProjectId = result.activeProjectId;
      if (activeProjectId) {
        const projectLogs = result.projectLogs || {};
        if (!projectLogs[activeProjectId]) {
          projectLogs[activeProjectId] = [];
        }
        projectLogs[activeProjectId].push(logData);
        
        // Limit project log size (keep most recent items)
        if (projectLogs[activeProjectId].length > MAX_CONSOLE_LOGS) {
          projectLogs[activeProjectId] = projectLogs[activeProjectId].slice(-MAX_CONSOLE_LOGS);
        }
        
        chrome.storage.local.set({ projectLogs: projectLogs });
      }
    });
    
    // Fire-and-forget message - no response needed
    return false;
  }
  
  if (message.type === 'GET_ACTIVE_TAB_INFO') {
    // Return monitored tab information
    if (monitoredTabId === null) {
      sendResponse({ tabInfo: null });
      return false;
    }
    
    chrome.tabs.get(monitoredTabId, (tab) => {
      if (chrome.runtime.lastError) {
        sendResponse({ tabInfo: null });
        return;
      }
      
      sendResponse({
        tabInfo: {
          id: tab.id,
          title: tab.title || 'Untitled',
          url: tab.url || '',
          favIconUrl: tab.favIconUrl || null
        }
      });
    });
    
    return true; // Async response
  }
  
  if (message.type === 'SET_CONSOLE_RECORDING_STATE') {
    isConsoleRecording = message.isRecording !== undefined ? message.isRecording : true;
    sendResponse({ success: true });
    return false;
  }
  
  if (message.type === 'GET_CONSOLE_LOGS') {
    // Return only logs from the monitored tab
    // If no monitored tab is set, return empty array
    if (monitoredTabId === null || monitoredTabId === undefined) {
      sendResponse({ logs: [] });
      return false;
    }
    const monitoredTabLogs = capturedConsoleLogs.filter(log => log.tabId === monitoredTabId);
    sendResponse({ logs: monitoredTabLogs });
    return false;
  }
  
  if (message.type === 'CLEAR_CONSOLE_LOGS') {
    // Clear all console logs
    capturedConsoleLogs = [];
    
    // Also clear project log file if active project exists
    chrome.storage.local.get(['activeProjectId', 'projectLogs'], (result) => {
      const activeProjectId = result.activeProjectId;
      if (activeProjectId) {
        const projectLogs = result.projectLogs || {};
        projectLogs[activeProjectId] = [];
        chrome.storage.local.set({ projectLogs: projectLogs });
      }
    });
    
    sendResponse({ success: true });
    return false;
  }
  
  if (message.type === 'OPEN_CONSOLE_VIEWER') {
    // Open or focus console viewer window
    openConsoleViewer();
    sendResponse({ success: true });
    return false;
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
    
    // Check if tab still exists
    chrome.tabs.get(monitoredTabId, (tab) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: 'Monitored tab is no longer available' });
        return;
      }
      
      // Inject script to read Cache Storage API
      chrome.scripting.executeScript({
        target: { tabId: monitoredTabId },
        world: 'MAIN',
        func: async () => {
          try {
            if (!('caches' in window)) {
              return { error: 'Cache API not available' };
            }
            
            const cacheNames = await caches.keys();
            const cacheData = [];
            
            for (const cacheName of cacheNames) {
              const cache = await caches.open(cacheName);
              const requests = await cache.keys();
              const entries = [];
              
              // Limit to first 100 entries per cache for performance
              const limitedRequests = requests.slice(0, 100);
              
              for (const request of limitedRequests) {
                const response = await cache.match(request);
                if (response) {
                  let responseBody = '';
                  const contentType = response.headers.get('content-type') || '';
                  
                  try {
                    if (contentType.includes('application/json')) {
                      responseBody = await response.clone().json();
                    } else if (contentType.includes('text/')) {
                      responseBody = await response.clone().text();
                      // Limit text response preview
                      if (responseBody.length > 500) {
                        responseBody = responseBody.substring(0, 500) + '... (truncated)';
                      }
                    } else {
                      responseBody = '[Binary or non-text response]';
                    }
                  } catch (e) {
                    responseBody = '[Unable to read response body]';
                  }
                  
                  const headers = {};
                  response.headers.forEach((value, key) => {
                    headers[key] = value;
                  });
                  
                  entries.push({
                    url: request.url,
                    method: request.method || 'GET',
                    response: responseBody,
                    headers: headers,
                    status: response.status,
                    statusText: response.statusText
                  });
                }
              }
              
              cacheData.push({
                name: cacheName,
                entries: entries,
                totalEntries: requests.length
              });
            }
            
            return { caches: cacheData };
          } catch (error) {
            return { error: error.message || 'Failed to read cache data' };
          }
        }
      }).then((results) => {
        if (results && results[0] && results[0].result) {
          sendResponse(results[0].result);
        } else {
          sendResponse({ error: 'Failed to execute script' });
        }
      }).catch((error) => {
        sendResponse({ error: error.message || 'Failed to execute script' });
      });
    });
    
    return true; // Async response
  }
  
  if (message.type === 'GET_LOCAL_STORAGE_DATA') {
    // Get localStorage data from monitored tab
    if (monitoredTabId === null || monitoredTabId === undefined) {
      sendResponse({ error: 'No monitored tab' });
      return false;
    }
    
    // Check if tab still exists
    chrome.tabs.get(monitoredTabId, (tab) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: 'Monitored tab is no longer available' });
        return;
      }
      
      // Inject script to read localStorage
      chrome.scripting.executeScript({
        target: { tabId: monitoredTabId },
        world: 'MAIN',
        func: () => {
          try {
            const items = [];
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key !== null) {
                let value = localStorage.getItem(key);
                // Try to parse as JSON if possible
                try {
                  const parsed = JSON.parse(value);
                  value = parsed;
                } catch (e) {
                  // Keep as string if not valid JSON
                }
                items.push({ key: key, value: value });
              }
            }
            return { items: items };
          } catch (error) {
            return { error: error.message || 'Failed to read localStorage' };
          }
        }
      }).then((results) => {
        if (results && results[0] && results[0].result) {
          sendResponse(results[0].result);
        } else {
          sendResponse({ error: 'Failed to execute script' });
        }
      }).catch((error) => {
        sendResponse({ error: error.message || 'Failed to execute script' });
      });
    });
    
    return true; // Async response
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
