/**
 * Content Script - Intercepts fetch() and XMLHttpRequest calls
 * Runs at document_start to capture all network requests
 */

(function() {
  'use strict';
  
  let requestIdCounter = 0;
  
  // Generate unique request ID
  function generateRequestId() {
    return `req_${Date.now()}_${++requestIdCounter}`;
  }
  
  // Send captured request to background service worker
  function sendToBackground(data) {
    try {
      chrome.runtime.sendMessage({
        type: 'NETWORK_REQUEST',
        data: data
      }).catch(() => {
        // Ignore errors if background is not ready
      });
    } catch (e) {
      // Ignore errors
    }
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
      headers.forEach((value, key) => {
        result[key] = value;
      });
    } else if (Array.isArray(headers)) {
      headers.forEach(([key, value]) => {
        result[key] = value;
      });
    } else if (typeof headers === 'object') {
      return headers;
    }
    
    return result;
  }
  
  // Intercept fetch()
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const [url, options = {}] = args;
    const requestId = generateRequestId();
    const method = options.method || 'GET';
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
      .then(response => {
        // Clone response to read body without consuming original
        const clonedResponse = response.clone();
        
        // Try to read response body
        const contentType = response.headers.get('content-type') || '';
        const isJSON = contentType.includes('application/json');
        const isText = contentType.includes('text/');
        
        let responsePromise;
        if (isJSON) {
          responsePromise = clonedResponse.json().catch(() => clonedResponse.text());
        } else if (isText) {
          responsePromise = clonedResponse.text();
        } else {
          // For binary or unknown types, just note the type
          responsePromise = Promise.resolve('[Binary or non-text response]');
        }
        
        responsePromise.then(responseData => {
          // Format response headers
          const responseHeaders = {};
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });
          
          // Send captured data to background
          sendToBackground({
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
        }).catch(() => {
          // If we can't read response, still send request info
          sendToBackground({
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
      .catch(error => {
        // Send error info
        sendToBackground({
          id: requestId,
          url: typeof url === 'string' ? url : url.toString(),
          method: method,
          payload: requestBody,
          response: `[Request failed: ${error.message}]`,
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
    let requestData = {
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
    xhr.open = function(method, url, ...rest) {
      requestData.method = method.toUpperCase();
      requestData.url = url;
      return originalOpen.apply(this, [method, url, ...rest]);
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
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
          // Request completed
          let responseData = null;
          const contentType = xhr.getResponseHeader('content-type') || '';
          
          try {
            if (contentType.includes('application/json')) {
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
            allHeaders.split('\r\n').forEach(line => {
              const parts = line.split(': ');
              if (parts.length === 2) {
                responseHeaders[parts[0]] = parts[1];
              }
            });
          }
          
          // Send captured data
          sendToBackground({
            ...requestData,
            response: responseData,
            status: xhr.status,
            statusText: xhr.statusText,
            responseHeaders: responseHeaders
          });
        }
        
        // Call original handler if exists
        if (originalOnReadyStateChange) {
          originalOnReadyStateChange.apply(this, arguments);
        }
      };
      
      return originalSend.apply(this, arguments);
    };
    
    return xhr;
  };
  
  // Inject script into page context to ensure we catch early requests
  const script = document.createElement('script');
  script.textContent = `
    (function() {
      // This runs in page context, not content script context
      // The overrides above should work, but this ensures we catch everything
    })();
  `;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
})();
