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
let clickEvents = []; // Array of click event objects: { logIndex, label, timestamp, log }
let expandedRows = new Set(); // Set of expanded row indices

// DOM Elements
const logList = document.getElementById('logList');
const copyAllBtn = document.getElementById('copyAllBtn');
const clearLogsBtn = document.getElementById('clearLogsBtn');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const searchSuggestions = document.getElementById('searchSuggestions');
const autoScrollCheckbox = document.getElementById('autoScrollCheckbox');
const logListContainer = document.getElementById('logListContainer');

// Auto-scroll state
let autoScrollEnabled = true;
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
const filteredLinesSpan = document.getElementById('filteredLines');
const filteredTokensSpan = document.getElementById('filteredTokens');
const trimmedLinesSpan = document.getElementById('trimmedLines');
const trimmedTokensSpan = document.getElementById('trimmedTokens');
const timelineContainer = document.getElementById('timelineContainer');
const timelineContent = document.getElementById('timelineContent');

// Current active tab
let currentTab = 'console';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadRecordingState();
    loadSavedFilter(); // Load persisted filter
    loadAutoScrollState(); // Load auto-scroll preference
    loadLogs();
    setupEventListeners();
    setupMessageListener();

    // Refresh logs periodically
    setInterval(loadLogs, 500);
});

// Load auto-scroll state from storage
function loadAutoScrollState() {
    chrome.storage.local.get(['consoleViewerAutoScroll'], (result) => {
        // Default to true if not set
        autoScrollEnabled = result.consoleViewerAutoScroll !== false;
        if (autoScrollCheckbox) {
            autoScrollCheckbox.checked = autoScrollEnabled;
        }
        // If enabled, scroll to bottom
        if (autoScrollEnabled) {
            scrollToBottom();
        }
    });
}

// Save auto-scroll state to storage
function saveAutoScrollState() {
    chrome.storage.local.set({ consoleViewerAutoScroll: autoScrollEnabled });
}

// Scroll log list to bottom
function scrollToBottom() {
    if (logListContainer) {
        logListContainer.scrollTop = logListContainer.scrollHeight;
    }
}

// Load saved filter from storage
function loadSavedFilter() {
    chrome.storage.local.get(['consoleViewerSearchFilter'], (result) => {
        if (result.consoleViewerSearchFilter && searchInput) {
            searchInput.value = result.consoleViewerSearchFilter;
            filterLogs(); // Apply the filter
        }
    });
}

// Save filter to storage
function saveFilter() {
    const filterValue = searchInput ? searchInput.value : '';
    chrome.storage.local.set({ consoleViewerSearchFilter: filterValue });
}

// Setup event listeners
function setupEventListeners() {
    copyAllBtn.addEventListener('click', copyAllLogs);
    if (clearLogsBtn) {
        clearLogsBtn.addEventListener('click', clearAllLogs);
    }
    searchInput.addEventListener('input', () => {
        filterLogs();
        saveFilter(); // Persist filter on change
        showSuggestions();
    });

    // Clear search button
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            searchInput.value = '';
            filterLogs();
            saveFilter();
            hideSuggestions();
            searchInput.focus();
        });
    }

    // Show suggestions on focus
    if (searchInput) {
        searchInput.addEventListener('focus', showSuggestions);
        searchInput.addEventListener('blur', () => {
            // Delay hiding to allow click on suggestion
            setTimeout(hideSuggestions, 200);
        });
    }

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

    // Auto-scroll checkbox
    if (autoScrollCheckbox) {
        autoScrollCheckbox.addEventListener('change', () => {
            autoScrollEnabled = autoScrollCheckbox.checked;
            saveAutoScrollState();
            // If enabling, jump to bottom immediately
            if (autoScrollEnabled) {
                scrollToBottom();
            }
        });
    }
}

// Show filter suggestions from active project
function showSuggestions() {
    if (!searchSuggestions) return;

    chrome.storage.local.get(['projects', 'activeProjectId'], (result) => {
        const projects = result.projects || [];
        const activeProjectId = result.activeProjectId;
        const project = projects.find(p => p.id === activeProjectId);

        if (!project || !project.consoleFilterSuggestions) {
            hideSuggestions();
            return;
        }

        const suggestions = project.consoleFilterSuggestions
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        if (suggestions.length === 0) {
            hideSuggestions();
            return;
        }

        const currentValue = searchInput.value.toLowerCase();
        const filteredSuggestions = suggestions.filter(s =>
            s.toLowerCase().includes(currentValue) || currentValue === ''
        );

        if (filteredSuggestions.length === 0) {
            hideSuggestions();
            return;
        }

        searchSuggestions.innerHTML = filteredSuggestions.map(suggestion => `
            <div class="suggestion-item" data-suggestion="${escapeHtml(suggestion)}">${escapeHtml(suggestion)}</div>
        `).join('');

        // Add click handlers to suggestions
        searchSuggestions.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const value = e.target.getAttribute('data-suggestion');
                searchInput.value = value;
                filterLogs();
                saveFilter();
                hideSuggestions();
            });
        });

        searchSuggestions.classList.remove('hidden');
    });
}

// Hide suggestions dropdown
function hideSuggestions() {
    if (searchSuggestions) {
        searchSuggestions.classList.add('hidden');
    }
}

// Escape HTML for safe rendering
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
                    // Note: Don't clear searchInput - preserve filter on clear
                    selectedStartIndex = null;
                    selectedEndIndex = null;
                    saveTrimSelectionToStorage();
                    expandedRows.clear();
                    clickEvents = [];
                    renderTimeline(clickEvents);
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
    
    // Skip if user is actively updating trim selection
    if (isUpdatingTrimSelection) {
        return;
    }
    
    // Check for clear flag
    chrome.storage.local.get(['consoleViewerClearFlag'], (result) => {
        const currentClearFlag = result.consoleViewerClearFlag || null;
        if (currentClearFlag !== lastClearFlag) {
            lastClearFlag = currentClearFlag;
            allLogs = [];
            filteredLogs = [];
            // Note: Don't clear searchInput - preserve filter on clear
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
                // Timeline will be rebuilt in applyFilters -> renderLogList
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
        saveTrimSelectionToStorage();
        expandedRows.clear(); // Clear expanded rows when filters change
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
        
        // Validate: if start > end after restoration, clear end (allow start == end for single row selection)
        if (selectedStartIndex !== null && selectedEndIndex !== null && selectedStartIndex > selectedEndIndex) {
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
    
    // Save trim selection to storage
    saveTrimSelectionToStorage();
    
    renderLogList();
}

// Filter logs by search term
function filterLogs() {
    applyFilters();
}

// Render log list
function renderLogList() {
    // Identify click events and render timeline BEFORE checking if logs are empty
    // This ensures timeline updates even when filters hide all logs
    clickEvents = identifyClickLogs(filteredLogs);
    renderTimeline(clickEvents);
    
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
        const messagePreview = formatLogMessagePreview(log);
        const fullMessage = formatLogMessage(log);
        const stackLocation = extractStackLocation(log.stack || '');
        const isExpanded = expandedRows.has(index);
        
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
        const endDisabled = currentStartIndex !== null && index < currentStartIndex;
        
        // Determine if this row is in the selected range (for visual highlighting)
        const isInSelectedRange = currentStartIndex !== null && 
                                   index >= currentStartIndex && 
                                   (currentEndIndex === null || index <= currentEndIndex);
        
        // Format expanded details
        const stackTrace = log.stack ? escapeHtml(log.stack) : '';
        
        return `
            <div class="log-item-row ${log.level} ${isInSelectedRange ? 'selected-range' : ''} ${isExpanded ? 'expanded' : ''}" 
                 data-index="${index}" 
                 data-expanded="${isExpanded}">
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
                <div class="log-type-column">
                    <span class="log-level-badge ${log.level}">${level}</span>
                </div>
                <div class="log-content-column">
                    <span class="log-message-preview">${messagePreview}</span>
                </div>
                <div class="log-position-column">
                    <span class="log-timestamp">${timestamp}</span>
                    ${stackLocation ? `<span class="log-location">${escapeHtml(stackLocation)}</span>` : ''}
                </div>
                <div class="log-expand-indicator">▼</div>
                <div class="trim-checkbox-container">
                    <input type="checkbox" 
                           class="trim-checkbox trim-end" 
                           data-index="${index}"
                           data-type="end"
                           data-indeterminate="${endShowIndicator ? 'true' : 'false'}"
                           ${endChecked ? 'checked' : ''}
                           ${endDisabled ? 'disabled' : ''}
                           title="${endDisabled ? 'Cannot select end before start point' : 'Set as end point (can be same as start)'}">
                </div>
                ${isExpanded ? `
                <div class="log-expanded-details">
                    <div class="log-full-message">${fullMessage}</div>
                    ${stackTrace ? `<div class="log-stack">Stack:\n${stackTrace}</div>` : ''}
                </div>
                ` : ''}
            </div>
        `;
    }).join('');
    
    // Attach event listeners to checkboxes after a brief delay to ensure DOM is ready
    setTimeout(() => {
        attachTrimCheckboxListeners();
        // Set indeterminate state on checkboxes that need it
        setIndeterminateStates();
        // Sync timeline with trim selection
        syncTimelineWithTrimSelection();
        // Attach row expansion handlers
        attachRowExpansionHandlers();
    }, 0);

    // Update counts display
    updateCountsDisplay();

    // Auto-scroll to bottom if enabled
    if (autoScrollEnabled) {
        // Use setTimeout to ensure DOM has updated
        setTimeout(scrollToBottom, 10);
    }
}

// Toggle row expansion
function toggleRowExpansion(index) {
    if (expandedRows.has(index)) {
        expandedRows.delete(index);
    } else {
        expandedRows.add(index);
    }
    // Re-render the affected row
    renderLogList();
}

// Attach row expansion click handlers
function attachRowExpansionHandlers() {
    const rows = document.querySelectorAll('.log-item-row');
    rows.forEach(row => {
        // Check if handler already attached (using data attribute)
        if (row.dataset.expansionHandlerAttached === 'true') {
            return;
        }
        
        // Mark as having handler attached
        row.dataset.expansionHandlerAttached = 'true';
        
        // Add click handler to row (but not to checkboxes)
        row.addEventListener('click', (e) => {
            // Don't expand if clicking on checkboxes
            if (e.target.classList.contains('trim-checkbox') || e.target.closest('.trim-checkbox-container')) {
                return;
            }
            
            const index = parseInt(row.getAttribute('data-index'));
            toggleRowExpansion(index);
        });
    });
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
    
    // Calculate trimmed selection (what would actually be copied)
    let trimmedLogs = [];
    let trimmedCount = 0;
    if (selectedStartIndex !== null) {
        if (selectedEndIndex !== null) {
            // Both start and end selected
            trimmedCount = selectedEndIndex - selectedStartIndex + 1;
            trimmedLogs = filteredLogs.slice(selectedStartIndex, selectedEndIndex + 1);
        } else {
            // Start selected but no end = from start to end of filtered logs
            trimmedCount = filteredCount - selectedStartIndex;
            trimmedLogs = filteredLogs.slice(selectedStartIndex);
        }
    } else {
        // No trim selection, trimmed = filtered
        trimmedLogs = filteredLogs;
        trimmedCount = filteredCount;
    }
    
    // Calculate lines and tokens for filtered logs
    let filteredLines = 0;
    let filteredTokens = 0;
    filteredLogs.forEach(log => {
        const fullMessage = formatLogMessage(log);
        const stackTrace = log.stack ? log.stack : '';
        const text = `[${formatTimestamp(log.timestamp)}] [${log.level.toUpperCase()}] ${fullMessage}${stackTrace ? `\nStack Trace:\n${stackTrace}` : ''}`;
        filteredLines += text.split('\n').length;
        filteredTokens += Math.ceil(text.length / 4);
    });
    
    // Calculate lines and tokens for trimmed logs (what would be copied)
    let trimmedLines = 0;
    let trimmedTokens = 0;
    trimmedLogs.forEach((log, index) => {
        const fullMessage = formatLogMessage(log);
        const stackTrace = log.stack ? log.stack : '';
        let text = `[${formatTimestamp(log.timestamp)}] [${log.level.toUpperCase()}] ${fullMessage}`;
        if (stackTrace) {
            text += `\nStack Trace:\n${stackTrace}`;
        }
        // Add separator between entries (except last)
        if (index < trimmedLogs.length - 1) {
            text += '\n\n';
        }
        trimmedLines += text.split('\n').length;
        trimmedTokens += Math.ceil(text.length / 4);
    });
    
    // Update display
    totalCountSpan.textContent = totalCount;
    filteredCountSpan.textContent = filteredCount;
    trimmedCountSpan.textContent = trimmedCount;
    
    // Update lines and tokens
    if (filteredLinesSpan) filteredLinesSpan.textContent = filteredLines;
    if (filteredTokensSpan) filteredTokensSpan.textContent = (filteredTokens / 1000).toFixed(1);
    if (trimmedLinesSpan) trimmedLinesSpan.textContent = trimmedLines;
    if (trimmedTokensSpan) trimmedTokensSpan.textContent = (trimmedTokens / 1000).toFixed(1);
}

// Identify click log entries from console logs
function identifyClickLogs(logs) {
    const clickLogs = [];
    
    logs.forEach((log, index) => {
        // Check if this is a click log entry
        if (log.level === 'log' && log.message && log.message.startsWith('// clicked on')) {
            // Extract button label using regex
            const match = log.message.match(/\/\/ clicked on (.+?) \|/);
            if (match && match[1]) {
                const label = match[1].trim();
                clickLogs.push({
                    logIndex: index, // Index in filteredLogs array
                    label: label,
                    timestamp: log.timestamp,
                    log: log
                });
            }
        }
    });
    
    return clickLogs;
}

// Render timeline with click event badges
function renderTimeline(clickEvents) {
    if (!timelineContent) {
        return;
    }
    
    // Store existing badge elements to preserve event listeners and state
    const existingBadges = Array.from(timelineContent.querySelectorAll('.timeline-badge'));
    const existingBadgeMap = new Map();
    existingBadges.forEach(badge => {
        const logIndex = parseInt(badge.getAttribute('data-log-index'));
        existingBadgeMap.set(logIndex, badge);
    });
    
    // Clear existing timeline content
    timelineContent.innerHTML = '';
    
    if (clickEvents.length === 0) {
        // No clicks - show empty connector
        const connector = document.createElement('div');
        connector.className = 'timeline-connector';
        timelineContent.appendChild(connector);
        return;
    }
    
    // Render badges and connectors
    clickEvents.forEach((clickEvent, clickIndex) => {
        // Create connector before badge (except first)
        if (clickIndex > 0) {
            const connector = document.createElement('div');
            connector.className = 'timeline-connector';
            timelineContent.appendChild(connector);
        }
        
        // Reuse existing badge if available, otherwise create new one
        let badge = existingBadgeMap.get(clickEvent.logIndex);
        if (!badge) {
            // Create new badge element
            badge = document.createElement('span');
            badge.className = 'badge timeline-badge';
            badge.textContent = clickEvent.label.length > 20 ? clickEvent.label.substring(0, 20) + '...' : clickEvent.label;
            badge.setAttribute('data-log-index', clickEvent.logIndex);
            badge.setAttribute('data-click-index', clickIndex);
            badge.title = clickEvent.label; // Full label on hover
            
            // Add click listener
            badge.addEventListener('click', (e) => {
                e.stopPropagation();
                handleTimelineBadgeClick(clickIndex, clickEvent.logIndex);
            });
        } else {
            // Update existing badge attributes
            badge.setAttribute('data-click-index', clickIndex);
            // Update text if label changed
            const newText = clickEvent.label.length > 20 ? clickEvent.label.substring(0, 20) + '...' : clickEvent.label;
            if (badge.textContent !== newText) {
                badge.textContent = newText;
            }
        }
        
        // Apply selected state styling
        badge.classList.remove('selected-start', 'selected-end');
        if (selectedStartIndex === clickEvent.logIndex) {
            badge.classList.add('selected-start');
        } else if (selectedEndIndex === clickEvent.logIndex) {
            badge.classList.add('selected-end');
        }
        
        timelineContent.appendChild(badge);
    });
    
    // Add final connector after last badge
    if (clickEvents.length > 0) {
        const connector = document.createElement('div');
        connector.className = 'timeline-connector';
        timelineContent.appendChild(connector);
    }
}

// Handle timeline badge click with smart selection logic
function handleTimelineBadgeClick(clickIndex, logIndex) {
    isUpdatingTrimSelection = true;
    
    // Get current selections
    const currentStartIndex = selectedStartIndex;
    const currentEndIndex = selectedEndIndex;
    
    // Find the click event for this log index to determine position
    const clickedEvent = clickEvents.find(ce => ce.logIndex === logIndex);
    if (!clickedEvent) {
        isUpdatingTrimSelection = false;
        return;
    }
    
    // Find positions of current selections in click events array
    const currentStartClickIndex = currentStartIndex !== null 
        ? clickEvents.findIndex(ce => ce.logIndex === currentStartIndex)
        : -1;
    const currentEndClickIndex = currentEndIndex !== null
        ? clickEvents.findIndex(ce => ce.logIndex === currentEndIndex)
        : -1;
    
    // Smart selection logic
    if (currentStartIndex === null) {
        // No START exists - set as START
        selectedStartIndex = logIndex;
        selectedEndIndex = null;
    } else if (currentEndIndex === null) {
        // START exists but no END
        if (logIndex > currentStartIndex) {
            // Badge is after START - set as END
            selectedEndIndex = logIndex;
        } else {
            // Badge is before START - replace START
            selectedStartIndex = logIndex;
        }
    } else {
        // Both START and END exist
        if (clickIndex < currentEndClickIndex) {
            // Badge is before current END - set as START (replace if needed)
            selectedStartIndex = logIndex;
            // Clear END if new START is after current END
            if (logIndex > currentEndIndex) {
                selectedEndIndex = null;
            }
        } else if (clickIndex > currentStartClickIndex) {
            // Badge is after current START - set as END (replace if needed)
            selectedEndIndex = logIndex;
            // Clear START if new END is before current START
            if (logIndex < currentStartIndex) {
                selectedStartIndex = null;
            }
        } else {
            // Clicking on the same badge - toggle selection
            if (logIndex === currentStartIndex) {
                selectedStartIndex = null;
            } else if (logIndex === currentEndIndex) {
                selectedEndIndex = null;
            }
        }
    }
    
    // Re-render timeline and log list
    renderTimeline(clickEvents);
    renderLogList();
    
    // Scroll to selected log entry
    scrollToSelectedLog(logIndex);
    
    // Allow loadLogs to run again after a brief delay
    setTimeout(() => {
        isUpdatingTrimSelection = false;
    }, 100);
}

// Scroll to selected log entry in the list
function scrollToSelectedLog(logIndex) {
    // Find the log row element
    const logRows = document.querySelectorAll('.log-item-row');
    if (logRows[logIndex]) {
        logRows[logIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

// Sync timeline selection with trim checkbox selection
function syncTimelineWithTrimSelection() {
    // Re-render timeline to reflect current trim selection
    renderTimeline(clickEvents);
}

// Format log message (full version)
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

// Format log message preview (truncated for compact view)
function formatLogMessagePreview(log) {
    const fullMessage = formatLogMessage(log);
    if (!fullMessage) return '(empty)';
    
    // Get first line or truncate to ~100 chars
    const firstLine = fullMessage.split('\n')[0];
    if (firstLine.length <= 100) {
        return firstLine;
    }
    return firstLine.substring(0, 100) + '...';
}

// Extract stack trace location (file:line)
function extractStackLocation(stack) {
    if (!stack) return '';
    
    // Try to match patterns like:
    // at functionName (file://path/to/file.js:123:45)
    // at file://path/to/file.js:123:45
    // at http://domain.com/file.js:123:45
    const patterns = [
        /at\s+(?:[^\s]+\s+\()?([^:]+):(\d+)(?::(\d+))?/,
        /\(([^:]+):(\d+)(?::(\d+))?\)/
    ];
    
    for (const pattern of patterns) {
        const match = stack.match(pattern);
        if (match) {
            const file = match[1].split('/').pop(); // Get filename only
            const line = match[2];
            return `${file}:${line}`;
        }
    }
    
    return '';
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
            // Note: Don't clear searchInput - preserve filter on clear
            selectedStartIndex = null;
            selectedEndIndex = null;
            expandedRows.clear();
            clickEvents = [];
            renderTimeline(clickEvents);
            renderLogList();
            updateCountsDisplay();
        }
    });
}

// Clear expanded rows when logs are cleared
function clearExpandedRows() {
    expandedRows.clear();
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
                
                // If end is before start, clear end selection (allow end == start for single row)
                if (selectedEndIndex !== null && selectedEndIndex < index) {
                    selectedEndIndex = null;
                }
            } else {
                // Unchecking clears the start selection
                selectedStartIndex = null;
            }
            
            // Save trim selection to storage for sidepanel access
            saveTrimSelectionToStorage();
            
            // Re-render to update disabled states and ensure checkbox stays checked
            // The state is set, so renderLogList will recreate it as checked
            renderLogList();
            
            // Allow loadLogs to run again after a delay (longer to prevent flickering)
            setTimeout(() => {
                isUpdatingTrimSelection = false;
            }, 300);
        });
    });
    
    endCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            isUpdatingTrimSelection = true; // Prevent loadLogs from interfering
            
            const index = parseInt(e.target.getAttribute('data-index'));
            
            if (e.target.checked) {
                // Validate: end must be at or after start (allows same row)
                if (selectedStartIndex !== null && index < selectedStartIndex) {
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
            
            // Save trim selection to storage for sidepanel access
            saveTrimSelectionToStorage();
            
            // Re-render to update disabled states, indicators, and ensure checkbox stays checked
            // The state is set, so renderLogList will recreate it as checked
            renderLogList();
            
            // Sync timeline with trim selection
            syncTimelineWithTrimSelection();
            
            // Allow loadLogs to run again after a delay (longer to prevent flickering)
            setTimeout(() => {
                isUpdatingTrimSelection = false;
            }, 300);
        });
    });
}

// Save trim selection to storage for sidepanel access
function saveTrimSelectionToStorage() {
    chrome.storage.local.set({
        consoleViewerTrimSelection: {
            selectedStartIndex: selectedStartIndex,
            selectedEndIndex: selectedEndIndex,
            timestamp: Date.now()
        }
    });
}

// Copy all logs to clipboard
function copyAllLogs() {
    if (currentTab === 'console') {
        if (filteredLogs.length === 0) {
            return;
        }
        
        let logsToCopy = [];
        
        // Get trimmed logs based on selection
        if (selectedStartIndex !== null) {
            if (selectedEndIndex !== null) {
                // Both start and end selected - copy range
                logsToCopy = filteredLogs.slice(selectedStartIndex, selectedEndIndex + 1);
            } else {
                // Only start selected - copy from start to end of filtered logs
                logsToCopy = filteredLogs.slice(selectedStartIndex);
            }
        } else {
            // No trim selection - copy all filtered logs
            logsToCopy = filteredLogs;
        }
        
        if (logsToCopy.length === 0) {
            return;
        }
        
        let text = '';
        
        logsToCopy.forEach((log, index) => {
            const timestamp = formatTimestamp(log.timestamp);
            const level = log.level.toUpperCase();
            const fullMessage = formatLogMessage(log);
            const stackTrace = log.stack ? log.stack : '';
            
            // Full details for each log entry
            text += `[${timestamp}] [${level}] ${fullMessage}`;
            
            // Add stack trace if available
            if (stackTrace) {
                text += `\nStack Trace:\n${stackTrace}`;
            }
            
            // Add separator between entries (except last)
            if (index < logsToCopy.length - 1) {
                text += '\n\n';
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
