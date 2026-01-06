/**
 * Content Script - Runs in isolated world
 * Listens for messages from injected script (running in MAIN world) and forwards to background
 */

(function() {
  'use strict';
  
  console.log('[Network Capture] Content script loaded');
  
  // Listen for messages from injected page script (running in MAIN world)
  window.addEventListener('message', function(event) {
    // Only accept messages from the same window
    if (event.source !== window) {
      return;
    }
    
    // Only accept messages with our specific format
    if (event.data && event.data.type === 'NETWORK_CAPTURE_REQUEST') {
      console.log('[Network Capture] Received request:', event.data.data.url);
      
      // Forward to background service worker
      chrome.runtime.sendMessage({
        type: 'NETWORK_REQUEST',
        data: event.data.data
      }).catch(function(err) {
        console.error('[Network Capture] Error sending to background:', err);
      });
    }
  });
})();
