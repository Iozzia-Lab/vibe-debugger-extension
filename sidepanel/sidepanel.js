/**
 * Popup Script - Handles UI interactions and data display
 */

let allRequests = [];
let filteredRequests = [];
let currentDetailRequest = null;
let currentFilter = 'all';
let errorsFilterActive = false; // Independent error filter toggle
let isContextInvalidated = false;
let selectedRequestIds = new Set(); // Track selected request IDs
let currentTabId = null; // Track current tab ID

// DOM Elements
const requestList = document.getElementById('requestList');
const listView = document.getElementById('listView');
const detailView = document.getElementById('detailView');
const requestCount = document.getElementById('requestCount');
const searchInput = document.getElementById('searchInput');
const errorFilterInput = document.getElementById('errorFilterInput');
const searchHistoryDropdown = document.getElementById('searchHistoryDropdown');
const recordBtn = document.getElementById('recordBtn');
const reloadBtn = document.getElementById('reloadBtn');
const clearBtn = document.getElementById('clearBtn');
const backBtn = document.getElementById('backBtn');
const showHeadersDetailCheckbox = document.getElementById('showHeadersDetail');
const searchSection = document.getElementById('searchSection');
let searchSectionExpanded = false; // Track toggle state - default collapsed
const copyDetailBtn = document.getElementById('copyDetailBtn');
const screenshotBtn = document.getElementById('screenshotBtn');
const cropBtn = document.getElementById('cropBtn');
const markupBtn = document.getElementById('markupBtn');
const undockBtn = document.getElementById('undockBtn');

// Screenshot storage (in-memory)
let lastScreenshotDataUrl = null;
let lastMarkupData = null;
const projectsBtn = document.getElementById('projectsBtn');
const projectsModal = document.getElementById('projectsModal');
const projectsList = document.getElementById('projectsList');
const projectFormModal = document.getElementById('projectFormModal');
const projectForm = document.getElementById('projectForm');
const addProjectBtn = document.getElementById('addProjectBtn');
const closeProjectsModal = document.getElementById('closeProjectsModal');
const closeProjectFormModal = document.getElementById('closeProjectFormModal');
const cancelProjectForm = document.getElementById('cancelProjectForm');
// Close panel button removed
const copySelectedBtn = document.getElementById('copySelectedBtn');
const openConsoleViewerBtn = document.getElementById('openConsoleViewerBtn');
const copyConsoleCheckbox = document.getElementById('copyConsoleCheckbox');
const consoleStats = document.getElementById('consoleStats');
const tabInfoSection = document.getElementById('tabInfoSection');
const tabFavicon = document.getElementById('tabFavicon');
const tabTitle = document.getElementById('tabTitle');
const tabUrl = document.getElementById('tabUrl');
const activeProjectName = document.getElementById('activeProjectName');
const projectsDropdown = document.getElementById('projectsDropdown');
const projectsButtonWrapper = document.querySelector('.projects-button-wrapper');
const loadBtn = document.getElementById('loadBtn');
let editingProjectId = null;
let activeProjectId = null; // Currently active project
let currentTabUrl = null; // Current tab URL for matching
let isCopyButtonGreen = false; // Track if copy button is in green (copied) state

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadFilterState();
    loadRecordingState();
    loadRequests();
    setupEventListeners();
    loadProjects();
    loadActiveTabInfo();
    updateCopySelectedButton();
    updateConsoleStats();
    updateMarkupButtonState();
    updateActiveProjectDisplay();
    updateReloadButton();
    
    // Refresh requests periodically (500ms balance between responsiveness and performance)
    setInterval(loadRequests, 500);
    
    // Refresh tab info periodically
    setInterval(() => {
        loadActiveTabInfo();
        updateReloadButton();
    }, 2000);
    
    // Refresh console stats periodically
    setInterval(() => {
        updateConsoleStats();
    }, 2000);
    
    // Listen for console viewer filter changes
    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.consoleViewerFilter) {
            // Console viewer filter changed, update stats
            updateConsoleStats();
        }
    });
    
    // Animate loading dots for pending requests
    setInterval(() => {
        animateLoadingDots();
    }, 500);
});

// Setup event listeners
function setupEventListeners() {
    recordBtn.addEventListener('click', toggleRecording);
    if (reloadBtn) {
        reloadBtn.addEventListener('click', () => handleReloadOrLoad(true));
    }
    if (loadBtn) {
        loadBtn.addEventListener('click', () => handleReloadOrLoad(false));
    }
    clearBtn.addEventListener('click', clearAllRequests);
    backBtn.addEventListener('click', showListView);
    searchInput.addEventListener('input', filterRequests);
    if (errorFilterInput) {
        errorFilterInput.addEventListener('input', (e) => {
            filterRequests();
            // Auto-save error filter strings to active project
            saveErrorFilterToActiveProject();
        });
    }
    
    // Search toggle button
    const searchToggleBtn = document.getElementById('searchToggleBtn');
    if (searchToggleBtn && searchSection) {
        searchToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            searchSectionExpanded = !searchSectionExpanded;
            if (searchSectionExpanded) {
                searchSection.classList.remove('hidden');
                const icon = searchToggleBtn.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-chevron-down');
                    icon.classList.add('fa-chevron-up');
                }
            } else {
                searchSection.classList.add('hidden');
                const icon = searchToggleBtn.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-chevron-up');
                    icon.classList.add('fa-chevron-down');
                }
            }
        });
    }
    
    // Copy Selected button
    if (copySelectedBtn) {
        copySelectedBtn.addEventListener('click', copySelected);
    }
    
    // Copy Detail button
    if (copyDetailBtn) {
        copyDetailBtn.addEventListener('click', (e) => {
            console.log('Copy detail button clicked');
            e.preventDefault();
            e.stopPropagation();
            copyDetailRequest(e);
        });
        console.log('Copy detail button event listener attached');
    } else {
        console.error('copyDetailBtn not found in DOM');
    }
    
    // Screenshot button
    if (screenshotBtn) {
        screenshotBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            takeScreenshot();
        });
    }
    
    // Crop screenshot button
    if (cropBtn) {
        cropBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            startCropSelection();
        });
    }
    
    // Markup button
    if (markupBtn) {
        markupBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!markupBtn.disabled) {
                openMarkupViewer();
            }
        });
    }
    
    // Copy Console checkbox change event
    if (copyConsoleCheckbox) {
        copyConsoleCheckbox.addEventListener('change', () => {
            updateConsoleStats();
        });
    }
    
    // Open Console Viewer button
    if (openConsoleViewerBtn) {
        openConsoleViewerBtn.addEventListener('click', openConsoleViewer);
    }
    
    // Console stats button - also opens console viewer
    if (consoleStats) {
        consoleStats.addEventListener('click', openConsoleViewer);
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
    // Close panel button removed
    
    // Projects button - toggle dropdown
    if (projectsBtn) {
        projectsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleProjectsDropdown();
        });
    }
    
    // Close dropdown when clicking outside
    // Use mousedown instead of click to catch events earlier
    document.addEventListener('mousedown', (e) => {
        if (!projectsDropdown) return;
        
        // Check if dropdown is visible
        if (projectsDropdown.classList.contains('hidden')) {
            return;
        }
        
        // Get the wrapper element
        const wrapper = projectsButtonWrapper || (projectsBtn && projectsBtn.parentElement);
        
        // Check if click is outside the wrapper
        if (wrapper) {
            if (!wrapper.contains(e.target)) {
                // Click is outside wrapper - close dropdown
                projectsDropdown.classList.add('hidden');
            }
        } else {
            // Fallback: check button and dropdown separately
            const isButtonClick = projectsBtn && (e.target === projectsBtn || projectsBtn.contains(e.target));
            const isDropdownClick = projectsDropdown.contains(e.target);
            
            if (!isButtonClick && !isDropdownClick) {
                // Click is outside both - close dropdown
                projectsDropdown.classList.add('hidden');
            }
        }
    });
    
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
            document.getElementById('projectFrontendDomain').value = '';
            document.getElementById('projectBackendDomain').value = '';
            document.getElementById('projectLogFile').value = '';
            projectFormModal.classList.remove('hidden');
        });
    }
    
    // Project form submit
    if (projectForm) {
        projectForm.addEventListener('submit', saveProject);
    }
    
    // Filter buttons (excluding Errors button which is handled separately)
    document.querySelectorAll('.filter-btn:not(#errorsFilterBtn)').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const filter = e.target.getAttribute('data-filter');
            setFilter(filter);
        });
    });
    
    // Errors filter button (independent toggle)
    const errorsFilterBtn = document.getElementById('errorsFilterBtn');
    if (errorsFilterBtn) {
        errorsFilterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            errorsFilterActive = !errorsFilterActive;
            errorsFilterBtn.classList.toggle('active', errorsFilterActive);
            applyFilters();
        });
    }
    
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
let lastRequestCount = 0;
let lastRequestIds = new Set(); // Track request IDs to detect actual changes

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
                const currentRequestCount = response.requests.length;
                const currentRequestIds = new Set(response.requests.map(r => r.id));
                
                // Check if requests actually changed (new requests or status changes)
                const hasNewRequests = currentRequestCount > lastRequestCount;
                const hasNewIds = [...currentRequestIds].some(id => !lastRequestIds.has(id));
                
                // Check if any existing requests changed status (pending -> complete)
                let hasStatusChanges = false;
                if (!hasNewIds && currentRequestCount === lastRequestCount && allRequests.length > 0) {
                    // Compare status of existing requests
                    const oldRequestsMap = new Map(allRequests.map(r => [r.id, r]));
                    hasStatusChanges = response.requests.some(newReq => {
                        const oldReq = oldRequestsMap.get(newReq.id);
                        if (!oldReq) return false;
                        const oldPending = oldReq.pending === true || oldReq.status === null || oldReq.status === undefined;
                        const newPending = newReq.pending === true || newReq.status === null || newReq.status === undefined;
                        return oldPending !== newPending || oldReq.status !== newReq.status;
                    });
                }
                
                // Only update if something actually changed
                if (hasNewRequests || hasNewIds || hasStatusChanges) {
                    allRequests = response.requests;
                    // Re-apply filters after loading requests
                    applyFilters();
                    updateCopySelectedButton();
                    updateConsoleStats();
                    
                    // Update tracking
                    lastRequestCount = currentRequestCount;
                    lastRequestIds = currentRequestIds;
                    
                    // If new requests arrived, immediately refresh again to catch pending ones
                    if (hasNewRequests || hasNewIds) {
                        setTimeout(loadRequests, 200);
                    }
                } else {
                    // No changes, just update stats (don't re-render)
                    updateConsoleStats();
                }
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
    // Count display removed - function kept for compatibility but does nothing
}

// Set filter type
function setFilter(filter) {
    currentFilter = filter;
    
    // Save filter state to storage
    chrome.storage.local.set({ currentFilter: filter }, () => {
        // Update active button (excluding Errors button which is independent)
        document.querySelectorAll('.filter-btn:not(#errorsFilterBtn)').forEach(btn => {
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

// Handle reload or load based on URL match
function handleReloadOrLoad(shouldReload) {
    if (shouldReload) {
        // Reload current tab
        chrome.runtime.sendMessage({ type: 'RELOAD_PAGE' }, (response) => {
            if (response && response.success) {
                // Clear requests after reload
                clearAllRequests();
                // Reload error filter from active project after reload
                setTimeout(() => {
                    loadErrorFilterFromActiveProject();
                }, 500);
            }
        });
    } else {
        // Load project domain (just the domain, no path)
        chrome.storage.local.get(['projects', 'activeProjectId'], (result) => {
            const projects = result.projects || [];
            const activeProjectId = result.activeProjectId;
            const project = projects.find(p => p.id === activeProjectId);
            
            if (project && project.frontendDomain) {
                // Construct URL with http:// prefix if not present - just the domain, no path
                let projectUrl = project.frontendDomain;
                if (!projectUrl.startsWith('http://') && !projectUrl.startsWith('https://')) {
                    projectUrl = 'http://' + projectUrl;
                }
                
                // Ensure it's just the domain (remove any existing path)
                try {
                    const urlObj = new URL(projectUrl);
                    projectUrl = urlObj.origin; // Just protocol + host (domain + port if present)
                } catch (e) {
                    // If URL parsing fails, use as-is
                }
                
                        // Navigate to project domain
                        chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB_INFO' }, (tabInfo) => {
                            if (tabInfo && tabInfo.tabInfo && tabInfo.tabInfo.id) {
                                // Optimistically show reload button immediately for better UX
                                // The periodic refresh will verify the match
                                if (reloadBtn && loadBtn) {
                                    reloadBtn.style.display = 'flex';
                                    loadBtn.style.display = 'none';
                                }
                                
                                // Initiate navigation
                                chrome.tabs.update(tabInfo.tabInfo.id, { url: projectUrl }, () => {
                                    // After navigation starts, wait a moment then refresh tab info
                                    // This ensures we get the updated URL after navigation
                                    setTimeout(() => {
                                        loadActiveTabInfo();
                                        updateReloadButton();
                                    }, 500);
                                });
                            }
                        });
            }
        });
    }
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
    
    // Apply errors filter (independent toggle - works with other filters)
    if (errorsFilterActive) {
        requests = requests.filter(req => {
            const isPending = req.pending === true || req.status === null || req.status === undefined;
            if (isPending || !req.response || !errorFilterInput) {
                return false;
            }
            
            const errorFilterValue = errorFilterInput.value.trim();
            if (!errorFilterValue) {
                return false;
            }
            
            // Parse comma-separated error strings
            const errorStrings = errorFilterValue.split(',').map(s => s.trim()).filter(s => s.length > 0);
            if (errorStrings.length === 0) {
                return false;
            }
            
            // Check if response contains any error string
            let responseStr = '';
            if (typeof req.response === 'string') {
                responseStr = req.response;
            } else {
                try {
                    responseStr = JSON.stringify(req.response);
                } catch (e) {
                    responseStr = String(req.response);
                }
            }
            
            // Return true if any error string matches
            return errorStrings.some(errorStr => responseStr.includes(errorStr));
        });
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
    
    if (filteredRequests.length === 0) {
        requestList.innerHTML = `
            <div class="empty-state">
                <p>No requests found.</p>
                ${searchInput.value ? '<p class="hint">Try a different search term.</p>' : ''}
            </div>
        `;
        return;
    }
    
    requestList.innerHTML = filteredRequests.map((req, index) => {
        const isPending = req.pending === true || req.status === null || req.status === undefined;
        const statusClass = isPending ? 'pending' : getStatusClass(req.status);
        const uriPath = getUriPath(req.url);
        const separator = index > 0 ? '<div class="request-separator"></div>' : '';
        
        // Remove pending requests from selection (can't copy incomplete requests)
        if (isPending && selectedRequestIds.has(req.id)) {
            selectedRequestIds.delete(req.id);
        }
        
        const isChecked = !isPending && selectedRequestIds.has(req.id);
        const disabledAttr = isPending ? 'disabled' : '';
        
        // Check if response contains any of the error filter strings (comma-separated)
        let hasErrorInResponse = false;
        if (!isPending && req.response && errorFilterInput) {
            const errorFilterValue = errorFilterInput.value.trim();
            if (errorFilterValue) {
                // Parse comma-separated error strings
                const errorStrings = errorFilterValue.split(',').map(s => s.trim()).filter(s => s.length > 0);
                
                if (errorStrings.length > 0) {
                    let responseStr = '';
                    if (typeof req.response === 'string') {
                        responseStr = req.response;
                    } else {
                        // For objects, stringify and check
                        try {
                            responseStr = JSON.stringify(req.response);
                        } catch (e) {
                            // If stringify fails, check toString if available
                            responseStr = String(req.response);
                        }
                    }
                    
                    // Check if any error string matches in the response
                    hasErrorInResponse = errorStrings.some(errorStr => responseStr.includes(errorStr));
                }
            }
        }
        
        // Show loading indicator for pending requests
        const statusDisplay = isPending 
            ? '<span class="request-status-text pending"><span class="loading-dots">.</span></span>'
            : `<span class="request-status-text ${statusClass}">${req.status}</span>`;
        
        // Add error badge if response contains ERROR
        const errorBadge = hasErrorInResponse 
            ? '<span class="badge error-badge">Error</span>' 
            : '';
        
        return `${separator}
            <div class="request-item-text" data-request-id="${req.id}" title="${escapeHtml(req.url)}">
                <input type="checkbox" class="request-checkbox" data-request-id="${req.id}" ${isChecked ? 'checked' : ''} ${disabledAttr}>
                <span class="request-url-text" data-request-id="${req.id}">${escapeHtml(uriPath)}</span>
                ${errorBadge}
                ${statusDisplay}
            </div>
        `;
    }).join('');
    
    // Add checkbox listeners (stop propagation to prevent detail view)
    requestList.querySelectorAll('.request-checkbox').forEach(checkbox => {
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            // Don't process clicks on disabled checkboxes
            if (checkbox.disabled) {
                e.preventDefault();
                return;
            }
            const requestId = checkbox.getAttribute('data-request-id');
            if (checkbox.checked) {
                selectedRequestIds.add(requestId);
            } else {
                selectedRequestIds.delete(requestId);
            }
            updateCopySelectedButton();
            updateConsoleStats(); // Update stats when selection changes
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
    const isPending = request.pending === true || request.status === null || request.status === undefined;
    if (isPending) {
        document.getElementById('detailStatus').innerHTML = '<span class="loading-dots">.</span>';
    } else {
        document.getElementById('detailStatus').textContent = `${request.status} ${request.statusText || ''}`;
    }
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
    // Respect toggle state - only show if expanded
    if (searchSectionExpanded) {
        searchSection.classList.remove('hidden');
    } else {
        searchSection.classList.add('hidden');
    }
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
            // Don't reset error filter - it's a project setting, not request data
            // The error filter should persist and be loaded from the active project
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
    
    // Clear log file for active project
    if (activeProjectId) {
        clearProjectLogFile(activeProjectId);
    }
}

// Clear log file for a project
function clearProjectLogFile(projectId) {
    chrome.storage.local.get(['projects', 'activeProjectId'], (result) => {
        const projects = result.projects || [];
        const activeProjectId = result.activeProjectId;
        const project = projects.find(p => p.id === projectId);
        
        // Helper function to send console log
        const sendConsoleLog = (level, message) => {
            chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB_INFO' }, (tabInfo) => {
                if (tabInfo && tabInfo.tabInfo && tabInfo.tabInfo.id) {
                    const logId = 'log-clear-' + Date.now();
                    const timestamp = Date.now();
                    
                    chrome.runtime.sendMessage({
                        type: 'CONSOLE_LOG',
                        tabId: tabInfo.tabInfo.id,
                        data: {
                            id: logId,
                            level: level,
                            message: `[Log File Clear] ${message}`,
                            args: [`[Log File Clear] ${message}`],
                            timestamp: timestamp,
                            stack: null
                        }
                    });
                }
            });
        };
        
        // Only clear if project is active and URL matches
        if (!project) {
            sendConsoleLog('error', 'Project not found');
            return;
        }
        
        if (projectId !== activeProjectId) {
            sendConsoleLog('error', `Project not active (active: ${activeProjectId}, requested: ${projectId})`);
            return;
        }
        
        // Check URL match - compare domains with normalization (same as updateReloadButton)
        try {
            if (!currentTabUrl) {
                sendConsoleLog('error', 'No current tab URL');
                return;
            }
            
            const tabUrlObj = new URL(currentTabUrl);
            const tabDomain = tabUrlObj.host.toLowerCase().trim();
            
            let projectFrontendDomain = project.frontendDomain || project.domain;
            
            // Normalize project domain - remove protocol if present, extract just host
            if (projectFrontendDomain) {
                try {
                    // If it looks like a URL, parse it to get just the host
                    if (projectFrontendDomain.includes('://') || projectFrontendDomain.startsWith('http')) {
                        const projectUrlObj = new URL(projectFrontendDomain.startsWith('http') ? projectFrontendDomain : 'http://' + projectFrontendDomain);
                        projectFrontendDomain = projectUrlObj.host;
                    }
                } catch (e) {
                    // If parsing fails, use as-is (might already be just a domain)
                }
            }
            
            const normalizedProjectDomain = (projectFrontendDomain || '').toLowerCase().trim();
            
            if (tabDomain !== normalizedProjectDomain) {
                sendConsoleLog('error', `URL mismatch (tab: ${tabDomain}, project: ${normalizedProjectDomain})`);
                return;
            }
        } catch (e) {
            sendConsoleLog('error', `Invalid URL: ${e.message}`);
            return;
        }
        
        // Construct full log path
        const fullLogPath = project.folder + '\\' + project.logFilePath;
        
        // Construct request URL using backend domain
        const projectBackendDomain = project.backendDomain || project.domain;
        if (!projectBackendDomain) {
            sendConsoleLog('error', 'No backend domain configured for project');
            return;
        }
        
        let projectUrl = projectBackendDomain;
        if (!projectUrl.startsWith('http://') && !projectUrl.startsWith('https://')) {
            projectUrl = 'http://' + projectUrl;
        }
        // Remove trailing slash from projectUrl if present, then add script path
        projectUrl = projectUrl.replace(/\/+$/, '');
        // Use PHP script (comes with XAMPP, no Python needed)
        const scriptUrl = `${projectUrl}/debug_clear_log.php?log=${encodeURIComponent(fullLogPath)}`;
        
        sendConsoleLog('log', `Attempting to clear log: ${scriptUrl}`);
        
        // Send HTTP GET request
        fetch(scriptUrl, {
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            // Check content type
            const contentType = response.headers.get('content-type');
            if (contentType && !contentType.includes('application/json')) {
                // Try to read as text first to see what we got
                return response.text().then(text => {
                    // Check if server returned PHP code instead of executing it
                    if (text.trim().startsWith('<?php') || text.trim().startsWith('<!DOCTYPE')) {
                        throw new Error('Server returned PHP script/HTML instead of executing it. Make sure PHP is enabled in your web server.');
                    }
                    // Try to parse as JSON anyway (might be JSON with wrong content-type)
                    try {
                        return JSON.parse(text);
                    } catch (e) {
                        throw new Error(`Server returned non-JSON response (Content-Type: ${contentType}). Response preview: ${text.substring(0, 200)}`);
                    }
                });
            }
            return response.json();
        })
        .then(data => {
            if (data && typeof data === 'object' && 'success' in data) {
                if (data.success) {
                    sendConsoleLog('log', `Success: ${data.message}`);
                } else {
                    sendConsoleLog('error', `Failed: ${data.message}`);
                }
            } else {
                sendConsoleLog('error', `Unexpected response format: ${JSON.stringify(data)}`);
            }
        })
        .catch(error => {
            sendConsoleLog('error', `Error: ${error.message || String(error)}`);
        });
    });
}

// Check if current tab URL matches active project domain (synchronous check)
function checkUrlMatch() {
    if (!activeProjectId || !currentTabUrl) {
        return false;
    }
    
    // This is called from clearProjectLogFile which already has project data
    // So we'll do a quick synchronous check here
    try {
        const tabUrlObj = new URL(currentTabUrl);
        const tabDomain = tabUrlObj.host; // Includes port if present
        
        // We need project domain - this will be passed from caller context
        // For now, return false and let the async version handle it
        return false;
    } catch (e) {
        return false;
    }
}

// Update reload/load button based on URL match
function updateReloadButton() {
    if (!reloadBtn || !loadBtn) {
        return;
    }
    
    chrome.storage.local.get(['projects', 'activeProjectId'], (result) => {
        const projects = result.projects || [];
        const activeProjectId = result.activeProjectId;
        
        if (!activeProjectId || !currentTabUrl) {
            // No active project or no current URL - show reload by default
            reloadBtn.style.display = 'flex';
            loadBtn.style.display = 'none';
            return;
        }
        
        const project = projects.find(p => p.id === activeProjectId);
        if (!project || !project.frontendDomain) {
            // No project or no frontend domain - show reload by default
            reloadBtn.style.display = 'flex';
            loadBtn.style.display = 'none';
            return;
        }
        
        try {
            const tabUrlObj = new URL(currentTabUrl);
            const tabDomain = tabUrlObj.host; // Includes port if present (e.g., "localhost:8100")
            let projectFrontendDomain = project.frontendDomain || project.domain;
            
            // Normalize project domain - remove protocol if present, extract just host
            if (projectFrontendDomain) {
                try {
                    // If it looks like a URL, parse it to get just the host
                    if (projectFrontendDomain.includes('://') || projectFrontendDomain.startsWith('http')) {
                        const projectUrlObj = new URL(projectFrontendDomain.startsWith('http') ? projectFrontendDomain : 'http://' + projectFrontendDomain);
                        projectFrontendDomain = projectUrlObj.host;
                    }
                } catch (e) {
                    // If parsing fails, use as-is (might already be just a domain)
                }
            }
            
            // Normalize domains for comparison (remove any trailing slashes, handle case)
            const normalizedTabDomain = tabDomain.toLowerCase().trim();
            const normalizedProjectDomain = (projectFrontendDomain || '').toLowerCase().trim();
            
            // Compare domains (match if tab domain equals project frontend domain)
            const matches = normalizedTabDomain === normalizedProjectDomain;
            
            if (matches) {
                // Domain matches - show reload button, hide load button
                reloadBtn.style.display = 'flex';
                loadBtn.style.display = 'none';
            } else {
                // Domain doesn't match - hide reload button, show load button
                reloadBtn.style.display = 'none';
                loadBtn.style.display = 'flex';
            }
        } catch (e) {
            // Invalid URL, show reload button
            reloadBtn.style.display = 'flex';
            loadBtn.style.display = 'none';
        }
    });
}

// Update active project display in header
function updateActiveProjectDisplay() {
    chrome.storage.local.get(['projects', 'activeProjectId'], (result) => {
        const projects = result.projects || [];
        const activeProjectId = result.activeProjectId;
        
        if (!activeProjectName) return;
        
        if (activeProjectId) {
            const project = projects.find(p => p.id === activeProjectId);
            if (project) {
                activeProjectName.textContent = project.name;
                // Load error filter strings for the active project
                loadErrorFilterFromProject(project);
            } else {
                activeProjectName.textContent = 'No Project';
            }
        } else {
            activeProjectName.textContent = 'No Project';
            // Reset to default if no active project
            if (errorFilterInput) {
                errorFilterInput.value = 'ERROR';
            }
        }
    });
}

// Toggle projects dropdown
function toggleProjectsDropdown() {
    if (!projectsDropdown) return;
    
    const isHidden = projectsDropdown.classList.contains('hidden');
    
    if (isHidden) {
        // Show dropdown
        chrome.storage.local.get(['projects'], (result) => {
            const projects = result.projects || [];
            renderProjectsDropdown(projects);
            projectsDropdown.classList.remove('hidden');
        });
    } else {
        // Hide dropdown
        projectsDropdown.classList.add('hidden');
    }
}

// Render projects dropdown
function renderProjectsDropdown(projects) {
    if (!projectsDropdown) return;
    
    if (projects.length === 0) {
        projectsDropdown.innerHTML = `
            <div class="dropdown-item" style="padding: 10px 15px; color: #858585;">
                No projects yet
            </div>
            <div class="dropdown-separator"></div>
            <div class="dropdown-item dropdown-edit" style="padding: 10px 15px; cursor: pointer;">
                Edit Projects
            </div>
        `;
        
        // Add event listener for Edit Projects when no projects exist
        const editItem = projectsDropdown.querySelector('.dropdown-edit');
        if (editItem) {
            editItem.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent document click handler from firing
                projectsDropdown.classList.add('hidden');
                projectsModal.classList.remove('hidden');
                loadProjects();
            });
        }
    } else {
        const projectsHtml = projects.map(project => {
            const isActive = project.id === activeProjectId;
            return `
                <div class="dropdown-item ${isActive ? 'dropdown-item-active' : ''}" data-project-id="${project.id}" style="padding: 10px 15px; cursor: pointer;">
                    <div style="font-weight: ${isActive ? '600' : '400'}; color: ${isActive ? '#0e639c' : '#d4d4d4'};">
                        ${escapeHtml(project.name)}
                    </div>
                    <div style="font-size: 11px; color: #858585; margin-top: 2px;">
                        ${escapeHtml(project.frontendDomain || project.domain || '')}
                    </div>
                </div>
            `;
        }).join('');
        
        projectsDropdown.innerHTML = projectsHtml + `
            <div class="dropdown-separator"></div>
            <div class="dropdown-item dropdown-edit" style="padding: 10px 15px; cursor: pointer;">
                Edit Projects
            </div>
        `;
        
        // Add event listeners
        projectsDropdown.querySelectorAll('.dropdown-item[data-project-id]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent document click handler from firing
                const projectId = e.currentTarget.getAttribute('data-project-id');
                selectProject(projectId);
                projectsDropdown.classList.add('hidden');
            });
        });
        
        const editItem = projectsDropdown.querySelector('.dropdown-edit');
        if (editItem) {
            editItem.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent document click handler from firing
                projectsDropdown.classList.add('hidden');
                projectsModal.classList.remove('hidden');
                loadProjects();
            });
        }
    }
}

// Select/activate a project
function selectProject(projectId) {
    activeProjectId = projectId;
    chrome.storage.local.set({ activeProjectId: projectId }, () => {
        loadProjects(); // Refresh to show active state
        updateActiveProjectDisplay();
        updateReloadButton();
        // Also update dropdown if visible
        chrome.storage.local.get(['projects'], (result) => {
            const projects = result.projects || [];
            if (!projectsDropdown.classList.contains('hidden')) {
                renderProjectsDropdown(projects);
            }
        });
    });
}

// Update copy selected button state
function updateCopySelectedButton() {
    if (copySelectedBtn) {
        // Reset button state when new data comes in
        if (isCopyButtonGreen) {
            copySelectedBtn.classList.remove('copied');
            isCopyButtonGreen = false;
        }
        // Button is always enabled, label stays "COPY"
        copySelectedBtn.textContent = 'COPY';
        copySelectedBtn.disabled = false;
        
        // Update console stats
        updateConsoleStats();
    }
}

// Update copy stats display (network requests + console logs)
function updateConsoleStats() {
    if (!consoleStats) {
        return;
    }
    
    // Get selected network requests
    const selectedRequests = filteredRequests.filter(req => selectedRequestIds.has(req.id));
    
    // Calculate stats for selected network requests
    let networkLines = 0;
    let networkTokens = 0;
    
    if (selectedRequests.length > 0) {
        // Simulate the same format as copyNetworkRequestsToClipboard
        selectedRequests.forEach((req, index) => {
            // Header lines
            networkLines += 6; // Request X, URL, Method, Status, Timestamp, blank line
            
            // Payload
            const payloadText = formatData(req.payload, false);
            networkLines += payloadText.split('\n').length + 2; // "Payload:\n" + content + "\n\n"
            networkTokens += Math.ceil(payloadText.length / 4);
            
            // Response
            const responseText = formatData(req.response, false);
            networkLines += responseText.split('\n').length + 2; // "Response:\n" + content + "\n"
            networkTokens += Math.ceil(responseText.length / 4);
            
            // URL, Method, Status, Timestamp
            networkTokens += Math.ceil((req.url + req.method + (req.statusText || '') + formatTimestamp(req.timestamp)).length / 4);
            
            // Separator lines between requests
            if (index > 0) {
                networkLines += 3; // "\n" + separator + "\n\n"
            }
        });
        
        // Add header line
        networkLines += 2; // "Network Requests:\n" + separator
    }
    
    // Get console logs if checkbox is checked
    const includeConsole = copyConsoleCheckbox && copyConsoleCheckbox.checked;
    let consoleLines = 0;
    let consoleTokens = 0;
    let filteredConsoleLines = 0;
    let filteredConsoleTokens = 0;
    
    if (includeConsole) {
        // Get console filter state from storage
        chrome.storage.local.get(['consoleViewerFilter'], (filterResult) => {
            chrome.runtime.sendMessage({ type: 'GET_CONSOLE_LOGS' }, (response) => {
                const filterState = filterResult.consoleViewerFilter;
                const hasFilter = filterState && filterState.hasFilter;
                
                if (!chrome.runtime.lastError && response && response.logs) {
                    const consoleLogs = response.logs || [];
                    
                    // Calculate stats for all logs
                    consoleLogs.forEach(log => {
                        const message = formatConsoleLogMessage(log);
                        const lines = message.split('\n').length;
                        consoleLines += lines;
                        
                        // Estimate tokens (rough approximation: ~4 characters per token)
                        const text = message + (log.stack || '');
                        consoleTokens += Math.ceil(text.length / 4);
                    });
                    
                    // Calculate stats for filtered logs if filter is active
                    if (hasFilter && filterState) {
                        let filteredLogs = consoleLogs;
                        
                        // Apply type filter
                        if (filterState.currentFilter !== 'all') {
                            filteredLogs = filteredLogs.filter(log => log.level === filterState.currentFilter);
                        }
                        
                        // Apply search filter
                        if (filterState.searchValue) {
                            filteredLogs = filteredLogs.filter(log => {
                                const message = log.message ? log.message.toLowerCase() : '';
                                const argsStr = JSON.stringify(log.args || []).toLowerCase();
                                return message.includes(filterState.searchValue) || argsStr.includes(filterState.searchValue);
                            });
                        }
                        
                        filteredLogs.forEach(log => {
                            const message = formatConsoleLogMessage(log);
                            const lines = message.split('\n').length;
                            filteredConsoleLines += lines;
                            
                            // Estimate tokens (rough approximation: ~4 characters per token)
                            const text = message + (log.stack || '');
                            filteredConsoleTokens += Math.ceil(text.length / 4);
                        });
                    }
                    
                    // Add console header
                    if (consoleLogs.length > 0) {
                        consoleLines += 2; // "Console Logs:\n" + separator
                        if (hasFilter && filteredConsoleLines > 0) {
                            filteredConsoleLines += 2; // "Console Logs:\n" + separator
                        }
                    }
                }
                
                // Update display with combined stats (including filtered info)
                // Filtered counts include selected network requests + filtered console logs
                updateStatsDisplay(networkLines + consoleLines, networkTokens + consoleTokens, 
                    hasFilter && filteredConsoleLines > 0 ? networkLines + filteredConsoleLines : null, 
                    hasFilter && filteredConsoleTokens > 0 ? networkTokens + filteredConsoleTokens : null);
            });
        });
    } else {
        // Update display with just network stats
        updateStatsDisplay(networkLines, networkTokens);
    }
}

// Update stats display
function updateStatsDisplay(totalLines, totalTokens, filteredConsoleLines = null, filteredConsoleTokens = null) {
    if (!consoleStats) {
        return;
    }
    
    // Format display
    const tokenSizeKB = (totalTokens / 1000).toFixed(1);
    let mainText = '';
    let filterText = '';
    
    if (totalLines === 0 && totalTokens === 0) {
        mainText = 'Console empty';
    } else {
        mainText = `${totalLines} lines, ${tokenSizeKB}K tokens`;
        
        // Add filtered console counts if available (on second line)
        if (filteredConsoleLines !== null && filteredConsoleTokens !== null) {
            const filteredTokenSizeKB = (filteredConsoleTokens / 1000).toFixed(1);
            filterText = `(${filteredConsoleLines} lines, ${filteredTokenSizeKB}K tokens)`;
            consoleStats.innerHTML = `<i class="fa-solid fa-window-maximize"></i> <div class="console-stats-content"><span class="console-stats-main">${mainText}</span><span class="console-stats-filter">${filterText}</span></div>`;
            return;
        } else {
            // Check if console viewer has filters active (async check)
            chrome.storage.local.get(['consoleViewerFilter'], (result) => {
                const filterState = result.consoleViewerFilter;
                // Only show "No Filters Applied" if console is included and no filter is active (on second line)
                const includeConsole = copyConsoleCheckbox && copyConsoleCheckbox.checked;
                if (includeConsole && (!filterState || !filterState.hasFilter)) {
                    filterText = '(No Filters Applied)';
                }
                if (filterText) {
                    consoleStats.innerHTML = `<i class="fa-solid fa-window-maximize"></i> <div class="console-stats-content"><span class="console-stats-main">${mainText}</span><span class="console-stats-filter">${filterText}</span></div>`;
                } else {
                    consoleStats.innerHTML = `<i class="fa-solid fa-window-maximize"></i> <div class="console-stats-content"><span class="console-stats-main">${mainText}</span></div>`;
                }
            });
            return;
        }
    }
    
    // Always show icon, even for empty state
    consoleStats.innerHTML = `<i class="fa-solid fa-window-maximize"></i> <div class="console-stats-content"><span class="console-stats-main">${mainText}</span></div>`;
}

// Copy selected requests to clipboard
function copySelected() {
    // Get selected requests (preserve order from filteredRequests)
    const selectedRequests = filteredRequests.filter(req => selectedRequestIds.has(req.id));
    
    // Check if console logs should be included
    const includeConsole = copyConsoleCheckbox && copyConsoleCheckbox.checked;
    
    // If no network requests selected but console is checked, just copy console
    if (selectedRequests.length === 0 && includeConsole) {
        chrome.runtime.sendMessage({ type: 'GET_CONSOLE_LOGS' }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('Error getting console logs:', chrome.runtime.lastError);
                return;
            }
            
            const consoleLogs = response && response.logs ? response.logs : [];
            // Copy console logs even if empty (will show header)
            copyConsoleOnlyToClipboard(consoleLogs);
        });
        return;
    }
    
    // If no network requests and console not checked, do nothing
    if (selectedRequests.length === 0) {
        return;
    }
    
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

// Copy detail view request to clipboard (single request, excludes console logs)
function copyDetailRequest(e) {
    // Prevent event propagation
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    if (!currentDetailRequest) {
        console.warn('No current detail request to copy');
        return;
    }
    
    const req = currentDetailRequest;
    const showHeaders = showHeadersDetailCheckbox ? showHeadersDetailCheckbox.checked : false;
    
    let text = '';
    
    text += 'Network Request:\n';
    text += '='.repeat(80) + '\n\n';
    
    text += `URL: ${req.url}\n`;
    text += `Method: ${req.method}\n`;
    text += `Status: ${req.status || 'Pending'} ${req.statusText || ''}\n`;
    text += `Timestamp: ${formatTimestamp(req.timestamp)}\n`;
    text += '\n';
    
    // Request Headers (if shown)
    if (showHeaders && req.requestHeaders) {
        text += 'Request Headers:\n';
        text += formatData(req.requestHeaders, false);
        text += '\n\n';
    }
    
    // Request Payload
    text += 'Payload:\n';
    text += formatData(req.payload, false);
    text += '\n\n';
    
    // Response Headers (if shown)
    if (showHeaders && req.responseHeaders) {
        text += 'Response Headers:\n';
        text += formatData(req.responseHeaders, false);
        text += '\n\n';
    }
    
    // Response
    text += 'Response:\n';
    text += formatData(req.response, false);
    text += '\n';
    
    console.log('Copying detail request, text length:', text.length);
    
    // Copy to clipboard with visual feedback
    navigator.clipboard.writeText(text).then(() => {
        console.log('Successfully copied to clipboard');
        // Show green feedback on copy button
        if (copyDetailBtn) {
            copyDetailBtn.classList.add('copied');
            setTimeout(() => {
                copyDetailBtn.classList.remove('copied');
            }, 1000);
        }
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy to clipboard. Please try again.');
    });
}

// Copy console logs only to clipboard
function copyConsoleOnlyToClipboard(consoleLogs) {
    let text = '';
    
    text += 'Console Logs:\n';
    text += '='.repeat(80) + '\n\n';
    
    if (consoleLogs.length === 0) {
        text += 'No console logs captured.\n';
    } else {
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
    }
    
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
        // Show green feedback
        if (copySelectedBtn) {
            copySelectedBtn.classList.add('copied');
            isCopyButtonGreen = true;
        }
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
    if (status === null || status === undefined) {
        return 'pending';
    }
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
    chrome.storage.local.get(['projects', 'activeProjectId'], (result) => {
        const projects = result.projects || [];
        activeProjectId = result.activeProjectId || null;
        renderProjectsList(projects);
    });
}

// Select/activate a project
function selectProject(projectId) {
    activeProjectId = projectId;
    chrome.storage.local.set({ activeProjectId: projectId }, () => {
        loadProjects(); // Refresh to show active state
        loadErrorFilterFromActiveProject(); // Load error filter strings for the selected project
    });
}

// Render projects list
function renderProjectsList(projects) {
    if (!projectsList) return;
    
    if (projects.length === 0) {
        projectsList.innerHTML = '<div class="empty-state"><p>No projects yet. Click "Add Project" to create one.</p></div>';
        return;
    }
    
    projectsList.innerHTML = projects.map(project => {
        const isActive = project.id === activeProjectId;
        return `
        <div class="project-item ${isActive ? 'active-project' : ''}" data-project-id="${project.id}">
            <div class="project-info">
                <div class="project-name">${escapeHtml(project.name)} ${isActive ? '<span style="color: #0e639c;">(Active)</span>' : ''}</div>
                <div class="project-folder">${escapeHtml(project.folder)}</div>
                ${project.logFilePath ? `<div class="project-log-file" style="font-size: 11px; color: #858585;">Log: ${escapeHtml(project.logFilePath)}</div>` : ''}
            </div>
            <div class="project-actions">
                <button class="btn-select-project" data-project-id="${project.id}" ${isActive ? 'disabled' : ''}>${isActive ? 'Active' : 'Select'}</button>
                <button class="btn-edit-project" data-project-id="${project.id}">Edit</button>
                <button class="btn-delete-project" data-project-id="${project.id}">Delete</button>
            </div>
        </div>
    `;
    }).join('');
    
    // Add event listeners for select/edit/delete buttons
    projectsList.querySelectorAll('.btn-select-project').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const projectId = e.target.getAttribute('data-project-id');
            selectProject(projectId);
        });
    });
    
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
    const frontendDomain = document.getElementById('projectFrontendDomain').value.trim();
    const backendDomain = document.getElementById('projectBackendDomain').value.trim();
    
    if (!name || !folder || !frontendDomain || !backendDomain) {
        alert('Please fill in all required fields');
        return;
    }
    
    chrome.storage.local.get(['projects'], (result) => {
        const projects = result.projects || [];
        
        const logFile = document.getElementById('projectLogFile').value.trim() || 'debug.log';
        
        if (editingProjectId) {
            // Update existing project
            const index = projects.findIndex(p => p.id === editingProjectId);
            if (index !== -1) {
                projects[index] = {
                    ...projects[index],
                    name: name,
                    folder: folder,
                    frontendDomain: frontendDomain,
                    backendDomain: backendDomain,
                    logFilePath: logFile
                };
            }
        } else {
            // Create new project
            const newProject = {
                id: 'project_' + Date.now(),
                name: name,
                folder: folder,
                frontendDomain: frontendDomain,
                backendDomain: backendDomain,
                logFilePath: logFile,
                errorFilterStrings: 'ERROR', // Default error filter
                createdAt: Date.now()
            };
            projects.push(newProject);
        }
        
        chrome.storage.local.set({ projects: projects }, () => {
            loadProjects();
            closeProjectForm();
            updateActiveProjectDisplay();
            updateReloadButton();
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
            document.getElementById('projectFrontendDomain').value = project.frontendDomain || project.domain || '';
            document.getElementById('projectBackendDomain').value = project.backendDomain || '';
            document.getElementById('projectLogFile').value = project.logFilePath || 'debug.log';
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
    
    chrome.storage.local.get(['projects', 'activeProjectId'], (result) => {
        const projects = result.projects || [];
        const filtered = projects.filter(p => p.id !== projectId);
        
        // If deleted project was active, clear active project
        let newActiveProjectId = result.activeProjectId;
        if (projectId === result.activeProjectId) {
            newActiveProjectId = null;
        }
        
        chrome.storage.local.set({ 
            projects: filtered,
            activeProjectId: newActiveProjectId
        }, () => {
            activeProjectId = newActiveProjectId;
    loadProjects();
    updateActiveProjectDisplay(); // This will also load error filter strings
            updateReloadButton();
        });
    });
}

// Load error filter strings from active project
function loadErrorFilterFromActiveProject() {
    if (!activeProjectId || !errorFilterInput) return;
    
    chrome.storage.local.get(['projects'], (result) => {
        const projects = result.projects || [];
        const project = projects.find(p => p.id === activeProjectId);
        if (project) {
            loadErrorFilterFromProject(project);
        }
    });
}

// Load error filter strings from a project object
function loadErrorFilterFromProject(project) {
    if (!errorFilterInput) return;
    
    // Use project's error filter strings, or default to "ERROR"
    const errorFilter = project.errorFilterStrings || 'ERROR';
    errorFilterInput.value = errorFilter;
}

// Save error filter strings to active project
function saveErrorFilterToActiveProject() {
    if (!activeProjectId || !errorFilterInput) return;
    
    const errorFilterValue = errorFilterInput.value.trim() || 'ERROR';
    
    chrome.storage.local.get(['projects'], (result) => {
        const projects = result.projects || [];
        const projectIndex = projects.findIndex(p => p.id === activeProjectId);
        
        if (projectIndex !== -1) {
            projects[projectIndex] = {
                ...projects[projectIndex],
                errorFilterStrings: errorFilterValue
            };
            
            chrome.storage.local.set({ projects: projects }, () => {
                // Saved successfully
            });
        }
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
                currentTabUrl = response.tabInfo.url || null;
                updateTabInfoDisplay(response.tabInfo);
            } else {
                currentTabUrl = null;
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

// Take screenshot of visible tab content and copy to clipboard
function takeScreenshot() {
    // Get the monitored tab ID from background script
    chrome.runtime.sendMessage({ type: 'GET_MONITORED_TAB_ID' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('Error getting monitored tab:', chrome.runtime.lastError);
            // Fallback to current window
            captureCurrentWindow();
            return;
        }
        
        const monitoredTabId = response && response.tabId;
        
        if (monitoredTabId) {
            // Get the window ID for the monitored tab
            chrome.tabs.get(monitoredTabId, (tab) => {
                if (chrome.runtime.lastError || !tab) {
                    console.error('Error getting tab:', chrome.runtime.lastError);
                    captureCurrentWindow();
                    return;
                }
                
                const windowId = tab.windowId;
                captureTabScreenshot(windowId);
            });
        } else {
            // No monitored tab, capture current window
            captureCurrentWindow();
        }
    });
}

// Capture screenshot from current window
function captureCurrentWindow() {
    chrome.windows.getCurrent((window) => {
        if (chrome.runtime.lastError || !window) {
            console.error('Error getting current window:', chrome.runtime.lastError);
            alert('Failed to get current window. Please try again.');
            return;
        }
        
        captureTabScreenshot(window.id);
    });
}

// Capture screenshot and copy to clipboard
function captureTabScreenshot(windowId) {
    // Capture visible tab in the specified window
    chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
            console.error('Error capturing screenshot:', chrome.runtime.lastError);
            alert('Failed to capture screenshot. Please try again.');
            return;
        }
        
        if (!dataUrl) {
            console.error('No screenshot data received');
            alert('Failed to capture screenshot. Please try again.');
            return;
        }
        
        // Store screenshot data URL for markup tool (synchronous)
        console.log('[Screenshot] Storing screenshot data URL for markup tool');
        lastScreenshotDataUrl = dataUrl;
        lastMarkupData = null; // Clear previous markup
        updateMarkupButtonState();
        
        // Convert data URL to Blob
        fetch(dataUrl)
            .then(res => res.blob())
            .then(blob => {
                // Copy blob to clipboard
                const item = new ClipboardItem({ 'image/png': blob });
                navigator.clipboard.write([item]).then(() => {
                    // Show visual feedback
                    if (screenshotBtn) {
                        const originalHTML = screenshotBtn.innerHTML;
                        screenshotBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
                        screenshotBtn.classList.add('screenshot-success');
                        setTimeout(() => {
                            screenshotBtn.innerHTML = originalHTML;
                            screenshotBtn.classList.remove('screenshot-success');
                        }, 1500);
                    }
                }).catch(err => {
                    console.error('Failed to copy screenshot to clipboard:', err);
                    alert('Failed to copy screenshot to clipboard. Please try again.');
                });
            })
            .catch(err => {
                console.error('Error converting screenshot:', err);
                alert('Failed to process screenshot. Please try again.');
            });
    });
}

// Start crop selection mode
function startCropSelection() {
    // Get the monitored tab ID
    chrome.runtime.sendMessage({ type: 'GET_MONITORED_TAB_ID' }, (response) => {
        if (chrome.runtime.lastError) {
            console.error('Error getting monitored tab:', chrome.runtime.lastError);
            alert('Failed to get active tab. Please try again.');
            return;
        }
        
        const monitoredTabId = response && response.tabId;
        
        if (!monitoredTabId) {
            alert('No active tab to capture. Please navigate to a page first.');
            return;
        }
        
        // Update button state
        if (cropBtn) {
            cropBtn.classList.add('crop-active');
        }
        
        // Inject selection overlay script
        chrome.scripting.executeScript({
            target: { tabId: monitoredTabId },
            files: ['content/screenshot-selector.js'],
            world: 'MAIN'
        }).then(() => {
            // Send message to start selection
            chrome.tabs.sendMessage(monitoredTabId, { type: 'START_SCREENSHOT_SELECTION' }).catch(() => {
                // If sendMessage fails, use postMessage via executeScript
                chrome.scripting.executeScript({
                    target: { tabId: monitoredTabId },
                    func: () => {
                        window.postMessage({ type: 'START_SCREENSHOT_SELECTION' }, '*');
                    },
                    world: 'MAIN'
                });
            });
            
            // Listen for selection completion
            setupSelectionListener(monitoredTabId);
        }).catch(err => {
            console.error('Error injecting selection script:', err);
            alert('Failed to start crop selection. Please try again.');
            if (cropBtn) {
                cropBtn.classList.remove('crop-active');
            }
        });
    });
}

// Setup listener for selection completion
let selectionMessageListener = null;

function setupSelectionListener(tabId) {
    // Remove existing listener if any
    if (selectionMessageListener) {
        chrome.runtime.onMessage.removeListener(selectionMessageListener);
    }
    
    // Listen for messages from content script
    selectionMessageListener = (message, sender, sendResponse) => {
        console.log('[Crop] Received message:', message.type, 'from sender:', sender, 'expected tab:', tabId);
        
        // Check if this is a screenshot selection message
        if (message.type === 'SCREENSHOT_SELECTION_COMPLETE') {
            // Accept message regardless of sender.tab - we'll use the tabId we stored
            const selection = message.selection;
            console.log('[Crop] Selection received:', selection);
            if (selection && selection.width > 0 && selection.height > 0) {
                console.log('[Crop] Processing selection for tab:', tabId);
                captureAndCropScreenshot(tabId, selection);
                chrome.runtime.onMessage.removeListener(selectionMessageListener);
                selectionMessageListener = null;
                if (cropBtn) {
                    cropBtn.classList.remove('crop-active');
                }
            } else {
                console.error('[Crop] Invalid selection:', selection);
            }
            return true;
        }
        
        if (message.type === 'SCREENSHOT_SELECTION_CANCELLED') {
            console.log('[Crop] Selection cancelled');
            chrome.runtime.onMessage.removeListener(selectionMessageListener);
            selectionMessageListener = null;
            if (cropBtn) {
                cropBtn.classList.remove('crop-active');
            }
            return true;
        }
    };
    
    chrome.runtime.onMessage.addListener(selectionMessageListener);
    console.log('[Crop] Listener set up for tab:', tabId);
}

// Capture screenshot and crop to selection
function captureAndCropScreenshot(tabId, selection) {
    console.log('[Crop] Starting screenshot capture for tab:', tabId, 'selection:', selection);
    
    // First, remove the overlay before capturing screenshot
    console.log('[Crop] Removing overlay before screenshot');
    chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
            // Remove overlay elements
            const overlay = document.getElementById('screenshot-selector-overlay');
            const instructions = document.getElementById('screenshot-instructions');
            if (overlay) {
                overlay.remove();
            }
            if (instructions) {
                instructions.remove();
            }
        },
        world: 'MAIN'
    }).then(() => {
        console.log('[Crop] Overlay removed, waiting a moment before capture');
        // Small delay to ensure overlay is removed from DOM
        setTimeout(() => {
            chrome.tabs.get(tabId, (tab) => {
                if (chrome.runtime.lastError || !tab) {
                    console.error('[Crop] Error getting tab:', chrome.runtime.lastError);
                    alert('Failed to get tab information.');
                    return;
                }
                
                const windowId = tab.windowId;
                console.log('[Crop] Capturing screenshot from window:', windowId);
                
                // Capture full screenshot (overlay should now be gone)
                chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
                    if (chrome.runtime.lastError) {
                        console.error('[Crop] Error capturing screenshot:', chrome.runtime.lastError);
                        alert('Failed to capture screenshot. Please try again.');
                        return;
                    }
                    
                    if (!dataUrl) {
                        console.error('[Crop] No screenshot data received');
                        alert('Failed to capture screenshot. Please try again.');
                        return;
                    }
                    
                    console.log('[Crop] Screenshot captured, cropping...');
                    
                    // Crop the image
                    cropImage(dataUrl, selection, () => {
                        console.log('[Crop] Crop complete, cropped screenshot stored:', lastScreenshotDataUrl ? 'yes' : 'no');
                    });
                });
            });
        }, 100); // 100ms delay to ensure overlay removal is rendered
    }).catch(err => {
        console.error('[Crop] Error removing overlay:', err);
        // Continue anyway - try to capture screenshot
        chrome.tabs.get(tabId, (tab) => {
            if (chrome.runtime.lastError || !tab) {
                console.error('[Crop] Error getting tab:', chrome.runtime.lastError);
                alert('Failed to get tab information.');
                return;
            }
            
            const windowId = tab.windowId;
            chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
                if (chrome.runtime.lastError || !dataUrl) {
                    console.error('[Crop] Error capturing screenshot:', chrome.runtime.lastError);
                    alert('Failed to capture screenshot. Please try again.');
                    return;
                }
                
                cropImage(dataUrl, selection, () => {});
            });
        });
    });
}

// Crop image to selection rectangle
function cropImage(dataUrl, selection, callback) {
    const img = new Image();
    img.onload = function() {
        const canvas = document.createElement('canvas');
        canvas.width = selection.width;
        canvas.height = selection.height;
        const ctx = canvas.getContext('2d');
        
        // The screenshot from captureVisibleTab is already at device pixel ratio
        // Selection coordinates are in CSS pixels, but screenshot is at DPR scale
        // We need to get the actual DPR of the tab to scale correctly
        // For now, assume 1:1 mapping (works for most cases)
        // If needed, we can get DPR from the tab's window
        
        // Draw cropped portion (selection coordinates are in CSS pixels)
        ctx.drawImage(
            img,
            selection.x, selection.y, selection.width, selection.height,
            0, 0, selection.width, selection.height
        );
        
        // Convert to data URL first (synchronous) for markup tool storage
        const croppedDataUrl = canvas.toDataURL('image/png');
        
        // Store cropped screenshot data URL for markup tool (synchronous)
        console.log('[Crop] Storing cropped screenshot data URL for markup tool');
        lastScreenshotDataUrl = croppedDataUrl;
        lastMarkupData = null; // Clear previous markup
        updateMarkupButtonState();
        
        // Convert to blob and copy to clipboard
        // Use content script method since side panel may not have focus
        canvas.toBlob((blob) => {
            if (!blob) {
                alert('Failed to process cropped image.');
                if (callback) callback();
                return;
            }
            
            // Copy via content script (runs in page context which should have focus)
            copyImageViaContentScript(blob, callback);
        }, 'image/png');
    };
    
    img.onerror = function() {
        console.error('[Crop] Error loading image for cropping');
        alert('Failed to process screenshot for cropping.');
        if (callback) callback();
    };
    
    img.src = dataUrl;
}

// Copy image via content script (runs in page context which should have focus)
function copyImageViaContentScript(blob, callback) {
    // Get the monitored tab ID
    chrome.runtime.sendMessage({ type: 'GET_MONITORED_TAB_ID' }, (response) => {
        if (chrome.runtime.lastError || !response || !response.tabId) {
            console.error('[Crop] Could not get monitored tab ID');
            alert('Failed to copy cropped screenshot. Please ensure the page is focused and try again.');
            if (callback) callback();
            return;
        }
        
        const tabId = response.tabId;
        
        // Convert blob to data URL
        const reader = new FileReader();
        reader.onloadend = function() {
            const dataUrl = reader.result;
            
            console.log('[Crop] Injecting copy script into tab:', tabId);
            
            // Inject script to copy image in page context (MAIN world)
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                func: (imageDataUrl) => {
                    console.log('[Crop] Copy script executing in page context');
                    // Create image from data URL
                    const img = new Image();
                    img.onload = function() {
                        console.log('[Crop] Image loaded, creating canvas');
                        // Create canvas
                        const canvas = document.createElement('canvas');
                        canvas.width = img.width;
                        canvas.height = img.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0);
                        
                        console.log('[Crop] Converting canvas to blob');
                        // Copy to clipboard
                        canvas.toBlob((blob) => {
                            if (blob) {
                                console.log('[Crop] Blob created, copying to clipboard');
                                const item = new ClipboardItem({ 'image/png': blob });
                                navigator.clipboard.write([item]).then(() => {
                                    console.log('[Crop] Image successfully copied via content script');
                                    // Send success message back
                                    window.postMessage({ type: 'CROP_COPY_SUCCESS' }, '*');
                                }).catch(err => {
                                    console.error('[Crop] Failed to copy via content script:', err);
                                    window.postMessage({ type: 'CROP_COPY_ERROR', error: err.message }, '*');
                                });
                            } else {
                                console.error('[Crop] Failed to create blob from canvas');
                                window.postMessage({ type: 'CROP_COPY_ERROR', error: 'Failed to create blob' }, '*');
                            }
                        }, 'image/png');
                    };
                    img.onerror = function(err) {
                        console.error('[Crop] Failed to load image:', err);
                        window.postMessage({ type: 'CROP_COPY_ERROR', error: 'Failed to load image' }, '*');
                    };
                    img.src = imageDataUrl;
                },
                args: [dataUrl],
                world: 'MAIN'
            }).then(() => {
                console.log('[Crop] Copy script injected successfully');
                // Listen for success/error message
                const messageListener = (message, sender, sendResponse) => {
                    if (message.type === 'CROP_COPY_SUCCESS') {
                        console.log('[Crop] Copy successful message received');
                        chrome.runtime.onMessage.removeListener(messageListener);
                        // Show visual feedback
                        if (cropBtn) {
                            const originalHTML = cropBtn.innerHTML;
                            cropBtn.innerHTML = '<i class="fa-solid fa-check"></i>';
                            cropBtn.classList.add('crop-success');
                            setTimeout(() => {
                                cropBtn.innerHTML = originalHTML;
                                cropBtn.classList.remove('crop-success');
                                cropBtn.classList.remove('crop-active');
                            }, 1500);
                        }
                        if (callback) callback();
                        return true;
                    } else if (message.type === 'CROP_COPY_ERROR') {
                        console.error('[Crop] Copy error message received:', message.error);
                        chrome.runtime.onMessage.removeListener(messageListener);
                        alert('Failed to copy cropped screenshot: ' + (message.error || 'Unknown error'));
                        if (callback) callback();
                        return true;
                    }
                };
                
                // Also listen via content script postMessage
                chrome.runtime.onMessage.addListener(messageListener);
                
                // Set timeout in case message never arrives
                setTimeout(() => {
                    chrome.runtime.onMessage.removeListener(messageListener);
                }, 5000);
            }).catch(err => {
                console.error('[Crop] Failed to execute copy script:', err);
                alert('Failed to copy cropped screenshot. Please ensure the page is focused and try again.');
                if (callback) callback();
            });
        };
        reader.readAsDataURL(blob);
    });
}

// Animate loading dots for pending requests
function animateLoadingDots() {
    const loadingDots = document.querySelectorAll('.loading-dots');
    loadingDots.forEach(dot => {
        const currentText = dot.textContent || '';
        if (currentText === '') {
            dot.textContent = '.';
        } else if (currentText === '.') {
            dot.textContent = '..';
        } else if (currentText === '..') {
            dot.textContent = '...';
        } else {
            dot.textContent = '.';
        }
    });
}

// ==================== MARKUP TOOL FUNCTIONS ====================

// Update markup button state based on screenshot availability
function updateMarkupButtonState() {
    if (!markupBtn) return;
    
    if (lastScreenshotDataUrl) {
        // Enable button
        markupBtn.disabled = false;
        markupBtn.classList.remove('outlined');
    } else {
        // Disable button
        markupBtn.disabled = true;
        markupBtn.classList.add('outlined');
    }
}

// Open markup viewer window
function openMarkupViewer() {
    if (!lastScreenshotDataUrl) {
        alert('No screenshot available. Please take a screenshot first.');
        return;
    }
    
    // Generate unique ID for this markup session
    const markupId = `markup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Store screenshot and markup data in chrome.storage.local
    chrome.storage.local.set({
        [`markup_${markupId}_screenshot`]: lastScreenshotDataUrl,
        [`markup_${markupId}_data`]: lastMarkupData || null
    }, () => {
        // Send message to background script to open window
        chrome.runtime.sendMessage({
            type: 'OPEN_MARKUP_VIEWER',
            markupId: markupId
        }, (response) => {
            if (chrome.runtime.lastError) {
                console.error('[Markup] Error opening viewer:', chrome.runtime.lastError);
                alert('Failed to open markup viewer. Please try again.');
            }
        });
    });
}

