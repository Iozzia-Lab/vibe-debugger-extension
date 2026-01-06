/**
 * Popup Script - Handles UI interactions and data display
 */

let allRequests = [];
let filteredRequests = [];
let currentDetailRequest = null;

// DOM Elements
const requestList = document.getElementById('requestList');
const listView = document.getElementById('listView');
const detailView = document.getElementById('detailView');
const requestCount = document.getElementById('requestCount');
const searchInput = document.getElementById('searchInput');
const clearBtn = document.getElementById('clearBtn');
const backBtn = document.getElementById('backBtn');
const showHeadersCheckbox = document.getElementById('showHeaders');
const showHeadersDetailCheckbox = document.getElementById('showHeadersDetail');
const searchSection = document.getElementById('searchSection');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadRequests();
    setupEventListeners();
    
    // Refresh requests periodically
    setInterval(loadRequests, 1000);
});

// Setup event listeners
function setupEventListeners() {
    clearBtn.addEventListener('click', clearAllRequests);
    backBtn.addEventListener('click', showListView);
    searchInput.addEventListener('input', filterRequests);
    
    // Sync both checkboxes and toggle headers
    showHeadersCheckbox.addEventListener('change', () => {
        if (showHeadersDetailCheckbox) {
            showHeadersDetailCheckbox.checked = showHeadersCheckbox.checked;
        }
        toggleHeaders();
    });
    
    if (showHeadersDetailCheckbox) {
        showHeadersDetailCheckbox.addEventListener('change', () => {
            showHeadersCheckbox.checked = showHeadersDetailCheckbox.checked;
            toggleHeaders();
        });
    }
    
    // Copy buttons (delegated)
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('btn-copy')) {
            const copyType = e.target.getAttribute('data-copy');
            copyToClipboard(copyType);
        }
    });
}

// Load requests from background service worker
function loadRequests() {
    chrome.runtime.sendMessage({ type: 'GET_REQUESTS' }, (response) => {
        if (response && response.requests) {
            allRequests = response.requests;
            filteredRequests = allRequests;
            updateRequestCount();
            renderRequestList();
        }
    });
}

// Update request count display
function updateRequestCount() {
    const count = filteredRequests.length;
    requestCount.textContent = `${count} request${count !== 1 ? 's' : ''}`;
}

// Filter requests by search term
function filterRequests() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    
    if (!searchTerm) {
        filteredRequests = allRequests;
    } else {
        filteredRequests = allRequests.filter(req => {
            return req.url.toLowerCase().includes(searchTerm) ||
                   req.method.toLowerCase().includes(searchTerm);
        });
    }
    
    renderRequestList();
    updateRequestCount();
}

// Render request list
function renderRequestList() {
    if (filteredRequests.length === 0) {
        requestList.innerHTML = `
            <div class="empty-state">
                <p>No requests found.</p>
                ${searchInput.value ? '<p class="hint">Try a different search term.</p>' : ''}
            </div>
        `;
        return;
    }
    
    requestList.innerHTML = filteredRequests.map(req => {
        const statusClass = getStatusClass(req.status);
        const methodClass = req.method.toLowerCase();
        const timeStr = formatTimestamp(req.timestamp);
        
        return `
            <div class="request-item" data-request-id="${req.id}">
                <div class="request-item-header">
                    <span class="request-method ${methodClass}">${req.method}</span>
                    <span class="request-url" title="${escapeHtml(req.url)}">${escapeHtml(truncateUrl(req.url))}</span>
                </div>
                <div class="request-meta">
                    <span class="request-status ${statusClass}">${req.status} ${req.statusText || ''}</span>
                    <span>${timeStr}</span>
                </div>
            </div>
        `;
    }).join('');
    
    // Add click listeners to request items
    requestList.querySelectorAll('.request-item').forEach(item => {
        item.addEventListener('click', () => {
            const requestId = item.getAttribute('data-request-id');
            const request = filteredRequests.find(r => r.id === requestId);
            if (request) {
                showDetailView(request);
            }
        });
    });
}

// Show detail view for a request
function showDetailView(request) {
    currentDetailRequest = request;
    listView.classList.add('hidden');
    detailView.classList.remove('hidden');
    searchSection.classList.add('hidden');
    
    // Sync checkbox state
    if (showHeadersDetailCheckbox && showHeadersCheckbox) {
        showHeadersDetailCheckbox.checked = showHeadersCheckbox.checked;
    }
    
    // Populate detail view
    document.getElementById('detailUrl').textContent = request.url;
    document.getElementById('detailMethod').textContent = request.method;
    document.getElementById('detailStatus').textContent = `${request.status} ${request.statusText || ''}`;
    document.getElementById('detailStatus').className = `meta-value status ${getStatusClass(request.status)}`;
    document.getElementById('detailTime').textContent = formatTimestamp(request.timestamp);
    
    // Request payload
    const payloadEl = document.getElementById('detailPayload');
    payloadEl.textContent = formatData(request.payload);
    
    // Response
    const responseEl = document.getElementById('detailResponse');
    responseEl.textContent = formatData(request.response);
    
    // Headers (if enabled)
    updateHeadersDisplay();
}

// Update headers display based on toggle
function updateHeadersDisplay() {
    if (!currentDetailRequest) return;
    
    // Get checked state from either checkbox (they should be synced)
    const showHeaders = showHeadersCheckbox ? showHeadersCheckbox.checked : 
                       (showHeadersDetailCheckbox ? showHeadersDetailCheckbox.checked : false);
    const requestHeadersSection = document.getElementById('requestHeadersSection');
    const responseHeadersSection = document.getElementById('responseHeadersSection');
    
    if (!requestHeadersSection || !responseHeadersSection) return;
    
    if (showHeaders) {
        requestHeadersSection.classList.remove('hidden');
        responseHeadersSection.classList.remove('hidden');
        
        document.getElementById('detailRequestHeaders').textContent = formatData(currentDetailRequest.requestHeaders);
        document.getElementById('detailResponseHeaders').textContent = formatData(currentDetailRequest.responseHeaders);
    } else {
        requestHeadersSection.classList.add('hidden');
        responseHeadersSection.classList.add('hidden');
    }
}

// Toggle headers visibility
function toggleHeaders() {
    updateHeadersDisplay();
}

// Show list view
function showListView() {
    listView.classList.remove('hidden');
    detailView.classList.add('hidden');
    searchSection.classList.remove('hidden');
    currentDetailRequest = null;
}

// Clear all requests
function clearAllRequests() {
    if (confirm('Clear all captured requests?')) {
        chrome.runtime.sendMessage({ type: 'CLEAR_REQUESTS' }, (response) => {
            if (response && response.success) {
                allRequests = [];
                filteredRequests = [];
                searchInput.value = '';
                updateRequestCount();
                renderRequestList();
            }
        });
    }
}

// Copy to clipboard
function copyToClipboard(type) {
    if (!currentDetailRequest) return;
    
    let text = '';
    
    switch (type) {
        case 'url':
            text = currentDetailRequest.url;
            break;
        case 'payload':
            text = formatData(currentDetailRequest.payload, true);
            break;
        case 'response':
            text = formatData(currentDetailRequest.response, true);
            break;
        case 'requestHeaders':
            text = formatData(currentDetailRequest.requestHeaders, true);
            break;
        case 'responseHeaders':
            text = formatData(currentDetailRequest.responseHeaders, true);
            break;
    }
    
    navigator.clipboard.writeText(text).then(() => {
        // Show feedback (optional - could add toast notification)
        const btn = document.querySelector(`[data-copy="${type}"]`);
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => {
            btn.textContent = originalText;
        }, 1000);
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

// Format data for display (JSON pretty-print if applicable)
function formatData(data, forCopy = false) {
    if (data === null || data === undefined) {
        return '[null]';
    }
    
    if (typeof data === 'string') {
        // Try to parse as JSON
        try {
            const parsed = JSON.parse(data);
            return JSON.stringify(parsed, null, forCopy ? 0 : 2);
        } catch (e) {
            return data;
        }
    }
    
    if (typeof data === 'object') {
        return JSON.stringify(data, null, forCopy ? 0 : 2);
    }
    
    return String(data);
}

// Format timestamp
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) {
        return `${Math.floor(diff / 1000)}s ago`;
    } else if (diff < 3600000) {
        return `${Math.floor(diff / 60000)}m ago`;
    } else {
        return date.toLocaleTimeString();
    }
}

// Get status class for styling
function getStatusClass(status) {
    if (status >= 200 && status < 300) {
        return 'success';
    } else if (status >= 400 && status < 500) {
        return 'client-error';
    } else if (status >= 500) {
        return 'error';
    }
    return '';
}

// Truncate URL for display
function truncateUrl(url, maxLength = 60) {
    if (url.length <= maxLength) {
        return url;
    }
    return url.substring(0, maxLength) + '...';
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
