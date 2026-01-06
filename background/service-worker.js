/**
 * Background Service Worker
 * Receives and stores captured network requests
 */

// Store captured requests in memory
let capturedRequests = [];
const MAX_REQUESTS = 200; // Limit to prevent memory issues

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
  
  return false;
});

// Load requests from storage on startup (optional)
chrome.runtime.onStartup.addListener(() => {
  // Optionally load from storage
  // chrome.storage.local.get(['requests'], (result) => {
  //   if (result.requests) {
  //     capturedRequests = result.requests.slice(0, MAX_REQUESTS);
  //   }
  // });
});
