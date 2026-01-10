/**
 * Injected Script - Runs in page context (not isolated world)
 * This intercepts fetch() and XMLHttpRequest in the actual page context
 */

(function() {
  'use strict';
  
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
  
  // Send captured request to content script via postMessage
  function sendToContentScript(data) {
    window.postMessage({
      type: 'NETWORK_CAPTURE_REQUEST',
      data: data
    }, '*');
  }
  
  // Send captured console log to content script via postMessage
  function sendConsoleLogToContentScript(data) {
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
  
  // Intercept fetch()
  const originalFetch = window.fetch;
  window.fetch = function() {
    const args = Array.prototype.slice.call(arguments);
    const url = args[0];
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
          
          // Send captured data
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
            timestamp: timestamp
          });
        }).catch(function() {
          // If we can't read response, still send request info
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
            timestamp: timestamp
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
  
  // Intercept XMLHttpRequest
  const OriginalXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = function() {
    const xhr = new OriginalXHR();
    const requestId = generateRequestId();
    const requestData = {
      id: requestId,
      url: '',
      method: 'GET',
      payload: null,
      requestHeaders: {},
      timestamp: Date.now()
    };
    
    const originalOpen = xhr.open;
    const originalSend = xhr.send;
    const originalSetRequestHeader = xhr.setRequestHeader;
    
    // Override open() to capture method and URL
    xhr.open = function(method, url) {
      requestData.method = (method || 'GET').toUpperCase();
      requestData.url = url;
      const rest = Array.prototype.slice.call(arguments, 2);
      return originalOpen.apply(this, [method, url].concat(rest));
    };
    
    // Override setRequestHeader() to capture headers
    xhr.setRequestHeader = function(header, value) {
      requestData.requestHeaders[header] = value;
      return originalSetRequestHeader.apply(this, arguments);
    };
    
    // Override send() to capture body and response
    xhr.send = function(body) {
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
          
          // Send captured data
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
            timestamp: requestData.timestamp
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
        xhr.onerror = originalOnError;
      }
      
      return originalSend.apply(this, arguments);
    };
    
    return xhr;
  };
  
  // Intercept console methods
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug
  };
  
  // Helper function to intercept console method
  function interceptConsoleMethod(methodName, originalMethod) {
    console[methodName] = function() {
      // Call original method first
      originalMethod.apply(console, arguments);
      
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
  
  // Intercept all console methods
  interceptConsoleMethod('log', originalConsole.log);
  interceptConsoleMethod('error', originalConsole.error);
  interceptConsoleMethod('warn', originalConsole.warn);
  interceptConsoleMethod('info', originalConsole.info);
  interceptConsoleMethod('debug', originalConsole.debug);
  
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
      // Log error but don't break page functionality
      if (originalConsole && originalConsole.error) {
        originalConsole.error('[Network Capture] Error capturing click:', e, e.stack);
      }
    }
  }
  
  
  // Track if listener is already attached
  let clickListenerAttached = false;
  
  // Add click event listener
  function setupClickCapture() {
    if (clickListenerAttached) {
      return; // Already attached
    }
    
    try {
      // Use document with capture phase to catch all clicks
      document.addEventListener('click', handleClick, true);
      clickListenerAttached = true;
      originalConsole.log('[Network Capture] Click listener attached');
    } catch (e) {
      originalConsole.error('[Network Capture] Failed to attach click listener:', e);
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
  
  // Debug: Log that injection worked
  originalConsole.log('[Network Capture] Injection successful - intercepting fetch, XHR, console, and clicks');
})();
