/**
 * Background Service Worker
 * Receives and stores captured network requests
 */

// Store captured requests in memory
let capturedRequests = [];
const MAX_REQUESTS = 200; // Limit to prevent memory issues

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'NETWORK_REQUEST') {
    const requestData = message.data;
    
    // Add to array
    capturedRequests.unshift(requestData); // Add to beginning (newest first)
    
    // Limit array size
    if (capturedRequests.length > MAX_REQUESTS) {
      capturedRequests = capturedRequests.slice(0, MAX_REQUESTS);
    }
    
    // Optionally persist to storage (commented out for performance)
    // chrome.storage.local.set({ requests: capturedRequests });
  }
  
  return true; // Keep channel open for async response
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_REQUESTS') {
    // Return all captured requests
    sendResponse({ requests: capturedRequests });
    return true;
  }
  
  if (message.type === 'CLEAR_REQUESTS') {
    // Clear all requests
    capturedRequests = [];
    sendResponse({ success: true });
    return true;
  }
  
  if (message.type === 'GET_REQUEST_COUNT') {
    // Return request count
    sendResponse({ count: capturedRequests.length });
    return true;
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

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  capturedRequests = [];
});
