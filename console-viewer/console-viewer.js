/**
 * Console Viewer Script - Handles console log display and interactions
 */

let allLogs = [];
let filteredLogs = [];
let currentFilter = 'all';
let isRecording = true;

// DOM Elements
const logList = document.getElementById('logList');
const recordBtn = document.getElementById('recordBtn');
const clearBtn = document.getElementById('clearBtn');
const copyAllBtn = document.getElementById('copyAllBtn');
const searchInput = document.getElementById('searchInput');
const filterButtons = document.querySelectorAll('.filter-btn');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadRecordingState();
    loadLogs();
    setupEventListeners();
    
    // Refresh logs periodically
    setInterval(loadLogs, 500);
});

// Setup event listeners
function setupEventListeners() {
    recordBtn.addEventListener('click', toggleRecording);
    clearBtn.addEventListener('click', clearAllLogs);
    copyAllBtn.addEventListener('click', copyAllLogs);
    searchInput.addEventListener('input', filterLogs);
    
    // Filter buttons
    filterButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const filter = e.target.getAttribute('data-filter');
            setFilter(filter);
        });
    });
}

// Load recording state from storage
function loadRecordingState() {
    chrome.storage.local.get(['isConsoleRecording'], (result) => {
        isRecording = result.isConsoleRecording !== undefined ? result.isConsoleRecording : true;
        updateRecordingButton();
    });
}

// Toggle recording state
function toggleRecording() {
    isRecording = !isRecording;
    chrome.storage.local.set({ isConsoleRecording: isRecording }, () => {
        updateRecordingButton();
        // Notify background script
        chrome.runtime.sendMessage({ type: 'SET_CONSOLE_RECORDING_STATE', isRecording: isRecording });
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

// Load logs from background service worker
function loadLogs() {
    if (!chrome.runtime || !chrome.runtime.id) {
        return;
    }
    
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
