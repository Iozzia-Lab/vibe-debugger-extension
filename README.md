# Network Capture Inspector Extension

A Chrome browser extension (Manifest V3) that acts as a developer inspector tool to capture and inspect XHR/Fetch network requests. Capture API calls, view request payloads and responses, all in a clean popup interface.

## Features

- **Automatic Request Capture**: Automatically intercepts and captures all XHR/Fetch requests on any webpage
- **Request List View**: See all captured requests with method, URL, status, and timestamp
- **Detailed Request View**: View full request details including:
  - Complete URL
  - Request method and status
  - Request payload (formatted JSON)
  - Response data (formatted JSON)
  - Request and response headers (toggleable)
- **Search & Filter**: Search requests by URL or method
- **Copy to Clipboard**: Copy any request data (URL, payload, response, headers)
- **Clear All**: Clear all captured requests with one click
- **Real-time Updates**: Requests are captured in real-time as you browse

## Installation

### Load as Unpacked Extension (Development)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `network-capture-extension` folder
5. The extension icon should appear in your toolbar

### Using the Extension

1. Click the extension icon in your Chrome toolbar
2. Navigate to any website - requests will be automatically captured
3. Click the extension icon again to view captured requests
4. Click on any request to see detailed information
5. Use the search box to filter requests
6. Toggle "Show Headers" to view request/response headers
7. Use "Copy" buttons to copy data to clipboard

## File Structure

```
network-capture-extension/
├── manifest.json                 # Extension manifest (Manifest V3)
├── background/
│   └── service-worker.js        # Background service worker
├── content/
│   └── content-script.js        # Content script to intercept requests
├── popup/
│   ├── popup.html               # Popup UI HTML
│   ├── popup.css                # Popup styling
│   └── popup.js                 # Popup logic and data display
├── icons/
│   ├── icon16.png               # 16x16 icon
│   ├── icon48.png               # 48x48 icon
│   └── icon128.png              # 128x128 icon
└── README.md                    # This file
```

## How It Works

### Request Interception

The extension uses a content script that runs at `document_start` to intercept network requests:

1. **Fetch API Interception**: Overrides `window.fetch()` to capture fetch requests
2. **XMLHttpRequest Interception**: Overrides `XMLHttpRequest` to capture XHR requests
3. Both methods capture:
   - Request URL, method, headers, and body
   - Response data, status, and headers
   - Timestamp

### Data Storage

- Requests are stored in memory in the background service worker
- Limited to the last 200 requests to prevent memory issues
- Data is cleared when extension is reloaded or browser is closed

### UI Components

- **List View**: Shows all captured requests in a scrollable list
- **Detail View**: Shows complete request/response information
- **Search**: Filters requests by URL or method
- **Headers Toggle**: Shows/hides request and response headers

## Limitations

- **CORS Restrictions**: Some cross-origin responses may not be readable due to browser security
- **Large Responses**: Very large payloads may impact performance (consider truncating)
- **Memory**: Limited to 200 requests (most recent)
- **Service Worker**: Background service worker may sleep when not in use (requests still captured)
- **Binary Data**: Binary responses are not fully captured (noted as binary)

## Browser Compatibility

- Chrome/Chromium (Manifest V3)
- Edge (Chromium-based)
- Other Chromium-based browsers

## Development

### Making Changes

1. Edit the relevant files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Test your changes

### Debugging

- **Content Script**: Use browser DevTools on the webpage (console will show content script logs)
- **Service Worker**: Right-click extension icon → "Inspect popup" → Go to "Service Worker" tab
- **Popup**: Right-click extension icon → "Inspect popup"

## Permissions

- `activeTab`: Access to the active tab to inject content script
- `storage`: Optional storage for persisting requests (currently not used)
- `scripting`: Required for content script injection
- `host_permissions`: Required to capture requests from all URLs

## Security & Privacy

- Extension only captures data from pages you actively visit
- All data is stored locally in the browser
- No data is sent to external servers
- Extension requires explicit user permission to access tabs

## Troubleshooting

### Requests Not Appearing

1. Make sure you're on a page that makes XHR/Fetch requests
2. Refresh the page after installing the extension
3. Check browser console for errors
4. Reload the extension in `chrome://extensions/`

### Can't Read Response

- Some responses may be blocked by CORS policies
- Binary responses are not fully captured
- Very large responses may be truncated

### Extension Not Working

1. Check that extension is enabled in `chrome://extensions/`
2. Reload the extension
3. Check browser console for errors
4. Make sure you're using a Chromium-based browser

## License

This extension is provided as-is for development and debugging purposes.

## Version

1.0.0
