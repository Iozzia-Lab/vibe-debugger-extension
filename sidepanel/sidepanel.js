/**
 * Popup Script - Handles UI interactions and data display
 */

let allRequests = [];
let filteredRequests = [];
let currentDetailRequest = null;
let currentFilter = 'all';
let isContextInvalidated = false;
let selectedRequestIds = new Set(); // Track selected request IDs
let currentTabId = null; // Track current tab ID

// DOM Elements
const requestList = document.getElementById('requestList');
const listView = document.getElementById('listView');
const detailView = document.getElementById('detailView');
const requestCount = document.getElementById('requestCount');
const searchInput = document.getElementById('searchInput');
const searchHistoryDropdown = document.getElementById('searchHistoryDropdown');
const recordBtn = document.getElementById('recordBtn');
const reloadBtn = document.getElementById('reloadBtn');
const clearBtn = document.getElementById('clearBtn');
const backBtn = document.getElementById('backBtn');
const showHeadersDetailCheckbox = document.getElementById('showHeadersDetail');
const searchSection = document.getElementById('searchSection');
const undockBtn = document.getElementById('undockBtn');
const projectsBtn = document.getElementById('projectsBtn');
const projectsModal = document.getElementById('projectsModal');
const projectsList = document.getElementById('projectsList');
const projectFormModal = document.getElementById('projectFormModal');
const projectForm = document.getElementById('projectForm');
const addProjectBtn = document.getElementById('addProjectBtn');
const closeProjectsModal = document.getElementById('closeProjectsModal');
const closeProjectFormModal = document.getElementById('closeProjectFormModal');
const cancelProjectForm = document.getElementById('cancelProjectForm');
const closePanelBtn = document.getElementById('closePanelBtn');
const copySelectedBtn = document.getElementById('copySelectedBtn');
const openConsoleViewerBtn = document.getElementById('openConsoleViewerBtn');
const copyConsoleCheckbox = document.getElementById('copyConsoleCheckbox');
const tabInfoSection = document.getElementById('tabInfoSection');
const tabFavicon = document.getElementById('tabFavicon');
const tabTitle = document.getElementById('tabTitle');
const tabUrl = document.getElementById('tabUrl');
let editingProjectId = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadFilterState();
    loadRecordingState();
    loadRequests();
    setupEventListeners();
    loadProjects();
    loadActiveTabInfo();
    updateCopySelectedButton();
    
    // Refresh requests periodically
    setInterval(loadRequests, 1000);
    
    // Refresh tab info periodically
    setInterval(loadActiveTabInfo, 2000);
});

// Setup event listeners
function setupEventListeners() {
    recordBtn.addEventListener('click', toggleRecording);
    if (reloadBtn) {
        reloadBtn.addEventListener('click', reloadTab);
    }
    clearBtn.addEventListener('click', clearAllRequests);
    backBtn.addEventListener('click', showListView);
    searchInput.addEventListener('input', filterRequests);
    
    // Copy Selected button
    if (copySelectedBtn) {
        copySelectedBtn.addEventListener('click', copySelected);
    }
    
    // Open Console Viewer button
    if (openConsoleViewerBtn) {
        openConsoleViewerBtn.addEventListener('click', openConsoleViewer);
    }
    
    // Search history dropdown
    searchInput.addEventListener('focus', showSearchHistory);
    searchInput.addEventListener('blur', (e) => {
        // Delay hiding to allow clicking on dropdown items
        setTimeout(() => {
            if (!searchHistoryDropdown.matches(':hover') && document.activeElement !== searchInput) {
                hideSearchHistory();
            }
        }, 200);
    });
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && searchInput.value.trim()) {
            saveSearchHistory(searchInput.value.trim());
            hideSearchHistory();
        }
    });
    
    // Close panel button - close the panel
    if (closePanelBtn) {
        closePanelBtn.addEventListener('click', closeSidePanel);
    }
    
    // Projects button
    if (projectsBtn) {
        projectsBtn.addEventListener('click', () => {
            projectsModal.classList.remove('hidden');
            loadProjects();
        });
    }
    
    // Close modals
    if (closeProjectsModal) {
        closeProjectsModal.addEventListener('click', () => {
            projectsModal.classList.add('hidden');
        });
    }
    
    if (closeProjectFormModal) {
        closeProjectFormModal.addEventListener('click', closeProjectForm);
    }
    
    if (cancelProjectForm) {
        cancelProjectForm.addEventListener('click', closeProjectForm);
    }
    
    // Add project button
    if (addProjectBtn) {
        addProjectBtn.addEventListener('click', () => {
            editingProjectId = null;
            document.getElementById('projectFormTitle').textContent = 'Add Project';
            document.getElementById('projectName').value = '';
            document.getElementById('projectFolder').value = '';
            projectFormModal.classList.remove('hidden');
        });
    }
    
    // Project form submit
    if (projectForm) {
        projectForm.addEventListener('submit', saveProject);
    }
    
    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const filter = e.target.getAttribute('data-filter');
            setFilter(filter);
        });
    });
    
    if (showHeadersDetailCheckbox) {
        showHeadersDetailCheckbox.addEventListener('change', () => {
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


// Close side panel
function closeSidePanel() {
    // Chrome side panel doesn't support programmatic closing
    // User must use the X button provided by Chrome
    // This function is kept for compatibility but does nothing
}

// Search History Functions
function saveSearchHistory(searchTerm) {
    if (!searchTerm || searchTerm.length === 0) return;
    
    chrome.storage.local.get(['searchHistory'], (result) => {
        let history = result.searchHistory || [];
        
        // Remove if already exists (to move to top)
        history = history.filter(item => item !== searchTerm);
        
        // Add to beginning
        history.unshift(searchTerm);
        
        // Limit to 10 items
        if (history.length > 10) {
            history = history.slice(0, 10);
        }
        
        chrome.storage.local.set({ searchHistory: history }, () => {
            // Update dropdown if visible
            if (!searchHistoryDropdown.classList.contains('hidden')) {
                renderSearchHistory();
            }
        });
    });
}

function loadSearchHistory() {
    chrome.storage.local.get(['searchHistory'], (result) => {
        const history = result.searchHistory || [];
        return history;
    });
}

function renderSearchHistory() {
    chrome.storage.local.get(['searchHistory'], (result) => {
        const history = result.searchHistory || [];
        
        if (history.length === 0) {
            searchHistoryDropdown.classList.add('hidden');
            return;
        }
        
        searchHistoryDropdown.innerHTML = history.map(term => `
            <div class="search-history-item">
                <span class="search-history-item-text" data-term="${escapeHtml(term)}">${escapeHtml(term)}</span>
                <button class="search-history-item-delete" data-term="${escapeHtml(term)}" title="Remove">✕</button>
            </div>
        `).join('');
        
        // Add click listeners
        searchHistoryDropdown.querySelectorAll('.search-history-item-text').forEach(item => {
            item.addEventListener('click', (e) => {
                const term = e.target.getAttribute('data-term');
                searchInput.value = term;
                filterRequests();
                hideSearchHistory();
                searchInput.focus();
            });
        });
        
        // Add delete listeners
        searchHistoryDropdown.querySelectorAll('.search-history-item-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const term = e.target.getAttribute('data-term');
                deleteSearchHistoryItem(term);
            });
        });
        
        searchHistoryDropdown.classList.remove('hidden');
    });
}

function deleteSearchHistoryItem(term) {
    chrome.storage.local.get(['searchHistory'], (result) => {
        let history = result.searchHistory || [];
        history = history.filter(item => item !== term);
        
        chrome.storage.local.set({ searchHistory: history }, () => {
            renderSearchHistory();
        });
    });
}

function showSearchHistory() {
    renderSearchHistory();
}

function hideSearchHistory() {
    searchHistoryDropdown.classList.add('hidden');
}

// Load requests from background service worker
function loadRequests() {
    // Check if extension context is still valid
    if (!chrome.runtime || !chrome.runtime.id) {
        isContextInvalidated = true;
        renderRequestList(); // Re-render to show reload button
        return;
    }
    
    try {
        chrome.runtime.sendMessage({ type: 'GET_REQUESTS' }, (response) => {
            // Check for runtime errors
            if (chrome.runtime.lastError) {
                const errorMsg = chrome.runtime.lastError.message || '';
                if (errorMsg.includes('Extension context invalidated') || 
                    errorMsg.includes('context invalidated') ||
                    errorMsg.includes('Receiving end does not exist')) {
                    isContextInvalidated = true;
                    renderRequestList(); // Re-render to show reload button
                    return;
                }
                console.warn('[Network Capture] Error:', errorMsg);
                return;
            }
            
            // Context is valid
            isContextInvalidated = false;
            
            if (response && response.requests) {
                allRequests = response.requests;
                // Re-apply filters after loading requests
                applyFilters();
                updateCopySelectedButton();
            }
        });
    } catch (error) {
        const errorMsg = error ? (error.message || String(error)) : 'Unknown error';
        if (errorMsg.includes('Extension context invalidated') || 
            errorMsg.includes('context invalidated')) {
            isContextInvalidated = true;
            renderRequestList(); // Re-render to show reload button
        } else {
            console.warn('[Network Capture] Error loading requests:', error);
        }
    }
}

// Update request count display
function updateRequestCount() {
    // Count is now displayed inline in the request list, so we just re-render the list
    renderRequestList();
}

// Set filter type
function setFilter(filter) {
    currentFilter = filter;
    
    // Save filter state to storage
    chrome.storage.local.set({ currentFilter: filter }, () => {
        // Update active button
        document.querySelectorAll('.filter-btn').forEach(btn => {
            if (btn.getAttribute('data-filter') === filter) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        // Re-apply filters
        applyFilters();
    });
}

// Load filter state from storage
function loadFilterState() {
    chrome.storage.local.get(['currentFilter'], (result) => {
        if (result.currentFilter) {
            currentFilter = result.currentFilter;
            // Update active button
            document.querySelectorAll('.filter-btn').forEach(btn => {
                if (btn.getAttribute('data-filter') === currentFilter) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
    });
}

// Recording state
let isRecording = true; // Default to recording on

// Load recording state from storage
function loadRecordingState() {
    chrome.storage.local.get(['isRecording'], (result) => {
        isRecording = result.isRecording !== undefined ? result.isRecording : true;
        updateRecordingButton();
    });
}

// Toggle recording state
function toggleRecording() {
    isRecording = !isRecording;
    chrome.storage.local.set({ isRecording: isRecording }, () => {
        updateRecordingButton();
        // Notify background script
        chrome.runtime.sendMessage({ type: 'SET_RECORDING_STATE', isRecording: isRecording });
        // Also sync console recording state
        chrome.storage.local.set({ isConsoleRecording: isRecording }, () => {
            chrome.runtime.sendMessage({ type: 'SET_CONSOLE_RECORDING_STATE', isRecording: isRecording });
            // Notify console viewer via background script
            chrome.runtime.sendMessage({ type: 'NOTIFY_CONSOLE_VIEWER_RECORDING', isRecording: isRecording });
        });
    });
}

// Reload the monitored tab
function reloadTab() {
    chrome.runtime.sendMessage({ type: 'RELOAD_PAGE' }, (response) => {
        if (response && response.success) {
            // Clear requests after reload
            clearAllRequests();
        }
    });
}

// Update recording button appearance
function updateRecordingButton() {
    if (isRecording) {
        recordBtn.classList.add('recording');
    } else {
        recordBtn.classList.remove('recording');
    }
}

// Apply both type filter and search filter
function applyFilters() {
    let requests = allRequests;
    
    // Apply type filter
    if (currentFilter !== 'all') {
        requests = requests.filter(req => {
            const url = req.url.toLowerCase();
            const method = req.method ? req.method.toLowerCase() : '';
            const contentType = (req.responseHeaders && req.responseHeaders['content-type']) ? 
                               req.responseHeaders['content-type'].toLowerCase() : '';
            
            switch (currentFilter) {
                case 'fetch':
                    // Filter for API calls - exclude static assets
                    const isImage = contentType.includes('image/') || url.match(/\.(png|jpg|jpeg|gif|svg|webp|ico|bmp)(\?|$)/i);
                    const isFont = contentType.includes('font/') || url.match(/\.(woff|woff2|ttf|otf|eot)(\?|$)/i);
                    const isStylesheet = contentType.includes('text/css') || url.endsWith('.css');
                    const isScript = contentType.includes('javascript') || url.match(/\.(js|mjs)(\?|$)/i);
                    
                    // Exclude static assets
                    if (isImage || isFont || isStylesheet || isScript) {
                        return false;
                    }
                    
                    // Include everything else (all non-static requests are potential API calls)
                    // This includes GET requests that return JSON/XML/HTML, and all POST/PUT/PATCH/DELETE
                    return true;
                case 'css':
                    return url.endsWith('.css') || contentType.includes('text/css');
                case 'js':
                    return url.endsWith('.js') || 
                           url.endsWith('.mjs') ||
                           contentType.includes('application/javascript') ||
                           contentType.includes('text/javascript');
                case 'font':
                    return url.endsWith('.woff') || 
                           url.endsWith('.woff2') ||
                           url.endsWith('.ttf') ||
                           url.endsWith('.otf') ||
                           url.endsWith('.eot') ||
                           contentType.includes('font/') ||
                           contentType.includes('application/font');
                case 'img':
                    return url.match(/\.(jpg|jpeg|png|gif|svg|webp|ico|bmp)(\?|$)/i) ||
                           contentType.includes('image/');
                default:
                    return true;
            }
        });
    }
    
    // Apply search filter - support comma-separated terms (OR logic)
    const searchValue = searchInput.value.trim();
    if (searchValue) {
        // Save to search history when filtering
        saveSearchHistory(searchValue);
        
        // Split by comma and trim each term
        const searchTerms = searchValue.split(',').map(term => term.trim().toLowerCase()).filter(term => term.length > 0);
        
        if (searchTerms.length > 0) {
            requests = requests.filter(req => {
                const urlLower = req.url.toLowerCase();
                const methodLower = req.method.toLowerCase();
                
                // Match if ANY term matches (OR logic)
                return searchTerms.some(term => 
                    urlLower.includes(term) || 
                    methodLower.includes(term)
                );
            });
        }
    }
    
    filteredRequests = requests;
    // Remove selections that are no longer in filtered list
    const filteredIds = new Set(filteredRequests.map(r => r.id));
    selectedRequestIds = new Set(Array.from(selectedRequestIds).filter(id => filteredIds.has(id)));
    renderRequestList();
    updateRequestCount();
    updateCopySelectedButton();
}

// Filter requests by search term
function filterRequests() {
    applyFilters();
}

// Render request list
function renderRequestList() {
    // Show reload button if context is invalidated
    if (isContextInvalidated) {
        requestList.innerHTML = `
            <div class="empty-state">
                <p>Extension context invalidated</p>
                <p class="hint">Please reload the page to start capturing network requests.</p>
                <button class="btn-reload-page" id="reloadPageBtn">Reload Page</button>
            </div>
        `;
        
        // Add reload button listener
        const reloadBtn = document.getElementById('reloadPageBtn');
        if (reloadBtn) {
            reloadBtn.addEventListener('click', reloadCurrentPage);
        }
        return;
    }
    
    const count = filteredRequests.length;
    const countHtml = `<div class="request-count-inline" id="requestCount">${count} request${count !== 1 ? 's' : ''}</div>`;
    
    if (filteredRequests.length === 0) {
        requestList.innerHTML = countHtml + `
            <div class="empty-state">
                <p>No requests found.</p>
                ${searchInput.value ? '<p class="hint">Try a different search term.</p>' : ''}
            </div>
        `;
        return;
    }
    
    requestList.innerHTML = countHtml + filteredRequests.map((req, index) => {
        const statusClass = getStatusClass(req.status);
        const uriPath = getUriPath(req.url);
        const separator = index > 0 ? '<div class="request-separator"></div>' : '';
        const isChecked = selectedRequestIds.has(req.id);
        
        return `${separator}
            <div class="request-item-text" data-request-id="${req.id}" title="${escapeHtml(req.url)}">
                <input type="checkbox" class="request-checkbox" data-request-id="${req.id}" ${isChecked ? 'checked' : ''}>
                <span class="request-url-text" data-request-id="${req.id}">${escapeHtml(uriPath)}</span>
                <span class="request-status-text ${statusClass}">${req.status}</span>
            </div>
        `;
    }).join('');
    
    // Add checkbox listeners (stop propagation to prevent detail view)
    requestList.querySelectorAll('.request-checkbox').forEach(checkbox => {
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            const requestId = checkbox.getAttribute('data-request-id');
            if (checkbox.checked) {
                selectedRequestIds.add(requestId);
            } else {
                selectedRequestIds.delete(requestId);
            }
            updateCopySelectedButton();
        });
    });
    
    // Add click listeners to request items (but not checkbox)
    requestList.querySelectorAll('.request-url-text').forEach(item => {
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
    
    // Get checked state from detail checkbox
    const showHeaders = showHeadersDetailCheckbox ? showHeadersDetailCheckbox.checked : false;
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
    chrome.runtime.sendMessage({ type: 'CLEAR_REQUESTS' }, (response) => {
        if (response && response.success) {
            allRequests = [];
            filteredRequests = [];
            selectedRequestIds.clear();
            searchInput.value = '';
            updateRequestCount();
            updateCopySelectedButton();
            renderRequestList();
        }
    });
    // Also clear console logs
    chrome.runtime.sendMessage({ type: 'CLEAR_CONSOLE_LOGS' }, (response) => {
        if (response && response.success) {
            // Notify console viewer via background script
            chrome.runtime.sendMessage({ type: 'NOTIFY_CONSOLE_VIEWER_CLEAR' });
        }
    });
}

// Update copy selected button state
function updateCopySelectedButton() {
    if (copySelectedBtn) {
        const count = selectedRequestIds.size;
        copySelectedBtn.disabled = count === 0;
        copySelectedBtn.textContent = count > 0 ? `Copy Selected (${count})` : 'Copy Selected';
    }
}

// Copy selected requests to clipboard
function copySelected() {
    if (selectedRequestIds.size === 0) {
        return;
    }
    
    // Get selected requests (preserve order from filteredRequests)
    const selectedRequests = filteredRequests.filter(req => selectedRequestIds.has(req.id));
    
    if (selectedRequests.length === 0) {
        return;
    }
    
    // Check if console logs should be included
    const includeConsole = copyConsoleCheckbox && copyConsoleCheckbox.checked;
    
    // If console logs are requested, fetch them first
    if (includeConsole) {
        chrome.runtime.sendMessage({ type: 'GET_CONSOLE_LOGS' }, (response) => {
            if (chrome.runtime.lastError) {
                // If error, just copy network requests
                copyNetworkRequestsToClipboard(selectedRequests);
                return;
            }
            
            const consoleLogs = response && response.logs ? response.logs : [];
            copyToClipboardWithConsole(selectedRequests, consoleLogs);
        });
    } else {
        copyNetworkRequestsToClipboard(selectedRequests);
    }
}

// Copy network requests to clipboard
function copyNetworkRequestsToClipboard(selectedRequests) {
    let text = '';
    
    text += 'Network Requests:\n';
    text += '='.repeat(80) + '\n\n';
    
    selectedRequests.forEach((req, index) => {
        if (index > 0) {
            text += '\n' + '='.repeat(80) + '\n\n';
        }
        
        text += `Request ${index + 1}:\n`;
        text += '-'.repeat(80) + '\n';
        text += `URL: ${req.url}\n`;
        text += `Method: ${req.method}\n`;
        text += `Status: ${req.status} ${req.statusText || ''}\n`;
        text += `Timestamp: ${formatTimestamp(req.timestamp)}\n`;
        text += '\n';
        
        text += 'Payload:\n';
        text += formatData(req.payload, false); // Use pretty-printed JSON for readability
        text += '\n\n';
        
        text += 'Response:\n';
        text += formatData(req.response, false); // Use pretty-printed JSON for readability
        text += '\n';
    });
    
    copyTextToClipboard(text);
}

// Copy network requests and console logs to clipboard
function copyToClipboardWithConsole(selectedRequests, consoleLogs) {
    let text = '';
    
    // Add console logs section
    if (consoleLogs.length > 0) {
        text += 'Console Logs:\n';
        text += '='.repeat(80) + '\n\n';
        
        consoleLogs.forEach((log, index) => {
            const timestamp = formatConsoleTimestamp(log.timestamp);
            const level = log.level.toUpperCase();
            const message = formatConsoleLogMessage(log);
            const stack = log.stack ? '\n' + log.stack : '';
            
            text += `[${timestamp}] [${level}] ${message}${stack}`;
            if (index < consoleLogs.length - 1) {
                text += '\n';
            }
        });
        
        text += '\n\n' + '='.repeat(80) + '\n\n';
    }
    
    // Add network requests section
    text += 'Network Requests:\n';
    text += '='.repeat(80) + '\n\n';
    
    selectedRequests.forEach((req, index) => {
        if (index > 0) {
            text += '\n' + '='.repeat(80) + '\n\n';
        }
        
        text += `Request ${index + 1}:\n`;
        text += '-'.repeat(80) + '\n';
        text += `URL: ${req.url}\n`;
        text += `Method: ${req.method}\n`;
        text += `Status: ${req.status} ${req.statusText || ''}\n`;
        text += `Timestamp: ${formatTimestamp(req.timestamp)}\n`;
        text += '\n';
        
        text += 'Payload:\n';
        text += formatData(req.payload, false);
        text += '\n\n';
        
        text += 'Response:\n';
        text += formatData(req.response, false);
        text += '\n';
    });
    
    copyTextToClipboard(text);
}

// Format console log message for copy
function formatConsoleLogMessage(log) {
    if (log.args && log.args.length > 0) {
        return log.args.map(arg => {
            if (arg === null) return 'null';
            if (arg === undefined) return 'undefined';
            if (typeof arg === 'string' || typeof arg === 'number' || typeof arg === 'boolean') {
                return String(arg);
            }
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg, null, 2);
                } catch (e) {
                    return String(arg);
                }
            }
            return String(arg);
        }).join(' ');
    }
    return log.message || '';
}

// Format console timestamp for copy
function formatConsoleTimestamp(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// Copy text to clipboard with feedback
function copyTextToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        // Show feedback
        const originalText = copySelectedBtn.textContent;
        copySelectedBtn.textContent = 'Copied!';
        copySelectedBtn.disabled = true;
        setTimeout(() => {
            copySelectedBtn.textContent = originalText;
            updateCopySelectedButton();
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard. Please try again.');
    });
}

// Open console viewer window
function openConsoleViewer() {
    chrome.runtime.sendMessage({ type: 'OPEN_CONSOLE_VIEWER' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('Failed to open console viewer:', chrome.runtime.lastError);
        }
    });
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

// Extract URI path from full URL
function getUriPath(url) {
    try {
        const urlObj = new URL(url);
        const path = urlObj.pathname + urlObj.search + urlObj.hash;
        // If path is just "/", show the hostname instead
        if (path === '/') {
            return urlObj.hostname;
        }
        return path;
    } catch (e) {
        // If URL parsing fails, return the original URL truncated
        return truncateUrl(url, 80);
    }
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== PROJECT MANAGEMENT ====================

// Load projects from storage
function loadProjects() {
    chrome.storage.local.get(['projects'], (result) => {
        const projects = result.projects || [];
        renderProjectsList(projects);
    });
}

// Render projects list
function renderProjectsList(projects) {
    if (!projectsList) return;
    
    if (projects.length === 0) {
        projectsList.innerHTML = '<div class="empty-state"><p>No projects yet. Click "Add Project" to create one.</p></div>';
        return;
    }
    
    projectsList.innerHTML = projects.map(project => `
        <div class="project-item" data-project-id="${project.id}">
            <div class="project-info">
                <div class="project-name">${escapeHtml(project.name)}</div>
                <div class="project-folder">${escapeHtml(project.folder)}</div>
            </div>
            <div class="project-actions">
                <button class="btn-edit-project" data-project-id="${project.id}">Edit</button>
                <button class="btn-delete-project" data-project-id="${project.id}">Delete</button>
            </div>
        </div>
    `).join('');
    
    // Add event listeners for edit/delete buttons
    projectsList.querySelectorAll('.btn-edit-project').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const projectId = e.target.getAttribute('data-project-id');
            editProject(projectId);
        });
    });
    
    projectsList.querySelectorAll('.btn-delete-project').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const projectId = e.target.getAttribute('data-project-id');
            deleteProject(projectId);
        });
    });
}

// Save project (create or update)
function saveProject(e) {
    e.preventDefault();
    
    const name = document.getElementById('projectName').value.trim();
    const folder = document.getElementById('projectFolder').value.trim();
    
    if (!name || !folder) {
        alert('Please fill in all fields');
        return;
    }
    
    chrome.storage.local.get(['projects'], (result) => {
        const projects = result.projects || [];
        
        if (editingProjectId) {
            // Update existing project
            const index = projects.findIndex(p => p.id === editingProjectId);
            if (index !== -1) {
                projects[index] = {
                    ...projects[index],
                    name: name,
                    folder: folder
                };
            }
        } else {
            // Create new project
            const newProject = {
                id: 'project_' + Date.now(),
                name: name,
                folder: folder,
                createdAt: Date.now()
            };
            projects.push(newProject);
        }
        
        chrome.storage.local.set({ projects: projects }, () => {
            loadProjects();
            closeProjectForm();
        });
    });
}

// Edit project
function editProject(projectId) {
    chrome.storage.local.get(['projects'], (result) => {
        const projects = result.projects || [];
        const project = projects.find(p => p.id === projectId);
        
        if (project) {
            editingProjectId = projectId;
            document.getElementById('projectFormTitle').textContent = 'Edit Project';
            document.getElementById('projectName').value = project.name;
            document.getElementById('projectFolder').value = project.folder;
            projectFormModal.classList.remove('hidden');
            projectsModal.classList.add('hidden');
        }
    });
}

// Delete project
function deleteProject(projectId) {
    if (!confirm('Are you sure you want to delete this project?')) {
        return;
    }
    
    chrome.storage.local.get(['projects'], (result) => {
        const projects = result.projects || [];
        const filtered = projects.filter(p => p.id !== projectId);
        
        chrome.storage.local.set({ projects: filtered }, () => {
            loadProjects();
        });
    });
}

// Close project form modal
function closeProjectForm() {
    projectFormModal.classList.add('hidden');
    editingProjectId = null;
    document.getElementById('projectForm').reset();
}

// ==================== ACTIVE TAB INFO ====================

// Load active tab information
function loadActiveTabInfo() {
    if (!chrome.runtime || !chrome.runtime.id) {
        return;
    }
    
    try {
        chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB_INFO' }, (response) => {
            if (chrome.runtime.lastError) {
                return;
            }
            
            if (response && response.tabInfo) {
                updateTabInfoDisplay(response.tabInfo);
            } else {
                updateTabInfoDisplay(null);
            }
        });
    } catch (error) {
        // Ignore errors
    }
}

// Update tab info display
function updateTabInfoDisplay(tabInfo) {
    if (!tabInfoSection || !tabTitle || !tabUrl || !tabFavicon) {
        return;
    }
    
    // Check if tab changed
    if (tabInfo && tabInfo.id !== currentTabId) {
        // Tab changed - clear selections
        selectedRequestIds.clear();
        updateCopySelectedButton();
        currentTabId = tabInfo.id;
    } else if (!tabInfo) {
        currentTabId = null;
    }
    
    if (!tabInfo) {
        tabTitle.textContent = 'No active tab';
        tabUrl.textContent = '-';
        tabFavicon.style.display = 'none';
        return;
    }
    
    tabTitle.textContent = tabInfo.title || 'Untitled';
    tabUrl.textContent = tabInfo.url || '-';
    
    if (tabInfo.favIconUrl) {
        tabFavicon.src = tabInfo.favIconUrl;
        tabFavicon.style.display = 'block';
        tabFavicon.onerror = function() {
            // Hide favicon if it fails to load
            this.style.display = 'none';
        };
    } else {
        tabFavicon.style.display = 'none';
    }
}
