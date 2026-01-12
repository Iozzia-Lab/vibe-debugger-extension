/**
 * Console Viewer Script - Handles console log display and interactions
 */

let allLogs = [];
let filteredLogs = [];
let currentFilter = 'all';
let isRecording = true;
let selectedStartIndex = null; // Index in filteredLogs array for start trim point
let selectedEndIndex = null; // Index in filteredLogs array for end trim point
let isUpdatingTrimSelection = false; // Flag to prevent loadLogs from interfering during trim selection

// DOM Elements
const logList = document.getElementById('logList');
const copyAllBtn = document.getElementById('copyAllBtn');
const searchInput = document.getElementById('searchInput');
const filterButtons = document.querySelectorAll('.filter-btn');
const tabButtons = document.querySelectorAll('.tab-btn');
const consoleTab = document.getElementById('consoleTab');
const cacheTab = document.getElementById('cacheTab');
const localStorageTab = document.getElementById('localStorageTab');
const cacheContent = document.getElementById('cacheContent');
const localStorageContent = document.getElementById('localStorageContent');
const refreshCacheBtn = document.getElementById('refreshCacheBtn');
const refreshLocalStorageBtn = document.getElementById('refreshLocalStorageBtn');
const totalCountSpan = document.getElementById('totalCount');
const filteredCountSpan = document.getElementById('filteredCount');
const trimmedCountSpan = document.getElementById('trimmedCount');

// Current active tab
let currentTab = 'console';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadRecordingState();
    loadLogs();
    setupEventListeners();
    setupMessageListener();
    
    // Refresh logs periodically
    setInterval(loadLogs, 500);
});

// Setup event listeners
function setupEventListeners() {
    copyAllBtn.addEventListener('click', copyAllLogs);
    searchInput.addEventListener('input', filterLogs);
    
    // Filter buttons
    filterButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const filter = e.target.getAttribute('data-filter');
            setFilter(filter);
        });
    });
    
    // Tab buttons
    tabButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.target.getAttribute('data-tab');
            switchTab(tab);
        });
    });
    
    // Refresh buttons
    if (refreshCacheBtn) {
        refreshCacheBtn.addEventListener('click', () => {
            loadCacheData();
        });
    }
    
    if (refreshLocalStorageBtn) {
        refreshLocalStorageBtn.addEventListener('click', () => {
            loadLocalStorageData();
        });
    }
}

// Switch tabs
function switchTab(tabName) {
    if (currentTab === tabName) {
        return; // Already on this tab
    }
    
    currentTab = tabName;
    
    // Update tab buttons
    tabButtons.forEach(btn => {
        if (btn.getAttribute('data-tab') === tabName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Show/hide tab content
    consoleTab.classList.toggle('active', tabName === 'console');
    cacheTab.classList.toggle('active', tabName === 'cache');
    localStorageTab.classList.toggle('active', tabName === 'localstorage');
    
    // Load data when switching to cache or localStorage tabs
    if (tabName === 'cache') {
        loadCacheData();
    } else if (tabName === 'localstorage') {
        loadLocalStorageData();
    }
}

// Setup message listener and storage listener to sync with side panel
let lastClearFlag = null;

function setupMessageListener() {
    // Listen for storage changes to sync recording state and clear flag
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') {
            if (changes.isConsoleRecording) {
                isRecording = changes.isConsoleRecording.newValue;
            }
            if (changes.consoleViewerClearFlag) {
                const newClearFlag = changes.consoleViewerClearFlag.newValue;
                if (newClearFlag !== lastClearFlag) {
                    lastClearFlag = newClearFlag;
                    allLogs = [];
                    filteredLogs = [];
                    searchInput.value = '';
                    selectedStartIndex = null;
                    selectedEndIndex = null;
                    renderLogList();
                    updateCountsDisplay();
                }
            }
        }
    });
    
    // Load initial clear flag
    chrome.storage.local.get(['consoleViewerClearFlag'], (result) => {
        lastClearFlag = result.consoleViewerClearFlag || null;
    });
}

// Load recording state from storage
function loadRecordingState() {
    chrome.storage.local.get(['isConsoleRecording'], (result) => {
        isRecording = result.isConsoleRecording !== undefined ? result.isConsoleRecording : true;
    });
}

// Load logs from background service worker
function loadLogs() {
    if (!chrome.runtime || !chrome.runtime.id) {
        return;
    }
    
    // Check for clear flag
    chrome.storage.local.get(['consoleViewerClearFlag'], (result) => {
        const currentClearFlag = result.consoleViewerClearFlag || null;
        if (currentClearFlag !== lastClearFlag) {
            lastClearFlag = currentClearFlag;
            allLogs = [];
            filteredLogs = [];
            searchInput.value = '';
            selectedStartIndex = null;
            selectedEndIndex = null;
            renderLogList();
            updateCountsDisplay();
        }
    });
    
    try {
        chrome.runtime.sendMessage({ type: 'GET_CONSOLE_LOGS' }, (response) => {
            if (chrome.runtime.lastError) {
                return;
            }
            
            if (response && response.logs) {
                allLogs = response.logs;
                // Preserve trim selection when refreshing logs (filters haven't changed)
                applyFilters(true);
                updateCountsDisplay();
            }
        });
    } catch (error) {
        // Ignore errors
    }
}

// Set filter type
function setFilter(filter) {
    currentFilter = filter;
    
    // Update active button
    filterButtons.forEach(btn => {
        if (btn.getAttribute('data-filter') === filter) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Re-apply filters
    applyFilters();
}

// Apply filters
function applyFilters(preserveTrimSelection = false) {
    let logs = allLogs;
    
    // Store selected log objects before filtering (to preserve selection if requested)
    let selectedStartLog = null;
    let selectedEndLog = null;
    if (preserveTrimSelection && selectedStartIndex !== null && filteredLogs[selectedStartIndex]) {
        selectedStartLog = filteredLogs[selectedStartIndex];
    }
    if (preserveTrimSelection && selectedEndIndex !== null && filteredLogs[selectedEndIndex]) {
        selectedEndLog = filteredLogs[selectedEndIndex];
    }
    
    // Apply type filter
    if (currentFilter !== 'all') {
        logs = logs.filter(log => log.level === currentFilter);
    }
    
    // Apply search filter
    const searchValue = searchInput.value.trim().toLowerCase();
    if (searchValue) {
        logs = logs.filter(log => {
            const message = log.message ? log.message.toLowerCase() : '';
            const argsStr = JSON.stringify(log.args || []).toLowerCase();
            return message.includes(searchValue) || argsStr.includes(searchValue);
        });
    }
    
    filteredLogs = logs;
    
    // Reset trim selection when filters change (indices may no longer be valid)
    // Unless we're preserving selection (during log refresh)
    if (!preserveTrimSelection) {
        selectedStartIndex = null;
        selectedEndIndex = null;
    } else {
        // Try to restore trim selection by finding the same log objects in the new filtered array
        if (selectedStartLog) {
            const newStartIndex = filteredLogs.findIndex(log => 
                log.timestamp === selectedStartLog.timestamp && 
                JSON.stringify(log.args || []) === JSON.stringify(selectedStartLog.args || []) &&
                log.level === selectedStartLog.level
            );
            selectedStartIndex = newStartIndex >= 0 ? newStartIndex : null;
        } else {
            selectedStartIndex = null;
        }
        
        if (selectedEndLog) {
            const newEndIndex = filteredLogs.findIndex(log => 
                log.timestamp === selectedEndLog.timestamp && 
                JSON.stringify(log.args || []) === JSON.stringify(selectedEndLog.args || []) &&
                log.level === selectedEndLog.level
            );
            selectedEndIndex = newEndIndex >= 0 ? newEndIndex : null;
        } else {
            selectedEndIndex = null;
        }
        
        // Validate: if start >= end after restoration, clear end
        if (selectedStartIndex !== null && selectedEndIndex !== null && selectedStartIndex >= selectedEndIndex) {
            selectedEndIndex = null;
        }
    }
    
    // Save filter state to storage so side panel can access it
    const hasFilter = currentFilter !== 'all' || searchValue.length > 0;
    chrome.storage.local.set({
        consoleViewerFilter: {
            currentFilter: currentFilter,
            searchValue: searchValue,
            hasFilter: hasFilter,
            filteredCount: filteredLogs.length,
            totalCount: allLogs.length,
            timestamp: Date.now() // Add timestamp to trigger updates
        }
    });
    
    renderLogList();
}

// Filter logs by search term
function filterLogs() {
    applyFilters();
}

// Render log list
function renderLogList() {
    if (filteredLogs.length === 0) {
        logList.innerHTML = `
            <div class="empty-state">
                <p>No logs found.</p>
                ${searchInput.value ? '<p class="hint">Try a different search term.</p>' : ''}
            </div>
        `;
        updateCountsDisplay();
        return;
    }
    
    // Store current state before rendering to ensure it's preserved
    const currentStartIndex = selectedStartIndex;
    const currentEndIndex = selectedEndIndex;
    
    logList.innerHTML = filteredLogs.map((log, index) => {
        const timestamp = formatTimestamp(log.timestamp);
        const level = log.level.toUpperCase();
        const message = formatLogMessage(log);
        const stack = log.stack ? `<div class="log-stack">${escapeHtml(log.stack)}</div>` : '';
        
        // Determine checkbox states and [-] indicators
        const isStartRow = currentStartIndex !== null && currentStartIndex === index;
        const isEndRow = currentEndIndex !== null && currentEndIndex === index;
        const isInMiddleRange = currentStartIndex !== null && 
                                currentEndIndex !== null &&
                                index > currentStartIndex && 
                                index < currentEndIndex;
        const isAfterStart = currentStartIndex !== null && index > currentStartIndex && currentEndIndex === null;
        
        // Start checkbox: checked if this is start row, [-] if in range (but not checked), normal otherwise
        const startChecked = isStartRow;
        // Show [-] on start checkbox if: in middle range, after start (no end), or on end row (if start is set)
        // But only if the checkbox is NOT checked
        const startShowIndicator = !startChecked && (isInMiddleRange || isAfterStart || (isEndRow && currentStartIndex !== null));
        const startDisabled = currentEndIndex !== null && index > currentEndIndex;
        
        // End checkbox: checked if this is end row, [-] if in range (but not checked), normal otherwise
        const endChecked = isEndRow;
        // Show [-] on end checkbox if: in middle range, on start row (if end is set), or after start (no end)
        // But only if the checkbox is NOT checked
        const endShowIndicator = !endChecked && (isInMiddleRange || (isStartRow && currentEndIndex !== null) || isAfterStart);
        const endDisabled = currentStartIndex !== null && index <= currentStartIndex;
        
        // Determine if this row is in the selected range (for visual highlighting)
        const isInSelectedRange = currentStartIndex !== null && 
                                   index >= currentStartIndex && 
                                   (currentEndIndex === null || index <= currentEndIndex);
        
        return `
            <div class="log-item-row ${log.level} ${isInSelectedRange ? 'selected-range' : ''}">
                <div class="trim-checkbox-container">
                    <input type="checkbox" 
                           class="trim-checkbox trim-start" 
                           data-index="${index}"
                           data-type="start"
                           data-indeterminate="${startShowIndicator ? 'true' : 'false'}"
                           ${startChecked ? 'checked' : ''}
                           ${startDisabled ? 'disabled' : ''}
                           title="${startDisabled ? 'Cannot select start after end point' : 'Set as start point'}">
                </div>
                <div class="log-item-content">
                    <div class="log-item ${log.level}">
                        <div class="log-item-header">
                            <span class="log-level">${level}</span>
                            <span class="log-timestamp">${timestamp}</span>
                        </div>
                        <div class="log-message">${message}</div>
                        ${stack}
                    </div>
                </div>
                <div class="trim-checkbox-container">
                    <input type="checkbox" 
                           class="trim-checkbox trim-end" 
                           data-index="${index}"
                           data-type="end"
                           data-indeterminate="${endShowIndicator ? 'true' : 'false'}"
                           ${endChecked ? 'checked' : ''}
                           ${endDisabled ? 'disabled' : ''}
                           title="${endDisabled ? 'Cannot select end before start point' : 'Set as end point'}">
                </div>
            </div>
        `;
    }).join('');
    
    // Attach event listeners to checkboxes after a brief delay to ensure DOM is ready
    setTimeout(() => {
        attachTrimCheckboxListeners();
        // Set indeterminate state on checkboxes that need it
        setIndeterminateStates();
    }, 0);
    
    // Update counts display
    updateCountsDisplay();
}

// Set indeterminate state on checkboxes based on data-indeterminate attribute
function setIndeterminateStates() {
    const checkboxes = document.querySelectorAll('.trim-checkbox[data-indeterminate="true"]');
    checkboxes.forEach(checkbox => {
        checkbox.indeterminate = true;
    });
    
    // Also ensure checkboxes that should NOT be indeterminate are reset
    const nonIndeterminateCheckboxes = document.querySelectorAll('.trim-checkbox[data-indeterminate="false"]');
    nonIndeterminateCheckboxes.forEach(checkbox => {
        checkbox.indeterminate = false;
    });
}

// Update counts display
function updateCountsDisplay() {
    if (!totalCountSpan || !filteredCountSpan || !trimmedCountSpan) {
        return;
    }
    
    const totalCount = allLogs.length;
    const filteredCount = filteredLogs.length;
    
    let trimmedCount = 0;
    if (selectedStartIndex !== null) {
        if (selectedEndIndex !== null) {
            // Both start and end selected
            trimmedCount = selectedEndIndex - selectedStartIndex + 1;
        } else {
            // Start selected but no end = from start to end of filtered logs
            trimmedCount = filteredCount - selectedStartIndex;
        }
    }
    
    totalCountSpan.textContent = totalCount;
    filteredCountSpan.textContent = filteredCount;
    trimmedCountSpan.textContent = trimmedCount;
}

// Format log message
function formatLogMessage(log) {
    if (log.args && log.args.length > 0) {
        return log.args.map(arg => {
            if (arg === null) return 'null';
            if (arg === undefined) return 'undefined';
            if (typeof arg === 'string') return escapeHtml(arg);
            if (typeof arg === 'number' || typeof arg === 'boolean') return String(arg);
            if (typeof arg === 'object') {
                try {
                    return escapeHtml(JSON.stringify(arg, null, 2));
                } catch (e) {
                    return escapeHtml(String(arg));
                }
            }
            return escapeHtml(String(arg));
        }).join(' ');
    }
    return escapeHtml(log.message || '');
}

// Format timestamp
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${ms}`;
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Clear all logs
function clearAllLogs() {
    chrome.runtime.sendMessage({ type: 'CLEAR_CONSOLE_LOGS' }, (response) => {
        if (response && response.success) {
            allLogs = [];
            filteredLogs = [];
            searchInput.value = '';
            selectedStartIndex = null;
            selectedEndIndex = null;
            renderLogList();
            updateCountsDisplay();
        }
    });
}

// Attach event listeners to trim checkboxes
function attachTrimCheckboxListeners() {
    const startCheckboxes = document.querySelectorAll('.trim-start');
    const endCheckboxes = document.querySelectorAll('.trim-end');
    
    startCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            isUpdatingTrimSelection = true; // Prevent loadLogs from interfering
            
            const index = parseInt(e.target.getAttribute('data-index'));
            
            // Set state based on checkbox state
            if (e.target.checked) {
                // Set start index (only one can be selected)
                selectedStartIndex = index;
                
                // If end is before or equal to start, clear end selection
                if (selectedEndIndex !== null && selectedEndIndex <= index) {
                    selectedEndIndex = null;
                }
            } else {
                // Unchecking clears the start selection
                selectedStartIndex = null;
            }
            
            // Re-render to update disabled states and ensure checkbox stays checked
            // The state is set, so renderLogList will recreate it as checked
            renderLogList();
            
            // Allow loadLogs to run again after a brief delay
            setTimeout(() => {
                isUpdatingTrimSelection = false;
            }, 100);
        });
    });
    
    endCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            isUpdatingTrimSelection = true; // Prevent loadLogs from interfering
            
            const index = parseInt(e.target.getAttribute('data-index'));
            
            if (e.target.checked) {
                // Validate: end must be after start
                if (selectedStartIndex !== null && index <= selectedStartIndex) {
                    // Don't allow this selection - revert checkbox immediately
                    e.target.checked = false;
                    isUpdatingTrimSelection = false;
                    return;
                }
                
                // Set end index (only one can be selected)
                // This will automatically uncheck all other end checkboxes when we re-render
                selectedEndIndex = index;
            } else {
                // Unchecking clears the end selection
                selectedEndIndex = null;
            }
            
            // Re-render to update disabled states, indicators, and ensure checkbox stays checked
            // The state is set, so renderLogList will recreate it as checked
            renderLogList();
            
            // Allow loadLogs to run again after a brief delay
            setTimeout(() => {
                isUpdatingTrimSelection = false;
            }, 100);
        });
    });
}

// Copy all logs to clipboard
function copyAllLogs() {
    if (currentTab === 'console') {
        if (filteredLogs.length === 0) {
            return;
        }
        
        let logsToCopy = [];
        
        // If both start and end are selected, copy only that range
        if (selectedStartIndex !== null && selectedEndIndex !== null) {
            logsToCopy = filteredLogs.slice(selectedStartIndex, selectedEndIndex + 1);
        } else {
            // Otherwise, copy all filtered logs
            logsToCopy = filteredLogs;
        }
        
        if (logsToCopy.length === 0) {
            return;
        }
        
        let text = '';
        
        logsToCopy.forEach((log, index) => {
            const timestamp = formatTimestamp(log.timestamp);
            const level = log.level.toUpperCase();
            const message = formatLogMessage(log);
            const stack = log.stack ? '\n' + log.stack : '';
            
            text += `[${timestamp}] [${level}] ${message}${stack}`;
            if (index < logsToCopy.length - 1) {
                text += '\n';
            }
        });
        
        // Copy to clipboard
        navigator.clipboard.writeText(text).then(() => {
            // Show feedback
            const originalText = copyAllBtn.textContent;
            if (selectedStartIndex !== null && selectedEndIndex !== null) {
                copyAllBtn.textContent = `Copied ${logsToCopy.length} logs!`;
            } else {
                copyAllBtn.textContent = 'Copied!';
            }
            setTimeout(() => {
                copyAllBtn.textContent = originalText;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy:', err);
            alert('Failed to copy to clipboard. Please try again.');
        });
    }
}

// Load cache data from background script
function loadCacheData() {
    if (!chrome.runtime || !chrome.runtime.id) {
        cacheContent.innerHTML = '<div class="empty-state"><p>Error: Extension runtime not available</p></div>';
        return;
    }
    
    cacheContent.innerHTML = '<div class="empty-state"><p>Loading cache data...</p></div>';
    
    chrome.runtime.sendMessage({ type: 'GET_CACHE_DATA' }, (response) => {
        if (chrome.runtime.lastError) {
            cacheContent.innerHTML = `<div class="empty-state"><p>Error: ${escapeHtml(chrome.runtime.lastError.message)}</p><p class="hint">Make sure the side panel is open and monitoring a tab.</p></div>`;
            return;
        }
        
        if (!response) {
            cacheContent.innerHTML = '<div class="empty-state"><p>Error: No response from background script</p></div>';
            return;
        }
        
        if (response.error) {
            let errorMsg = escapeHtml(response.error);
            if (response.error === 'No monitored tab' || response.error.includes('no longer available')) {
                errorMsg += '<br><span class="hint">Please open the side panel and click the extension icon on a tab to start monitoring.</span>';
            }
            cacheContent.innerHTML = `<div class="empty-state"><p>Error: ${errorMsg}</p></div>`;
            return;
        }
        
        if (response.caches) {
            renderCacheData(response.caches);
        } else {
            cacheContent.innerHTML = '<div class="empty-state"><p>No cache data available</p></div>';
        }
    });
}

// Render cache data
function renderCacheData(caches) {
    if (!caches || caches.length === 0) {
        cacheContent.innerHTML = '<div class="empty-state"><p>No caches found</p></div>';
        return;
    }
    
    let html = '<div class="cache-list">';
    
    caches.forEach(cache => {
        html += `<div class="cache-item">`;
        html += `<div class="cache-name">${escapeHtml(cache.name)}`;
        if (cache.totalEntries > cache.entries.length) {
            html += ` <span style="color: #858585; font-size: 11px;">(${cache.entries.length} of ${cache.totalEntries} entries shown)</span>`;
        }
        html += `</div>`;
        
        if (cache.entries && cache.entries.length > 0) {
            html += '<div class="cache-entries">';
            cache.entries.forEach(entry => {
                html += '<div class="cache-entry">';
                html += `<div class="cache-entry-url">${escapeHtml(entry.method)} ${escapeHtml(entry.url)}</div>`;
                html += `<div style="color: #858585; font-size: 10px; margin-bottom: 4px;">Status: ${entry.status} ${escapeHtml(entry.statusText)}</div>`;
                
                let responsePreview = '';
                if (typeof entry.response === 'object') {
                    try {
                        responsePreview = JSON.stringify(entry.response, null, 2);
                    } catch (e) {
                        responsePreview = String(entry.response);
                    }
                } else {
                    responsePreview = String(entry.response);
                }
                
                html += `<div class="cache-entry-preview">${escapeHtml(responsePreview)}</div>`;
                html += '</div>';
            });
            html += '</div>';
        } else {
            html += '<div style="color: #858585; font-size: 11px; margin-left: 20px;">No entries</div>';
        }
        
        html += '</div>';
    });
    
    html += '</div>';
    cacheContent.innerHTML = html;
}

// Load localStorage data from background script
function loadLocalStorageData() {
    if (!chrome.runtime || !chrome.runtime.id) {
        localStorageContent.innerHTML = '<div class="empty-state"><p>Error: Extension runtime not available</p></div>';
        return;
    }
    
    localStorageContent.innerHTML = '<div class="empty-state"><p>Loading localStorage data...</p></div>';
    
    chrome.runtime.sendMessage({ type: 'GET_LOCAL_STORAGE_DATA' }, (response) => {
        if (chrome.runtime.lastError) {
            localStorageContent.innerHTML = `<div class="empty-state"><p>Error: ${escapeHtml(chrome.runtime.lastError.message)}</p><p class="hint">Make sure the side panel is open and monitoring a tab.</p></div>`;
            return;
        }
        
        if (!response) {
            localStorageContent.innerHTML = '<div class="empty-state"><p>Error: No response from background script</p></div>';
            return;
        }
        
        if (response.error) {
            let errorMsg = escapeHtml(response.error);
            if (response.error === 'No monitored tab' || response.error.includes('no longer available')) {
                errorMsg += '<br><span class="hint">Please open the side panel and click the extension icon on a tab to start monitoring.</span>';
            }
            localStorageContent.innerHTML = `<div class="empty-state"><p>Error: ${errorMsg}</p></div>`;
            return;
        }
        
        if (response.items) {
            renderLocalStorageData(response.items);
        } else {
            localStorageContent.innerHTML = '<div class="empty-state"><p>No localStorage data available</p></div>';
        }
    });
}

// Render localStorage data
function renderLocalStorageData(items) {
    if (!items || items.length === 0) {
        localStorageContent.innerHTML = '<div class="empty-state"><p>localStorage is empty</p></div>';
        return;
    }
    
    let html = '<div class="localstorage-list">';
    
    items.forEach(item => {
        html += '<div class="localstorage-item">';
        html += `<div class="localstorage-key">${escapeHtml(item.key)}</div>`;
        
        let valueDisplay = '';
        if (typeof item.value === 'object') {
            try {
                valueDisplay = JSON.stringify(item.value, null, 2);
            } catch (e) {
                valueDisplay = String(item.value);
            }
        } else {
            valueDisplay = String(item.value);
        }
        
        html += `<div class="localstorage-value">${escapeHtml(valueDisplay)}</div>`;
        html += '</div>';
    });
    
    html += '</div>';
    localStorageContent.innerHTML = html;
}
