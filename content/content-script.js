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
      
      // Forward to background service worker (fire-and-forget)
      // Wrap everything in try-catch to handle "Extension context invalidated" errors
      try {
        // Check if chrome.runtime exists - accessing it can throw if context is invalidated
        if (typeof chrome === 'undefined' || !chrome.runtime) {
          // Extension context invalidated - silently ignore
          return;
        }
        
        // Try to send message - this can also throw synchronously if context is invalidated
        chrome.runtime.sendMessage({
          type: 'NETWORK_REQUEST',
          data: event.data.data
        }).then(function(response) {
          // Response received (or undefined if no response)
          // Ignore it - we don't need to do anything
        }).catch(function(err) {
          // Check if it's a context invalidated error
          const errorMsg = err ? (err.message || String(err)) : 'Unknown error';
          if (errorMsg.includes('Extension context invalidated') || 
              errorMsg.includes('context invalidated')) {
            // Silently ignore - extension was reloaded, page needs refresh
            return;
          }
          // Other errors - log but don't break
          console.log('[Network Capture] Could not send to service worker:', errorMsg);
        });
      } catch (err) {
        // Synchronous error (like "Extension context invalidated")
        const errorMsg = err ? (err.message || String(err)) : 'Unknown error';
        if (errorMsg.includes('Extension context invalidated') || 
            errorMsg.includes('context invalidated')) {
          // Silently ignore - extension was reloaded, page needs refresh
          return;
        }
        // Other synchronous errors - log but don't break
        console.error('[Network Capture] Error sending message:', errorMsg);
      }
    }
  });
})();
