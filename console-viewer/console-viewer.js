/**
 * Console Viewer Script - Handles console log display and interactions
 */

let allLogs = [];
let filteredLogs = [];
let currentFilter = 'all';
let isRecording = true;

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
                    renderLogList();
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
            renderLogList();
        }
    });
    
    try {
        chrome.runtime.sendMessage({ type: 'GET_CONSOLE_LOGS' }, (response) => {
            if (chrome.runtime.lastError) {
                return;
            }
            
            if (response && response.logs) {
                allLogs = response.logs;
                applyFilters();
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
function applyFilters() {
    let logs = allLogs;
    
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
        return;
    }
    
    logList.innerHTML = filteredLogs.map(log => {
        const timestamp = formatTimestamp(log.timestamp);
        const level = log.level.toUpperCase();
        const message = formatLogMessage(log);
        const stack = log.stack ? `<div class="log-stack">${escapeHtml(log.stack)}</div>` : '';
        
        return `
            <div class="log-item ${log.level}">
                <div class="log-item-header">
                    <span class="log-level">${level}</span>
                    <span class="log-timestamp">${timestamp}</span>
                </div>
                <div class="log-message">${message}</div>
                ${stack}
            </div>
        `;
    }).join('');
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
            renderLogList();
        }
    });
}

// Copy all logs to clipboard
function copyAllLogs() {
    if (currentTab === 'console') {
        if (filteredLogs.length === 0) {
            return;
        }
        
        let text = '';
        
        filteredLogs.forEach((log, index) => {
            const timestamp = formatTimestamp(log.timestamp);
            const level = log.level.toUpperCase();
            const message = formatLogMessage(log);
            const stack = log.stack ? '\n' + log.stack : '';
            
            text += `[${timestamp}] [${level}] ${message}${stack}`;
            if (index < filteredLogs.length - 1) {
                text += '\n';
            }
        });
        
        // Copy to clipboard
        navigator.clipboard.writeText(text).then(() => {
            // Show feedback
            const originalText = copyAllBtn.textContent;
            copyAllBtn.textContent = 'Copied!';
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
