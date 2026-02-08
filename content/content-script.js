/**
 * Content Script - Runs in isolated world
 * Listens for messages from injected script (running in MAIN world) and forwards to background
 */

(function() {
  'use strict';
  
  // Don't log on every page load - too noisy
  
  // Listen for messages from injected page script (running in MAIN world)
  window.addEventListener('message', function(event) {
    // Only accept messages from the same window
    if (event.source !== window) {
      return;
    }
    
    // Debug: log all messages to see what we're receiving
    if (event.data && (event.data.type === 'SCREENSHOT_SELECTION_COMPLETE' || event.data.type === 'SCREENSHOT_SELECTION_CANCELLED')) {
      console.log('[Network Capture] Content script received window.postMessage:', event.data.type, event.data);
    }
    
    // Forward message to background service worker
    function forwardToBackground(messageType, data) {
      // Wrap everything in try-catch to handle "Extension context invalidated" errors
      try {
        // Check if chrome.runtime exists - accessing it can throw if context is invalidated
        if (typeof chrome === 'undefined' || !chrome.runtime) {
          // Extension context invalidated - silently ignore
          return;
        }
        
        // Try to send message - this can also throw synchronously if context is invalidated
        chrome.runtime.sendMessage({
          type: messageType,
          data: data
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
    
    // Only accept messages with our specific format
    if (event.data && event.data.type === 'NETWORK_CAPTURE_REQUEST') {
      forwardToBackground('NETWORK_REQUEST', event.data.data);
    }
    
    // Handle console log capture messages
    if (event.data && event.data.type === 'CONSOLE_CAPTURE_LOG') {
      forwardToBackground('CONSOLE_LOG', event.data.data);
    }
    
    // Handle screenshot selection messages (relay to background)
    if (event.data && event.data.type === 'SCREENSHOT_SELECTION_COMPLETE') {
      console.log('[Network Capture] Relaying selection complete:', event.data.selection);
      chrome.runtime.sendMessage({
        type: 'SCREENSHOT_SELECTION_COMPLETE',
        selection: event.data.selection
      }).then(function(response) {
        console.log('[Network Capture] Selection message sent successfully');
      }).catch(function(err) {
        console.error('[Network Capture] Could not send selection:', err);
      });
    }
    
    if (event.data && event.data.type === 'SCREENSHOT_SELECTION_CANCELLED') {
      console.log('[Network Capture] Relaying selection cancelled');
      chrome.runtime.sendMessage({
        type: 'SCREENSHOT_SELECTION_CANCELLED'
      }).then(function(response) {
        console.log('[Network Capture] Cancellation message sent successfully');
      }).catch(function(err) {
        console.error('[Network Capture] Could not send cancellation:', err);
      });
    }
    
    // Handle crop copy success/error messages (relay to side panel)
    if (event.data && (event.data.type === 'CROP_COPY_SUCCESS' || event.data.type === 'CROP_COPY_ERROR')) {
      console.log('[Network Capture] Relaying crop copy message:', event.data.type);
      chrome.runtime.sendMessage({
        type: event.data.type,
        error: event.data.error
      }).catch(function(err) {
        console.error('[Network Capture] Error relaying crop copy message:', err);
      });
    }
  });
  
  // Listen for messages from background/side panel
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'START_SCREENSHOT_SELECTION') {
      // Forward to page context via postMessage
      window.postMessage({ type: 'START_SCREENSHOT_SELECTION' }, '*');
      sendResponse({ success: true });
    }
    if (message.type === 'STOP_SCREENSHOT_SELECTION') {
      window.postMessage({ type: 'STOP_SCREENSHOT_SELECTION' }, '*');
      sendResponse({ success: true });
    }
    if (message.type === 'ENABLE_CONSOLE_INTERCEPTION') {
      // Enable console interception in injected script
      window.postMessage({ type: 'ENABLE_CONSOLE_INTERCEPTION', enabled: message.enabled !== false }, '*');
      sendResponse({ success: true });
    }
    if (message.type === 'DISABLE_CONSOLE_INTERCEPTION') {
      // Disable console interception in injected script
      window.postMessage({ type: 'ENABLE_CONSOLE_INTERCEPTION', enabled: false }, '*');
      sendResponse({ success: true });
    }
    return true;
  });
  
  // Check monitoring state on load and periodically
  function checkMonitoringState() {
    try {
      // Ask background script if this tab is monitored (safer than using chrome.tabs.query)
      chrome.runtime.sendMessage({ type: 'IS_TAB_MONITORED' }, (response) => {
        if (chrome.runtime.lastError) {
          // Disable interception on error
          window.postMessage({ 
            type: 'ENABLE_CONSOLE_INTERCEPTION', 
            enabled: false 
          }, '*');
          return;
        }
        
        const isMonitored = response && response.isMonitored === true;
        
        // Enable/disable interception based on monitoring state
        window.postMessage({ 
          type: 'ENABLE_CONSOLE_INTERCEPTION', 
          enabled: isMonitored 
        }, '*');
      });
    } catch (error) {
      // Disable interception on any error
      window.postMessage({ 
        type: 'ENABLE_CONSOLE_INTERCEPTION', 
        enabled: false 
      }, '*');
    }
  }
  
  // Check on load (after a brief delay to ensure runtime is ready)
  setTimeout(checkMonitoringState, 100);
  
  // Check periodically (every 2 seconds)
  setInterval(checkMonitoringState, 2000);
})();
