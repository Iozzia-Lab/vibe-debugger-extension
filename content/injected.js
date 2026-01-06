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
  
  // Send captured request to content script via postMessage
  function sendToContentScript(data) {
    window.postMessage({
      type: 'NETWORK_CAPTURE_REQUEST',
      data: data
    }, '*');
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
  
  // Debug: Log that injection worked
  console.log('[Network Capture] Injection successful - intercepting fetch and XHR');
})();
