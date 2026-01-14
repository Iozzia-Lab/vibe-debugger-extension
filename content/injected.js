/**
 * Injected Script - Runs in page context (not isolated world)
 * This intercepts fetch() and XMLHttpRequest in the actual page context
 */

(function() {
  'use strict';
  
  // Prevent double injection
  if (window.__NETWORK_CAPTURE_INJECTED) {
    return;
  }
  
  // Check if current page is a CAPTCHA-related page or security-sensitive
  // If so, don't inject at all to avoid interference
  function isCaptchaPageCheck() {
    try {
      const hostname = window.location.hostname.toLowerCase();
      const pathname = window.location.pathname.toLowerCase();
      const fullUrl = (hostname + pathname).toLowerCase();
      
      const captchaPatterns = [
        'recaptcha',
        'hcaptcha',
        'funcaptcha',
        'cloudflare.com/challenges',
        'challenges.cloudflare.com',
        'twilio.com', // Twilio login pages
        'auth0.com', // Common 2FA provider
        'okta.com', // Common 2FA provider
        'duo.com', // Common 2FA provider
        'microsoft.com/identity', // Microsoft 2FA
        'accounts.google.com', // Google 2FA
        'login.microsoftonline.com' // Microsoft 2FA
      ];
      
      for (let i = 0; i < captchaPatterns.length; i++) {
        if (fullUrl.indexOf(captchaPatterns[i]) !== -1) {
          return true;
        }
      }
      
      return false;
    } catch (e) {
      return false;
    }
  }
  
  // Exit early if this is a CAPTCHA/2FA page
  if (isCaptchaPageCheck()) {
    return;
  }
  
  window.__NETWORK_CAPTURE_INJECTED = true;
  
  // Generate unique request ID
  let requestIdCounter = 0;
  function generateRequestId() {
    return 'req_' + Date.now() + '_' + (++requestIdCounter);
  }
  
  // Generate unique log ID
  let logIdCounter = 0;
  function generateLogId() {
    return 'log_' + Date.now() + '_' + (++logIdCounter);
  }
  
  // Flag to track if this tab is monitored (for network interception)
  let isTabMonitored = false;
  
  // Send captured request to content script via postMessage
  // Only send if tab is monitored to avoid interference with other sites
  function sendToContentScript(data) {
    // Skip if on CAPTCHA page
    if (isCaptchaPage()) {
      return;
    }
    
    // Only send network requests if tab is monitored
    if (!isTabMonitored) {
      return;
    }
    
    window.postMessage({
      type: 'NETWORK_CAPTURE_REQUEST',
      data: data
    }, '*');
  }
  
  // Send captured console log to content script via postMessage
  // Note: Background service worker filters by monitoredTabId, so we send from all tabs
  // but only data from monitored tab is stored/returned. Also skip CAPTCHA pages.
  function sendConsoleLogToContentScript(data) {
    // Skip if on CAPTCHA page
    if (isCaptchaPage()) {
      return;
    }
    
    window.postMessage({
      type: 'CONSOLE_CAPTURE_LOG',
      data: data
    }, '*');
  }
  
  // Format console arguments for storage
  function formatConsoleArgs(args) {
    return Array.prototype.slice.call(args).map(function(arg) {
      if (arg === null) return null;
      if (arg === undefined) return undefined;
      if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
        return arg;
      }
      if (arg instanceof Error) {
        return {
          type: 'Error',
          message: arg.message,
          stack: arg.stack,
          name: arg.name
        };
      }
      // Try to serialize objects/arrays
      try {
        return JSON.parse(JSON.stringify(arg));
      } catch (e) {
        return String(arg);
      }
    });
  }
  
  // Try to parse JSON, return original if fails
  function tryParseJSON(str) {
    try {
      return JSON.parse(str);
    } catch (e) {
      return str;
    }
  }
  
  // Format headers object from Headers or array
  function formatHeaders(headers) {
    if (!headers) return {};
    
    const result = {};
    
    if (headers instanceof Headers) {
      headers.forEach(function(value, key) {
        result[key] = value;
      });
    } else if (Array.isArray(headers)) {
      headers.forEach(function(item) {
        if (Array.isArray(item) && item.length >= 2) {
          result[item[0]] = item[1];
        }
      });
    } else if (typeof headers === 'object') {
      return headers;
    }
    
    return result;
  }
  
  // Check if URL should be excluded from interception (CAPTCHA, security-sensitive)
  function shouldExcludeRequest(url) {
    if (!url) return false;
    
    const urlString = typeof url === 'string' ? url : url.toString();
    const urlLower = urlString.toLowerCase();
    
    // CAPTCHA-related domains and paths
    const exclusionPatterns = [
      'recaptcha',
      'hcaptcha',
      'funcaptcha',
      'cloudflare.com/challenges',
      'googleapis.com/recaptcha',
      'gstatic.com/recaptcha',
      'twilio.com', // Twilio uses CAPTCHA for login
      'cloudflare.com/api/v4', // Cloudflare API endpoints
      'challenges.cloudflare.com',
      'auth0.com', // Common 2FA provider
      'okta.com', // Common 2FA provider
      'duo.com', // Common 2FA provider
      'microsoft.com/identity', // Microsoft 2FA
      'accounts.google.com', // Google 2FA
      'login.microsoftonline.com' // Microsoft 2FA
    ];
    
    // Check if URL matches any exclusion pattern
    for (let i = 0; i < exclusionPatterns.length; i++) {
      if (urlLower.indexOf(exclusionPatterns[i]) !== -1) {
        return true;
      }
    }
    
    return false;
  }
  
  // Check if current page is a CAPTCHA-related page or security-sensitive
  function isCaptchaPage() {
    try {
      const hostname = window.location.hostname.toLowerCase();
      const pathname = window.location.pathname.toLowerCase();
      const fullUrl = (hostname + pathname).toLowerCase();
      
      const captchaPatterns = [
        'recaptcha',
        'hcaptcha',
        'funcaptcha',
        'cloudflare.com/challenges',
        'challenges.cloudflare.com',
        'twilio.com', // Twilio login pages
        'auth0.com', // Common 2FA provider
        'okta.com', // Common 2FA provider
        'duo.com', // Common 2FA provider
        'microsoft.com/identity', // Microsoft 2FA
        'accounts.google.com', // Google 2FA
        'login.microsoftonline.com' // Microsoft 2FA
      ];
      
      for (let i = 0; i < captchaPatterns.length; i++) {
        if (fullUrl.indexOf(captchaPatterns[i]) !== -1) {
          return true;
        }
      }
      
      return false;
    } catch (e) {
      return false;
    }
  }
  
  // Store original fetch and XHR (before any interception)
  const originalFetch = window.fetch;
  const OriginalXHR = window.XMLHttpRequest;
  
  // Wrapped fetch function (only used when monitoring is active)
  function wrappedFetch() {
    const args = Array.prototype.slice.call(arguments);
    const url = args[0];
    
    // Skip interception for CAPTCHA and security-sensitive requests
    // Also skip if we're on a CAPTCHA page
    if (shouldExcludeRequest(url) || isCaptchaPage()) {
      return originalFetch.apply(this, args);
    }
    
    const options = args[1] || {};
    const requestId = generateRequestId();
    const method = (options.method || 'GET').toUpperCase();
    const requestHeaders = formatHeaders(options.headers);
    
    let requestBody = null;
    if (options.body) {
      if (typeof options.body === 'string') {
        requestBody = tryParseJSON(options.body);
      } else if (options.body instanceof FormData) {
        requestBody = '[FormData]';
      } else if (options.body instanceof Blob) {
        requestBody = '[Blob]';
      } else {
        requestBody = options.body;
      }
    }
    
    const timestamp = Date.now();
    
    // Send pending request immediately
    sendToContentScript({
      id: requestId,
      url: typeof url === 'string' ? url : url.toString(),
      method: method,
      payload: requestBody,
      response: null,
      status: null,
      statusText: 'Pending',
      requestHeaders: requestHeaders,
      responseHeaders: {},
      timestamp: timestamp,
      pending: true
    });
    
    // Execute original fetch
    return originalFetch.apply(this, args)
      .then(function(response) {
        // Clone response to read body without consuming original
        const clonedResponse = response.clone();
        
        // Try to read response body
        const contentType = response.headers.get('content-type') || '';
        const isJSON = contentType.indexOf('application/json') !== -1;
        const isText = contentType.indexOf('text/') !== -1;
        
        let responsePromise;
        if (isJSON) {
          responsePromise = clonedResponse.json().catch(function() {
            return clonedResponse.text();
          });
        } else if (isText) {
          responsePromise = clonedResponse.text();
        } else {
          // For binary or unknown types, just note the type
          responsePromise = Promise.resolve('[Binary or non-text response]');
        }
        
        responsePromise.then(function(responseData) {
          // Format response headers
          const responseHeaders = {};
          response.headers.forEach(function(value, key) {
            responseHeaders[key] = value;
          });
          
          // Send captured data (update existing pending request)
          sendToContentScript({
            id: requestId,
            url: typeof url === 'string' ? url : url.toString(),
            method: method,
            payload: requestBody,
            response: responseData,
            status: response.status,
            statusText: response.statusText,
            requestHeaders: requestHeaders,
            responseHeaders: responseHeaders,
            timestamp: timestamp,
            pending: false
          });
        }).catch(function() {
          // If we can't read response, still send request info (update pending)
          sendToContentScript({
            id: requestId,
            url: typeof url === 'string' ? url : url.toString(),
            method: method,
            payload: requestBody,
            response: '[Unable to read response]',
            status: response.status,
            statusText: response.statusText,
            requestHeaders: requestHeaders,
            responseHeaders: {},
            timestamp: timestamp,
            pending: false
          });
        });
        
        return response;
      })
      .catch(function(error) {
        // Send error info
        sendToContentScript({
          id: requestId,
          url: typeof url === 'string' ? url : url.toString(),
          method: method,
          payload: requestBody,
          response: '[Request failed: ' + (error.message || 'Unknown error') + ']',
          status: 0,
          statusText: 'Error',
          requestHeaders: requestHeaders,
          responseHeaders: {},
          timestamp: timestamp
        });
        
        throw error;
      });
  };
  
  // Wrapped XMLHttpRequest constructor (only used when monitoring is active)
  function wrappedXMLHttpRequest() {
    const xhr = new OriginalXHR();
    const requestId = generateRequestId();
    const requestData = {
      id: requestId,
      url: '',
      method: 'GET',
      payload: null,
      requestHeaders: {},
      timestamp: Date.now(),
      excluded: false // Flag to track if this request should be excluded
    };
    
    const originalOpen = xhr.open;
    const originalSend = xhr.send;
    const originalSetRequestHeader = xhr.setRequestHeader;
    
    // Override open() to capture method and URL
    xhr.open = function(method, url) {
      requestData.method = (method || 'GET').toUpperCase();
      requestData.url = url;
      
      // Check if this URL should be excluded or if we're on a CAPTCHA page
      if (shouldExcludeRequest(url) || isCaptchaPage()) {
        requestData.excluded = true;
        // Don't override methods for excluded requests, just use originals
        return originalOpen.apply(this, arguments);
      }
      
      const rest = Array.prototype.slice.call(arguments, 2);
      return originalOpen.apply(this, [method, url].concat(rest));
    };
    
    // Override setRequestHeader() to capture headers
    xhr.setRequestHeader = function(header, value) {
      // Skip capturing headers for excluded requests
      if (!requestData.excluded) {
        requestData.requestHeaders[header] = value;
      }
      return originalSetRequestHeader.apply(this, arguments);
    };
    
    // Override send() to capture body and response
    xhr.send = function(body) {
      // Skip interception for excluded requests
      if (requestData.excluded) {
        return originalSend.apply(this, arguments);
      }
      
      // Capture request body
      if (body) {
        if (typeof body === 'string') {
          requestData.payload = tryParseJSON(body);
        } else if (body instanceof FormData) {
          requestData.payload = '[FormData]';
        } else if (body instanceof Blob) {
          requestData.payload = '[Blob]';
        } else {
          requestData.payload = body;
        }
      }
      
      // Send pending request immediately
      sendToContentScript({
        id: requestData.id,
        url: requestData.url,
        method: requestData.method,
        payload: requestData.payload,
        response: null,
        status: null,
        statusText: 'Pending',
        requestHeaders: requestData.requestHeaders,
        responseHeaders: {},
        timestamp: requestData.timestamp,
        pending: true
      });
      
      // Capture response when ready
      const originalOnReadyStateChange = xhr.onreadystatechange;
      const originalOnLoad = xhr.onload;
      const originalOnError = xhr.onerror;
      
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
          // Request completed
          let responseData = null;
          const contentType = xhr.getResponseHeader('content-type') || '';
          
          try {
            if (contentType.indexOf('application/json') !== -1) {
              responseData = tryParseJSON(xhr.responseText);
            } else {
              responseData = xhr.responseText || xhr.response;
            }
          } catch (e) {
            responseData = '[Unable to parse response]';
          }
          
          // Format response headers
          const responseHeaders = {};
          const allHeaders = xhr.getAllResponseHeaders();
          if (allHeaders) {
            allHeaders.split('\r\n').forEach(function(line) {
              if (line.trim()) {
                const parts = line.split(': ');
                if (parts.length >= 2) {
                  responseHeaders[parts[0]] = parts.slice(1).join(': ');
                }
              }
            });
          }
          
          // Send captured data (update pending request)
          sendToContentScript({
            id: requestData.id,
            url: requestData.url,
            method: requestData.method,
            payload: requestData.payload,
            response: responseData,
            status: xhr.status,
            statusText: xhr.statusText,
            requestHeaders: requestData.requestHeaders,
            responseHeaders: responseHeaders,
            timestamp: requestData.timestamp,
            pending: false
          });
        }
        
        // Call original handler if exists
        if (originalOnReadyStateChange) {
          originalOnReadyStateChange.apply(this, arguments);
        }
      };
      
      if (originalOnLoad) {
        xhr.onload = originalOnLoad;
      }
      if (originalOnError) {
        xhr.onerror = function() {
          // Update pending request with error
          sendToContentScript({
            id: requestData.id,
            url: requestData.url,
            method: requestData.method,
            payload: requestData.payload,
            response: '[Request failed]',
            status: 0,
            statusText: 'Error',
            requestHeaders: requestData.requestHeaders,
            responseHeaders: {},
            timestamp: requestData.timestamp,
            pending: false
          });
          originalOnError.apply(this, arguments);
        };
      } else {
        xhr.onerror = function() {
          // Update pending request with error
          sendToContentScript({
            id: requestData.id,
            url: requestData.url,
            method: requestData.method,
            payload: requestData.payload,
            response: '[Request failed]',
            status: 0,
            statusText: 'Error',
            requestHeaders: requestData.requestHeaders,
            responseHeaders: {},
            timestamp: requestData.timestamp,
            pending: false
          });
        };
      }
      
      return originalSend.apply(this, arguments);
    };
    
    return xhr;
  };
  
  // Store original console methods (before any interception)
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug
  };
  
  // Flag to track if console interception is active (only intercept when tab is monitored)
  let isConsoleInterceptionActive = false;
  
  // Helper function to intercept console method (only if interception is active)
  function interceptConsoleMethod(methodName, originalMethod) {
    console[methodName] = function() {
      // Call original method first (always)
      originalMethod.apply(console, arguments);
      
      // Only capture if interception is active (tab is monitored)
      if (!isConsoleInterceptionActive) {
        return;
      }
      
      // Capture the log
      const logId = generateLogId();
      const timestamp = Date.now();
      const args = formatConsoleArgs(arguments);
      
      // Try to get stack trace for errors
      let stack = null;
      if (methodName === 'error' || methodName === 'warn') {
        try {
          throw new Error();
        } catch (e) {
          stack = e.stack;
        }
      }
      
      // Send to content script
      sendConsoleLogToContentScript({
        id: logId,
        level: methodName,
        message: args.length > 0 ? String(args[0]) : '',
        args: args,
        timestamp: timestamp,
        stack: stack
      });
    };
  }
  
  // Function to enable console interception (only wrap when needed)
  function enableConsoleInterception() {
    if (isConsoleInterceptionActive) {
      return; // Already enabled
    }
    isConsoleInterceptionActive = true;
    interceptConsoleMethod('log', originalConsole.log);
    interceptConsoleMethod('error', originalConsole.error);
    interceptConsoleMethod('warn', originalConsole.warn);
    interceptConsoleMethod('info', originalConsole.info);
    interceptConsoleMethod('debug', originalConsole.debug);
  }
  
  // Function to disable console interception (restore originals)
  function disableConsoleInterception() {
    if (!isConsoleInterceptionActive) {
      return; // Already disabled
    }
    isConsoleInterceptionActive = false;
    console.log = originalConsole.log;
    console.error = originalConsole.error;
    console.warn = originalConsole.warn;
    console.info = originalConsole.info;
    console.debug = originalConsole.debug;
  }
  
  // Listen for messages from content script to enable/disable interception
  window.addEventListener('message', function(event) {
    // Only accept messages from the same window
    if (event.source !== window) {
      return;
    }
    
    if (event.data && event.data.type === 'ENABLE_CONSOLE_INTERCEPTION') {
      const enabled = event.data.enabled === true;
      isTabMonitored = enabled; // Also use this for network interception
      
      if (enabled) {
        enableConsoleInterception();
        enableNetworkInterception();
      } else {
        disableConsoleInterception();
        disableNetworkInterception();
      }
    }
  });
  
  // Function to enable network interception (fetch and XHR)
  function enableNetworkInterception() {
    window.fetch = wrappedFetch;
    window.XMLHttpRequest = wrappedXMLHttpRequest;
  }
  
  // Function to disable network interception (restore originals)
  function disableNetworkInterception() {
    window.fetch = originalFetch;
    window.XMLHttpRequest = OriginalXHR;
  }
  
  // By default, don't intercept network requests (only when monitoring is enabled)
  // Network interception will be enabled when monitoring starts
  
  // Generate XPath from DOM element
  function getXPath(element) {
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }
    const parts = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let index = 1;
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === current.tagName) index++;
        sibling = sibling.previousElementSibling;
      }
      const tagName = current.tagName.toLowerCase();
      parts.unshift(`${tagName}[${index}]`);
      current = current.parentElement;
    }
    return '/' + parts.join('/');
  }
  
  // Extract element label/text
  function getElementLabel(element) {
    // Try aria-label first
    if (element.getAttribute('aria-label')) {
      return element.getAttribute('aria-label').trim();
    }
    // Try title
    if (element.title) {
      return element.title.trim();
    }
    // Try text content
    const text = element.innerText || element.textContent;
    if (text && text.trim()) {
      const trimmed = text.trim();
      return trimmed.length > 100 ? trimmed.substring(0, 100) + '...' : trimmed;
    }
    // Try value (for inputs, buttons)
    if (element.value) {
      return element.value.trim();
    }
    // Try alt (for images)
    if (element.alt) {
      return element.alt.trim();
    }
    // Fallback to tag name
    return element.tagName.toLowerCase();
  }
  
  // Format click comment string
  function formatClickComment(element) {
    const label = getElementLabel(element);
    const xpath = getXPath(element);
    const id = element.id || 'none';
    const classes = element.className && typeof element.className === 'string' 
      ? element.className.trim() 
      : (element.classList && element.classList.length > 0 
          ? Array.from(element.classList).join(' ') 
          : 'none');
    
    return `// clicked on ${label} | XPath: ${xpath} | ID: ${id} | Classes: ${classes}`;
  }
  
  // Click event handler
  function handleClick(event) {
    try {
      // Only capture clicks if tab is monitored
      if (!isTabMonitored) {
        return;
      }
      
      // Skip click logging on CAPTCHA pages to avoid interference
      if (isCaptchaPage()) {
        return;
      }
      
      const element = event.target;
      
      // Skip if clicking on our own injected elements (if any)
      if (!element || element.nodeType !== Node.ELEMENT_NODE) {
        return;
      }
      
      // Format and log comment
      const comment = formatClickComment(element);
      
      // Log through console.log (our intercepted version) which will be captured
      console.log(comment);
    } catch (e) {
      // Silently fail - don't interfere with page functionality
    }
  }
  
  
  // Track if listener is already attached
  let clickListenerAttached = false;
  
  // Add click event listener (always attach, but handler checks if monitored)
  function setupClickCapture() {
    if (clickListenerAttached) {
      return; // Already attached
    }
    
    try {
      // Use document with capture phase to catch all clicks
      // Handler will check isTabMonitored before capturing
      document.addEventListener('click', handleClick, true);
      clickListenerAttached = true;
      // Don't log this - it's too noisy and happens on all pages
    } catch (e) {
      // Silently fail - don't interfere with page
    }
  }
  
  // Try to attach immediately (works at document_start)
  setupClickCapture();
  
  // Also attach when DOM is ready (backup)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupClickCapture, { once: true });
  }
  
  // Also try when window loads (final backup)
  window.addEventListener('load', setupClickCapture, { once: true });
  
  // Don't log injection success - it's too noisy and happens on all pages
})();
