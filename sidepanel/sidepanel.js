/**
 * Popup Script - Handles UI interactions and data display
 */

let allRequests = [];
let filteredRequests = [];
let currentDetailRequest = null;
let currentFilter = 'all';
let errorsFilterActive = false; // Independent error filter toggle
let combineEnabled = true; // Combine duplicate requests (default ON)
let isContextInvalidated = false;
let selectedRequestIds = new Set(); // Track selected request IDs
let currentTabId = null; // Track current tab ID

// DOM Elements
const requestList = document.getElementById('requestList');
const networkResultsHeader = document.getElementById('networkResultsHeader');
const networkResultsCount = document.getElementById('networkResultsCount');
const combineBtn = document.getElementById('combineBtn');
const copyUrlsBtn = document.getElementById('copyUrlsBtn');
const listView = document.getElementById('listView');
const detailView = document.getElementById('detailView');
const requestCount = document.getElementById('requestCount');
const searchInput = document.getElementById('searchInput');
const errorFilterInput = document.getElementById('errorFilterInput');
const searchHistoryDropdown = document.getElementById('searchHistoryDropdown');
const clearNetworkSearchBtn = document.getElementById('clearNetworkSearchBtn');
const clearErrorFilterBtn = document.getElementById('clearErrorFilterBtn');
const networkSearchSuggestions = document.getElementById('networkSearchSuggestions');
const errorFilterSuggestions = document.getElementById('errorFilterSuggestions');
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
const autoClearCheckbox = document.getElementById('autoClearCheckbox');
const consoleStats = document.getElementById('consoleStats');
const tabInfoSection = document.getElementById('tabInfoSection');
const tabFavicon = document.getElementById('tabFavicon');
const tabTitle = document.getElementById('tabTitle');
const tabUrl = document.getElementById('tabUrl');
const activeProjectName = document.getElementById('activeProjectName');
const projectsDropdown = document.getElementById('projectsDropdown');
const projectsButtonWrapper = document.querySelector('.projects-button-wrapper');
const projectFileStatus = document.getElementById('projectFileStatus');
const loadBtn = document.getElementById('loadBtn');
let editingProjectId = null;
let activeProjectId = null; // Currently active project
let currentTabUrl = null; // Current tab URL for matching
let isCopyButtonGreen = false; // Track if copy button is in green (copied) state

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadRecordingState();
    loadRequests();
    setupEventListeners();
    loadProjects(); // This will set activeProjectId and load filter states
    loadActiveTabInfo();
    updateCopySelectedButton();
    updateConsoleStats();
    updateMarkupButtonState();
    updateActiveProjectDisplay(); // This will also check file status
    updateReloadButton();
    
    // Load auto-clear checkbox state
    chrome.storage.local.get(['autoClearEnabled'], (result) => {
        if (autoClearCheckbox) {
            autoClearCheckbox.checked = result.autoClearEnabled === true;
        }
    });
    
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
    searchInput.addEventListener('input', (e) => {
        filterRequests();
        showNetworkSearchSuggestions();
        // Note: Don't save on input change - save on blur instead
    });
    if (errorFilterInput) {
        errorFilterInput.addEventListener('input', (e) => {
            filterRequests();
            showErrorFilterSuggestions();
            // Note: Don't save on input change - save on blur instead
        });
        errorFilterInput.addEventListener('focus', showErrorFilterSuggestions);
        errorFilterInput.addEventListener('blur', () => {
            setTimeout(hideErrorFilterSuggestions, 200);
            // Save filter value and add to suggestions on blur
            saveErrorFilterToActiveProject();
            saveErrorFilterToSuggestions();
        });
    }

    // Clear network search button
    if (clearNetworkSearchBtn) {
        clearNetworkSearchBtn.addEventListener('click', () => {
            searchInput.value = '';
            filterRequests();
            saveNetworkFilterToActiveProject();
            hideNetworkSearchSuggestions();
            searchInput.focus();
        });
    }

    // Clear error filter button
    if (clearErrorFilterBtn) {
        clearErrorFilterBtn.addEventListener('click', () => {
            errorFilterInput.value = '';
            filterRequests();
            saveErrorFilterToActiveProject();
            hideErrorFilterSuggestions();
            errorFilterInput.focus();
        });
    }

    // Network search suggestions
    if (searchInput) {
        searchInput.addEventListener('focus', showNetworkSearchSuggestions);
        searchInput.addEventListener('blur', () => {
            setTimeout(hideNetworkSearchSuggestions, 200);
            // Save filter value and add to suggestions on blur
            saveNetworkFilterToActiveProject();
            saveNetworkFilterToSuggestions();
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
    
    // Copy URLs button
    if (copyUrlsBtn) {
        copyUrlsBtn.addEventListener('click', copyUrlsList);
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
    
    // Auto Clear checkbox change event
    if (autoClearCheckbox) {
        autoClearCheckbox.addEventListener('change', () => {
            chrome.storage.local.set({ autoClearEnabled: autoClearCheckbox.checked });
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
            document.getElementById('projectCombinedDebugFile').value = '';
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
            // Save errors filter state to active project
            saveErrorsFilterStateToActiveProject();
            applyFilters();
        });
    }
    
    // Combine button toggle
    if (combineBtn) {
        combineBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            combineEnabled = !combineEnabled;
            combineBtn.classList.toggle('active', combineEnabled);
            // Save combine state to active project
            saveCombineStateToActiveProject();
            // Refresh the list to show grouped/ungrouped requests
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
    
    // Save filter state to active project
    saveFilterStateToActiveProject();
    
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
}

// Load filter state from active project
function loadFilterStateFromActiveProject() {
    if (!activeProjectId) {
        // Fallback to global storage if no project is active
        chrome.storage.local.get(['currentFilter'], (result) => {
            if (result.currentFilter) {
                currentFilter = result.currentFilter;
                updateFilterButtons();
            }
        });
        return;
    }
    
    chrome.storage.local.get(['projects'], (result) => {
        const projects = result.projects || [];
        const project = projects.find(p => p.id === activeProjectId);
        if (project) {
            // Load current filter
            if (project.currentFilter) {
                currentFilter = project.currentFilter;
            }
            // Note: errorsFilterActive is NOT restored from project - always starts as false
            // This prevents confusion when loading the extension with no visible requests
            updateFilterButtons();
        }
    });
}

// Update filter button states
function updateFilterButtons() {
    // Update main filter buttons
    document.querySelectorAll('.filter-btn:not(#errorsFilterBtn)').forEach(btn => {
        if (btn.getAttribute('data-filter') === currentFilter) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // Update errors filter button
    const errorsFilterBtn = document.getElementById('errorsFilterBtn');
    if (errorsFilterBtn) {
        errorsFilterBtn.classList.toggle('active', errorsFilterActive);
    }
}

// Save filter state to active project
function saveFilterStateToActiveProject() {
    if (!activeProjectId) return;
    
    chrome.storage.local.get(['projects'], (result) => {
        const projects = result.projects || [];
        const projectIndex = projects.findIndex(p => p.id === activeProjectId);
        
        if (projectIndex !== -1) {
            projects[projectIndex] = {
                ...projects[projectIndex],
                currentFilter: currentFilter
            };
            
            chrome.storage.local.set({ projects: projects }, () => {
                // Saved successfully
            });
        }
    });
}

// Save errors filter state to active project
function saveErrorsFilterStateToActiveProject() {
    if (!activeProjectId) return;
    
    chrome.storage.local.get(['projects'], (result) => {
        const projects = result.projects || [];
        const projectIndex = projects.findIndex(p => p.id === activeProjectId);
        
        if (projectIndex !== -1) {
            projects[projectIndex] = {
                ...projects[projectIndex],
                errorsFilterActive: errorsFilterActive
            };
            
            chrome.storage.local.set({ projects: projects }, () => {
                // Saved successfully
            });
        }
    });
}

// Save combine state to active project
function saveCombineStateToActiveProject() {
    if (!activeProjectId) return;
    
    chrome.storage.local.get(['projects'], (result) => {
        const projects = result.projects || [];
        const projectIndex = projects.findIndex(p => p.id === activeProjectId);
        
        if (projectIndex !== -1) {
            projects[projectIndex] = {
                ...projects[projectIndex],
                combineEnabled: combineEnabled
            };
            
            chrome.storage.local.set({ projects: projects }, () => {
                // Saved successfully
            });
        }
    });
}

// Load combine state from active project
function loadCombineStateFromActiveProject() {
    if (!activeProjectId) {
        // Fallback to default (true)
        combineEnabled = true;
        if (combineBtn) {
            combineBtn.classList.add('active');
        }
        return;
    }
    
    chrome.storage.local.get(['projects'], (result) => {
        const projects = result.projects || [];
        const project = projects.find(p => p.id === activeProjectId);
        if (project) {
            if (project.combineEnabled !== undefined) {
                combineEnabled = project.combineEnabled;
            } else {
                combineEnabled = true; // Default to ON
            }
            if (combineBtn) {
                combineBtn.classList.toggle('active', combineEnabled);
            }
        } else {
            combineEnabled = true; // Default to ON
            if (combineBtn) {
                combineBtn.classList.add('active');
            }
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
        // Sync with background script
        chrome.runtime.sendMessage({ type: 'SET_RECORDING_STATE', isRecording: isRecording }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn('[Network Capture] Could not sync recording state:', chrome.runtime.lastError);
            }
        });
        // Also sync console recording state
        chrome.storage.local.set({ isConsoleRecording: isRecording }, () => {
            chrome.runtime.sendMessage({ type: 'SET_CONSOLE_RECORDING_STATE', isRecording: isRecording }, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn('[Network Capture] Could not sync console recording state:', chrome.runtime.lastError);
                }
            });
        });
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
                // Reload filters from active project after reload
                setTimeout(() => {
                    loadErrorFilterFromActiveProject();
                    loadNetworkFilterFromActiveProject();
                    loadFilterStateFromActiveProject();
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

// Clear all filters and show all requests
function clearAllFilters() {
    // Reset type filter to 'all'
    currentFilter = 'all';

    // Reset errors filter
    errorsFilterActive = false;

    // Clear search input
    if (searchInput) {
        searchInput.value = '';
    }

    // Update UI buttons
    updateFilterButtons();

    // Re-apply filters (now cleared)
    applyFilters();

    // Save cleared state to active project
    saveFilterStateToActiveProject();
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
    
    // Apply search filter - support comma-separated terms with negative filters
    const searchValue = searchInput.value.trim();
    if (searchValue) {
        // Save to search history when filtering
        saveSearchHistory(searchValue);
        
        // Split by comma and trim each term
        const searchTerms = searchValue.split(',').map(term => term.trim()).filter(term => term.length > 0);
        
        // Separate positive terms (no prefix) from negative terms (starting with -)
        const positiveTerms = searchTerms.filter(term => !term.startsWith('-')).map(t => t.toLowerCase());
        const negativeTerms = searchTerms.filter(term => term.startsWith('-')).map(t => t.substring(1).trim().toLowerCase()).filter(t => t.length > 0);
        
        // First: include if matches any positive term (OR logic)
        // If no positive terms, start with all requests (for negative-only filtering)
        if (positiveTerms.length > 0) {
            requests = requests.filter(req => {
                const urlLower = req.url.toLowerCase();
                const methodLower = req.method ? req.method.toLowerCase() : '';
                
                // Match if ANY positive term matches (OR logic)
                return positiveTerms.some(term => 
                    urlLower.includes(term) || 
                    methodLower.includes(term)
                );
            });
        }
        
        // Second: exclude if matches any negative term (applies to all requests or filtered positive matches)
        if (negativeTerms.length > 0) {
            requests = requests.filter(req => {
                const urlLower = req.url.toLowerCase();
                const methodLower = req.method ? req.method.toLowerCase() : '';
                
                // Exclude if matches ANY negative term
                return !negativeTerms.some(term => 
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
    updateNetworkResultsHeader();
}

// Group requests by URL, payload, and response (exact match)
function groupRequests(requests) {
    if (!combineEnabled) {
        // Return requests as-is with count 1
        return requests.map(req => ({
            requests: [req],
            count: 1,
            representative: req
        }));
    }
    
    // Create a map to group requests
    // Group by URL + payload + response (exact match required)
    const groups = new Map();
    
    requests.forEach(req => {
        const isPending = req.pending === true || req.status === null || req.status === undefined;
        const payloadStr = req.payload ? JSON.stringify(req.payload) : '';
        const responseStr = req.response ? JSON.stringify(req.response) : '';
        
        // Group by URL + payload + response (all must match)
        // For pending/cancelled requests without response, use empty string
        const key = `${req.url}|||${payloadStr}|||${responseStr}`;
        
        if (groups.has(key)) {
            // Add to existing group
            const group = groups.get(key);
            group.requests.push(req);
            group.count++;
            
            // Update representative to prefer completed requests over pending ones
            const currentRepPending = group.representative.pending === true || 
                                     group.representative.status === null || 
                                     group.representative.status === undefined;
            if (!isPending && currentRepPending) {
                group.representative = req;
            }
        } else {
            // Create new group
            groups.set(key, {
                requests: [req],
                count: 1,
                representative: req
            });
        }
    });
    
    // Return array of groups
    return Array.from(groups.values());
}

// Filter requests by search term
function filterRequests() {
    applyFilters();
}

// Render request list
function renderRequestList() {
    // Show reload button if context is invalidated
    if (isContextInvalidated) {
        if (networkResultsHeader) {
            networkResultsHeader.style.display = 'none';
        }
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
    
    // Update network results header visibility
    if (networkResultsHeader) {
        if (filteredRequests.length === 0) {
            networkResultsHeader.style.display = 'none';
        } else {
            networkResultsHeader.style.display = 'flex';
        }
    }
    
    if (filteredRequests.length === 0) {
        // Build filter message if filters are active
        const activeFilters = [];
        if (currentFilter !== 'all') {
            activeFilters.push(`Filter: ${currentFilter.toUpperCase()}`);
        }
        if (errorsFilterActive && errorFilterInput && errorFilterInput.value.trim()) {
            activeFilters.push(`Error filter: ${errorFilterInput.value.trim()}`);
        } else if (errorsFilterActive) {
            activeFilters.push('Error filter: active');
        }
        if (searchInput.value.trim()) {
            activeFilters.push(`Search: ${searchInput.value.trim()}`);
        }
        
        const hasActiveFilters = activeFilters.length > 0 || currentFilter !== 'all' || errorsFilterActive || searchInput.value.trim();
        const filterMessage = activeFilters.length > 0
            ? `<p class="hint">No requests match the active filters: ${activeFilters.join(', ')}</p>`
            : (allRequests.length > 0
                ? '<p class="hint">No requests match the current filters.</p>'
                : '');

        const clearFiltersBtn = hasActiveFilters
            ? `<button class="btn-clear-filters" id="clearFiltersBtn">Clear Filters</button>`
            : '';

        requestList.innerHTML = `
            <div class="empty-state">
                <p>No requests found.</p>
                ${filterMessage}
                ${clearFiltersBtn}
            </div>
        `;

        // Add event listener for clear filters button
        const clearBtn = document.getElementById('clearFiltersBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', clearAllFilters);
        }
        return;
    }
    
    // Group requests if combine is enabled
    const groupedRequests = groupRequests(filteredRequests);
    
    requestList.innerHTML = groupedRequests.map((group, index) => {
        const req = group.representative;
        const isPending = req.pending === true || req.status === null || req.status === undefined;
        const statusClass = isPending ? 'pending' : getStatusClass(req.status);
        const uriPath = getUriPath(req.url);
        const separator = index > 0 ? '<div class="request-separator"></div>' : '';
        
        // Remove pending requests from selection (can't copy incomplete requests)
        if (isPending && selectedRequestIds.has(req.id)) {
            selectedRequestIds.delete(req.id);
        }
        
        // Check if any request in the group is selected
        const groupRequestIds = group.requests.map(r => r.id);
        const isGroupSelected = groupRequestIds.some(id => selectedRequestIds.has(id));
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
        
        // Show status - if combine is off and request is cancelled, show "Cancelled"
        let statusDisplay;
        if (isPending) {
            if (!combineEnabled) {
                // When combine is off, show "Cancelled" for pending requests
                statusDisplay = '<span class="request-status-text cancelled">Cancelled</span>';
            } else {
                // When combine is on, show loading dots
                statusDisplay = '<span class="request-status-text pending"><span class="loading-dots">.</span></span>';
            }
        } else {
            statusDisplay = `<span class="request-status-text ${statusClass}">${req.status}</span>`;
        }
        
        // Add count badge if count > 1
        const countBadge = group.count > 1 
            ? `<span class="badge count-badge">${group.count}</span>` 
            : '';
        
        // Add error badge if response contains ERROR (positioned after count badge)
        const errorBadge = hasErrorInResponse 
            ? '<span class="badge error-badge">Error</span>' 
            : '';
        
        // Use first request ID for data attributes (for selection)
        const requestId = group.requests[0].id;
        
        return `${separator}
            <div class="request-item-text" data-request-id="${requestId}" data-group-count="${group.count}" title="${escapeHtml(req.url)}">
                <input type="checkbox" class="request-checkbox" data-request-id="${requestId}" data-group-count="${group.count}" ${isGroupSelected ? 'checked' : ''} ${disabledAttr}>
                <button class="btn-copy-request" data-request-id="${requestId}" title="Copy request details">
                    <i class="fa-regular fa-clone"></i>
                </button>
                <span class="request-url-text" data-request-id="${requestId}">${escapeHtml(uriPath)}</span>
                ${countBadge}
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
            const groupCount = parseInt(checkbox.getAttribute('data-group-count') || '1');
            
            if (checkbox.checked) {
                // If this is a grouped request, select all requests in the group
                if (groupCount > 1) {
                    const group = groupedRequests.find(g => g.requests[0].id === requestId);
                    if (group) {
                        group.requests.forEach(req => {
                            selectedRequestIds.add(req.id);
                        });
                    }
                } else {
                    selectedRequestIds.add(requestId);
                }
            } else {
                // If this is a grouped request, deselect all requests in the group
                if (groupCount > 1) {
                    const group = groupedRequests.find(g => g.requests[0].id === requestId);
                    if (group) {
                        group.requests.forEach(req => {
                            selectedRequestIds.delete(req.id);
                        });
                    }
                } else {
                    selectedRequestIds.delete(requestId);
                }
            }
            updateCopySelectedButton();
            updateConsoleStats(); // Update stats when selection changes
        });
    });
    
    // Add click listeners to request items (but not checkbox)
    requestList.querySelectorAll('.request-url-text').forEach(item => {
        item.addEventListener('click', () => {
            const requestId = item.getAttribute('data-request-id');
            // Find the request - could be in groupedRequests or filteredRequests
            let request = filteredRequests.find(r => r.id === requestId);
            if (!request) {
                // Try to find in grouped requests
                for (const group of groupedRequests) {
                    request = group.requests.find(r => r.id === requestId);
                    if (request) break;
                }
            }
            if (request) {
                showDetailView(request);
            }
        });
    });
    
    // Add click listeners to individual copy buttons
    requestList.querySelectorAll('.btn-copy-request').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const requestId = btn.getAttribute('data-request-id');
            // Find the request
            let request = filteredRequests.find(r => r.id === requestId);
            if (!request) {
                // Try to find in grouped requests
                for (const group of groupedRequests) {
                    request = group.requests.find(r => r.id === requestId);
                    if (request) break;
                }
            }
            if (request) {
                copySingleRequest(request, btn);
            }
        });
    });
}

// Copy single request to clipboard
function copySingleRequest(request, button) {
    let text = '';
    
    text += 'Network Request:\n';
    text += '='.repeat(80) + '\n\n';
    
    text += `URL: ${request.url}\n`;
    text += `Method: ${request.method || 'GET'}\n`;
    const isPending = request.pending === true || request.status === null || request.status === undefined;
    text += `Status: ${isPending ? 'Pending/Cancelled' : `${request.status} ${request.statusText || ''}`.trim()}\n`;
    text += `Timestamp: ${formatTimestamp(request.timestamp)}\n`;
    if (request.initiator) {
        text += `Initiator: ${request.initiator}\n`;
    }
    text += '\n';
    
    // Request Headers
    if (request.requestHeaders && Object.keys(request.requestHeaders).length > 0) {
        text += 'Request Headers:\n';
        text += formatData(request.requestHeaders, false);
        text += '\n\n';
    }
    
    // Request Payload
    text += 'Payload:\n';
    text += formatData(request.payload, false);
    text += '\n\n';
    
    // Response Headers
    if (request.responseHeaders && Object.keys(request.responseHeaders).length > 0) {
        text += 'Response Headers:\n';
        text += formatData(request.responseHeaders, false);
        text += '\n\n';
    }
    
    // Response
    text += 'Response:\n';
    text += formatData(request.response, false);
    text += '\n';
    
    // Copy to clipboard
    navigator.clipboard.writeText(text).then(() => {
        // Show green feedback
        button.classList.add('copied');
        setTimeout(() => {
            button.classList.remove('copied');
        }, 3000);
    }).catch(err => {
        console.error('Failed to copy:', err);
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
            // Don't reset search filter or error filter - they are project settings, not request data
            // The filters should persist and be loaded from the active project
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
        const scriptUrl = `${projectUrl}/debug_log_helper.php?action=clear&log=${encodeURIComponent(fullLogPath)}`;
        
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

// Write to combined debug file for active project
function writeToCombinedDebugFile(text) {
    if (!activeProjectId || !text) {
        return; // Silently skip if no active project or no text
    }
    
    chrome.storage.local.get(['projects', 'activeProjectId'], (result) => {
        const projects = result.projects || [];
        const activeProjectId = result.activeProjectId;
        const project = projects.find(p => p.id === activeProjectId);
        
        // Skip if no project or no combined debug file path configured
        if (!project || !project.combinedDebugFilePath || !project.combinedDebugFilePath.trim()) {
            return; // Silently skip if not configured
        }
        
        // Check URL match - compare domains with normalization (same as clearProjectLogFile)
        try {
            if (!currentTabUrl) {
                console.log('[Combined Debug File] No current tab URL, skipping write');
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
                console.log(`[Combined Debug File] URL mismatch (tab: ${tabDomain}, project: ${normalizedProjectDomain}), skipping write`);
                return;
            }
        } catch (e) {
            console.log(`[Combined Debug File] Invalid URL: ${e.message}, skipping write`);
            return;
        }
        
        // Construct full file path
        const fullFilePath = project.folder + '\\' + project.combinedDebugFilePath;
        
        // Construct request URL using backend domain
        const projectBackendDomain = project.backendDomain || project.domain;
        if (!projectBackendDomain) {
            console.log('[Combined Debug File] No backend domain configured for project');
            return;
        }
        
        let projectUrl = projectBackendDomain;
        if (!projectUrl.startsWith('http://') && !projectUrl.startsWith('https://')) {
            projectUrl = 'http://' + projectUrl;
        }
        // Remove trailing slash from projectUrl if present, then add script path
        projectUrl = projectUrl.replace(/\/+$/, '');
        // Use PHP script
        const scriptUrl = `${projectUrl}/debug_log_helper.php?action=write`;
        
        // Send HTTP POST request
        const formData = new URLSearchParams();
        formData.append('file', fullFilePath);
        formData.append('content', text);
        
        fetch(scriptUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: formData
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
                    console.log(`[Combined Debug File] Success: ${data.message}`);
                } else {
                    console.log(`[Combined Debug File] Failed: ${data.message}`);
                }
            } else {
                console.log(`[Combined Debug File] Unexpected response format: ${JSON.stringify(data)}`);
            }
        })
        .catch(error => {
            console.log(`[Combined Debug File] Error: ${error.message || String(error)}`);
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

// Update project file status icon
function updateProjectFileStatusIcon(status) {
    if (!projectFileStatus) return;
    
    // Remove all status classes
    projectFileStatus.classList.remove('fa-file-circle-check', 'fa-file-circle-question', 'fa-file-circle-xmark');
    
    switch (status) {
        case 'check':
            projectFileStatus.classList.add('fa-file-circle-check');
            projectFileStatus.title = 'All files found and working';
            break;
        case 'question':
            projectFileStatus.classList.add('fa-file-circle-question');
            projectFileStatus.title = 'Missing configuration or files';
            break;
        case 'error':
            projectFileStatus.classList.add('fa-file-circle-xmark');
            projectFileStatus.title = 'File not found or invalid (404)';
            break;
        default:
            projectFileStatus.classList.add('fa-file-circle-question');
            projectFileStatus.title = 'Checking file status...';
    }
}

// Check project file status
function checkProjectFileStatus(project) {
    if (!project) {
        updateProjectFileStatusIcon('question');
        return;
    }
    
    // Check if backend folder is set
    if (!project.folder || !project.folder.trim()) {
        updateProjectFileStatusIcon('question');
        return;
    }
    
    // Check if log file path is set
    const logFilePath = project.logFilePath || 'debug.log';
    if (!logFilePath || !logFilePath.trim()) {
        updateProjectFileStatusIcon('question');
        return;
    }
    
    // Check if combined debug file path is set
    if (!project.combinedDebugFilePath || !project.combinedDebugFilePath.trim()) {
        updateProjectFileStatusIcon('question');
        return;
    }
    
    // All configuration is present, now check if the PHP helper file is accessible
    const projectBackendDomain = project.backendDomain || project.domain;
    if (!projectBackendDomain) {
        updateProjectFileStatusIcon('question');
        return;
    }
    
    let projectUrl = projectBackendDomain;
    if (!projectUrl.startsWith('http://') && !projectUrl.startsWith('https://')) {
        projectUrl = 'http://' + projectUrl;
    }
    projectUrl = projectUrl.replace(/\/+$/, '');
    const scriptUrl = `${projectUrl}/debug_log_helper.php?action=clear&log=test`;
    
    // Try to access the helper file
    fetch(scriptUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
    })
    .then(response => {
        if (response.status === 404) {
            updateProjectFileStatusIcon('error');
        } else if (response.ok || response.status < 500) {
            // File exists (even if test log doesn't exist, the script should respond)
            updateProjectFileStatusIcon('check');
        } else {
            updateProjectFileStatusIcon('error');
        }
    })
    .catch(error => {
        // Network error or file not found
        updateProjectFileStatusIcon('error');
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
                // Load network filter strings for the active project
                loadNetworkFilterFromProject(project);
                // Check file status
                checkProjectFileStatus(project);
            } else {
                activeProjectName.textContent = 'No Project';
                updateProjectFileStatusIcon('question'); // Yellow - no project
            }
        } else {
            activeProjectName.textContent = 'No Project';
            updateProjectFileStatusIcon('question'); // Yellow - no project
            // Reset to default if no active project
            if (errorFilterInput) {
                errorFilterInput.value = 'ERROR';
            }
            if (searchInput) {
                searchInput.value = '';
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
            <div class="dropdown-item" style="padding: 10px 15px; color: #ffffff;">
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
                    <div style="font-weight: ${isActive ? '600' : '400'}; color: #ffffff;">
                        ${escapeHtml(project.name)}
                    </div>
                    <div style="font-size: 11px; color: #ffffff; margin-top: 2px;">
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
                const isActive = projectId === activeProjectId;
                if (isActive) {
                    // If clicking the active/selected row, open Edit for that project
                    editProject(projectId);
                } else {
                    // Otherwise, select the project
                    selectProject(projectId);
                }
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
                    let filteredLogs = consoleLogs;
                    if (hasFilter && filterState) {
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
                    }
                    
                    // Get trimmed logs for stats (what would actually be copied)
                    chrome.storage.local.get(['consoleViewerTrimSelection'], (trimResult) => {
                        const trimSelection = trimResult.consoleViewerTrimSelection;
                        let trimmedLogs = filteredLogs;
                        
                        if (trimSelection && trimSelection.selectedStartIndex !== null) {
                            if (trimSelection.selectedEndIndex !== null) {
                                // Both start and end selected
                                trimmedLogs = filteredLogs.slice(trimSelection.selectedStartIndex, trimSelection.selectedEndIndex + 1);
                            } else {
                                // Only start selected - from start to end
                                trimmedLogs = filteredLogs.slice(trimSelection.selectedStartIndex);
                            }
                        }
                        
                        // Calculate stats for trimmed logs (what will be copied)
                        trimmedLogs.forEach(log => {
                            const message = formatConsoleLogMessage(log);
                            const lines = message.split('\n').length;
                            filteredConsoleLines += lines;
                            
                            // Estimate tokens (rough approximation: ~4 characters per token)
                            const text = message + (log.stack || '');
                            filteredConsoleTokens += Math.ceil(text.length / 4);
                        });
                        
                        // Add console header
                        if (consoleLogs.length > 0) {
                            consoleLines += 2; // "Console Logs:\n" + separator
                            if (trimmedLogs.length > 0) {
                                filteredConsoleLines += 2; // "Console Logs:\n" + separator
                            }
                        }
                        
                        // Update display with combined stats (including trimmed info)
                        // Trimmed counts include selected network requests + trimmed console logs
                        const hasTrimSelection = trimSelection && trimSelection.selectedStartIndex !== null;
                        updateStatsDisplay(networkLines + consoleLines, networkTokens + consoleTokens, 
                            hasTrimSelection && filteredConsoleLines > 0 ? networkLines + filteredConsoleLines : null, 
                            hasTrimSelection && filteredConsoleTokens > 0 ? networkTokens + filteredConsoleTokens : null);
                    });
                } else {
                    // No console logs, update display with just network stats
                    updateStatsDisplay(networkLines, networkTokens);
                }
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
            // Copy trimmed console logs even if empty (will show header)
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
            // Get trimmed console logs
            chrome.storage.local.get(['consoleViewerFilter'], (filterResult) => {
                const filterState = filterResult.consoleViewerFilter;
                getTrimmedConsoleLogs(consoleLogs, filterState).then(trimmedLogs => {
                    copyToClipboardWithConsole(selectedRequests, trimmedLogs);
                });
            });
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
    
    // Group selected requests if combine is enabled
    let requestsToProcess;
    if (combineEnabled) {
        const groupedSelected = groupRequests(selectedRequests);
        requestsToProcess = groupedSelected.map(group => ({
            requests: group.requests,
            count: group.count,
            representative: group.representative
        }));
    } else {
        requestsToProcess = selectedRequests.map(req => ({
            requests: [req],
            count: 1,
            representative: req
        }));
    }
    
    requestsToProcess.forEach((group, index) => {
        if (index > 0) {
            text += '\n' + '='.repeat(80) + '\n\n';
        }
        
        const req = group.representative;
        const countNotation = group.count > 1 ? ` (x${group.count})` : '';
        text += `Request ${index + 1}${countNotation}:\n`;
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

// Get trimmed console logs based on trim selection from storage
function getTrimmedConsoleLogs(consoleLogs, filterState) {
    // Apply filters first to get filtered logs
    let filteredLogs = consoleLogs;
    
    if (filterState) {
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
    }
    
    // Get trim selection from storage
    return new Promise((resolve) => {
        chrome.storage.local.get(['consoleViewerTrimSelection'], (result) => {
            const trimSelection = result.consoleViewerTrimSelection;
            let trimmedLogs = filteredLogs;
            
            if (trimSelection && trimSelection.selectedStartIndex !== null) {
                if (trimSelection.selectedEndIndex !== null) {
                    // Both start and end selected - copy range
                    trimmedLogs = filteredLogs.slice(trimSelection.selectedStartIndex, trimSelection.selectedEndIndex + 1);
                } else {
                    // Only start selected - copy from start to end of filtered logs
                    trimmedLogs = filteredLogs.slice(trimSelection.selectedStartIndex);
                }
            }
            
            resolve(trimmedLogs);
        });
    });
}

// Copy console logs only to clipboard
function copyConsoleOnlyToClipboard(consoleLogs) {
    // Get filter state and trimmed logs
    chrome.storage.local.get(['consoleViewerFilter'], (filterResult) => {
        const filterState = filterResult.consoleViewerFilter;
        
        getTrimmedConsoleLogs(consoleLogs, filterState).then(trimmedLogs => {
            let text = '';
            
            text += 'Console Logs:\n';
            text += '='.repeat(80) + '\n\n';
            
            if (trimmedLogs.length === 0) {
                text += 'No console logs captured.\n';
            } else {
                trimmedLogs.forEach((log, index) => {
                    const timestamp = formatConsoleTimestamp(log.timestamp);
                    const level = log.level.toUpperCase();
                    const message = formatConsoleLogMessage(log);
                    const stack = log.stack ? '\n' + log.stack : '';
                    
                    text += `[${timestamp}] [${level}] ${message}${stack}`;
                    if (index < trimmedLogs.length - 1) {
                        text += '\n';
                    }
                });
            }
            
            copyTextToClipboard(text);
        });
    });
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
    
    // Group selected requests if combine is enabled
    let requestsToProcess;
    if (combineEnabled) {
        const groupedSelected = groupRequests(selectedRequests);
        requestsToProcess = groupedSelected.map(group => ({
            requests: group.requests,
            count: group.count,
            representative: group.representative
        }));
    } else {
        requestsToProcess = selectedRequests.map(req => ({
            requests: [req],
            count: 1,
            representative: req
        }));
    }
    
    requestsToProcess.forEach((group, index) => {
        if (index > 0) {
            text += '\n' + '='.repeat(80) + '\n\n';
        }
        
        const req = group.representative;
        const countNotation = group.count > 1 ? ` (x${group.count})` : '';
        text += `Request ${index + 1}${countNotation}:\n`;
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
        // Write to combined debug file if configured
        writeToCombinedDebugFile(text);
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
        // Load filter states for the active project (or fallback to global if no project)
        loadFilterStateFromActiveProject();
        loadCombineStateFromActiveProject();
        // Also load filter input values
        if (activeProjectId) {
            loadErrorFilterFromActiveProject();
            loadNetworkFilterFromActiveProject();
        }
    });
}

// Select/activate a project
function selectProject(projectId) {
    activeProjectId = projectId;
    chrome.storage.local.set({ activeProjectId: projectId }, () => {
        loadProjects(); // Refresh to show active state
        loadErrorFilterFromActiveProject(); // Load error filter strings for the selected project
        loadNetworkFilterFromActiveProject(); // Load network filter strings for the selected project
        loadFilterStateFromActiveProject(); // Load filter button states for the selected project
        loadCombineStateFromActiveProject(); // Load combine state for the selected project
        // Check file status for selected project
        chrome.storage.local.get(['projects'], (result) => {
            const projects = result.projects || [];
            const project = projects.find(p => p.id === projectId);
            if (project) {
                checkProjectFileStatus(project);
            }
        });
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
        const combinedDebugFile = document.getElementById('projectCombinedDebugFile').value.trim() || '';
        const networkFilterSuggestions = document.getElementById('projectNetworkFilterSuggestions').value.trim() || '';
        const errorFilterSuggestions = document.getElementById('projectErrorFilterSuggestions').value.trim() || '';
        const consoleFilterSuggestions = document.getElementById('projectConsoleFilterSuggestions').value.trim() || '';

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
                    logFilePath: logFile,
                    combinedDebugFilePath: combinedDebugFile,
                    networkFilterSuggestions: networkFilterSuggestions,
                    errorFilterSuggestions: errorFilterSuggestions,
                    consoleFilterSuggestions: consoleFilterSuggestions
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
                combinedDebugFilePath: combinedDebugFile,
                networkFilterSuggestions: networkFilterSuggestions,
                errorFilterSuggestions: errorFilterSuggestions,
                consoleFilterSuggestions: consoleFilterSuggestions,
                errorFilterStrings: 'ERROR', // Default error filter
                networkFilterStrings: '', // Default network filter (empty)
                currentFilter: 'all', // Default filter type
                errorsFilterActive: false, // Default errors filter state
                combineEnabled: true, // Default combine state (ON)
                createdAt: Date.now()
            };
            projects.push(newProject);
        }
        
        chrome.storage.local.set({ projects: projects }, () => {
            loadProjects();
            closeProjectForm();
            updateActiveProjectDisplay();
            updateReloadButton();
            // Check file status after saving
            if (editingProjectId || activeProjectId) {
                const savedProject = projects.find(p => p.id === (editingProjectId || activeProjectId));
                if (savedProject) {
                    checkProjectFileStatus(savedProject);
                }
            }
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
            document.getElementById('projectCombinedDebugFile').value = project.combinedDebugFilePath || '';
            document.getElementById('projectNetworkFilterSuggestions').value = project.networkFilterSuggestions || '';
            document.getElementById('projectErrorFilterSuggestions').value = project.errorFilterSuggestions || '';
            document.getElementById('projectConsoleFilterSuggestions').value = project.consoleFilterSuggestions || '';
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

// Load network filter from active project
function loadNetworkFilterFromActiveProject() {
    if (!activeProjectId || !searchInput) return;
    
    chrome.storage.local.get(['projects'], (result) => {
        const projects = result.projects || [];
        const project = projects.find(p => p.id === activeProjectId);
        if (project) {
            loadNetworkFilterFromProject(project);
        }
    });
}

// Load network filter from a project object
function loadNetworkFilterFromProject(project) {
    if (!searchInput) return;
    
    // Use project's network filter strings, or default to empty string
    const networkFilter = project.networkFilterStrings || '';
    searchInput.value = networkFilter;
}

// Save network filter strings to active project
function saveNetworkFilterToActiveProject() {
    if (!activeProjectId || !searchInput) return;
    
    const networkFilterValue = searchInput.value.trim();
    
    chrome.storage.local.get(['projects'], (result) => {
        const projects = result.projects || [];
        const projectIndex = projects.findIndex(p => p.id === activeProjectId);
        
        if (projectIndex !== -1) {
            projects[projectIndex] = {
                ...projects[projectIndex],
                networkFilterStrings: networkFilterValue
            };
            
            chrome.storage.local.set({ projects: projects }, () => {
                // Saved successfully
            });
        }
    });
}

// Update network results header (count display)
function updateNetworkResultsHeader() {
    if (!networkResultsCount) return;
    
    const count = filteredRequests.length;
    
    // Build filter notation with actual filter strings
    const filterParts = [];
    if (currentFilter !== 'all') {
        filterParts.push(currentFilter.toUpperCase());
    }
    if (errorsFilterActive && errorFilterInput && errorFilterInput.value.trim()) {
        const errorFilterStr = errorFilterInput.value.trim();
        filterParts.push(`Errors: ${errorFilterStr}`);
    }
    if (searchInput && searchInput.value.trim()) {
        const searchStr = searchInput.value.trim();
        filterParts.push(searchStr);
    }
    
    let filterNotation = '';
    if (filterParts.length > 0) {
        filterNotation = ` [${filterParts.join(', ')}]`;
    }
    
    networkResultsCount.textContent = `${count} ${count === 1 ? 'result' : 'results'}${filterNotation}`;
}

// Copy list of URLs to clipboard
function copyUrlsList() {
    if (filteredRequests.length === 0) {
        return;
    }
    
    // Group requests if combine is enabled
    const groupedRequests = groupRequests(filteredRequests);
    
    // Format: URL | Timestamp | Method | Status | Initiator
    // Calculate timing relative to first request
    const allRequestsFlat = groupedRequests.flatMap(group => group.requests);
    const sortedRequests = [...allRequestsFlat].sort((a, b) => a.timestamp - b.timestamp);
    const firstTimestamp = sortedRequests[0].timestamp;
    
    // Build output based on combine state
    let urlsText;
    if (combineEnabled) {
        // Use grouped representation
        const sortedGroups = [...groupedRequests].sort((a, b) => a.representative.timestamp - b.representative.timestamp);
        urlsText = sortedGroups.map(group => {
            const req = group.representative;
            const isPending = req.pending === true || req.status === null || req.status === undefined;
            const timing = req.timestamp - firstTimestamp;
            const timingMs = timing > 0 ? `+${timing}ms` : '0ms';
            const method = req.method || 'GET';
            const status = isPending ? 'Pending' : `${req.status} ${req.statusText || ''}`.trim();
            const initiator = req.initiator || 'Unknown';
            const countNotation = group.count > 1 ? ` (x${group.count})` : '';
            
            return `${req.url} | ${timingMs} | ${method} | ${status} | ${initiator}${countNotation}`;
        }).join('\n');
    } else {
        // Use all requests individually
        urlsText = sortedRequests.map(req => {
            const isPending = req.pending === true || req.status === null || req.status === undefined;
            const timing = req.timestamp - firstTimestamp;
            const timingMs = timing > 0 ? `+${timing}ms` : '0ms';
            const method = req.method || 'GET';
            const status = isPending ? 'Pending' : `${req.status} ${req.statusText || ''}`.trim();
            const initiator = req.initiator || 'Unknown';
            
            return `${req.url} | ${timingMs} | ${method} | ${status} | ${initiator}`;
        }).join('\n');
    }
    
    navigator.clipboard.writeText(urlsText).then(() => {
        // Show feedback
        if (copyUrlsBtn) {
            const originalText = copyUrlsBtn.textContent;
            copyUrlsBtn.textContent = 'Copied!';
            copyUrlsBtn.style.background = '#45a049';
            setTimeout(() => {
                copyUrlsBtn.textContent = originalText;
                copyUrlsBtn.style.background = '';
            }, 2000);
        }
    }).catch(err => {
        console.error('Failed to copy URLs:', err);
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

// ==================== FILTER SUGGESTIONS ====================

// Show network search suggestions from active project
function showNetworkSearchSuggestions() {
    if (!networkSearchSuggestions) return;

    chrome.storage.local.get(['projects', 'activeProjectId'], (result) => {
        const projects = result.projects || [];
        const activeProjectId = result.activeProjectId;
        const project = projects.find(p => p.id === activeProjectId);

        if (!project || !project.networkFilterSuggestions) {
            hideNetworkSearchSuggestions();
            return;
        }

        const suggestions = project.networkFilterSuggestions
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        if (suggestions.length === 0) {
            hideNetworkSearchSuggestions();
            return;
        }

        const currentValue = searchInput.value.toLowerCase();
        const filteredSuggestions = suggestions.filter(s =>
            s.toLowerCase().includes(currentValue) || currentValue === ''
        );

        if (filteredSuggestions.length === 0) {
            hideNetworkSearchSuggestions();
            return;
        }

        networkSearchSuggestions.innerHTML = filteredSuggestions.map(suggestion => `
            <div class="suggestion-item" data-suggestion="${escapeHtml(suggestion)}">${escapeHtml(suggestion)}</div>
        `).join('');

        // Add click handlers to suggestions
        networkSearchSuggestions.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const value = e.target.getAttribute('data-suggestion');
                searchInput.value = value;
                filterRequests();
                saveNetworkFilterToActiveProject();
                hideNetworkSearchSuggestions();
            });
        });

        networkSearchSuggestions.classList.remove('hidden');
    });
}

// Hide network search suggestions
function hideNetworkSearchSuggestions() {
    if (networkSearchSuggestions) {
        networkSearchSuggestions.classList.add('hidden');
    }
}

// Show error filter suggestions from active project
function showErrorFilterSuggestions() {
    if (!errorFilterSuggestions) return;

    chrome.storage.local.get(['projects', 'activeProjectId'], (result) => {
        const projects = result.projects || [];
        const activeProjectId = result.activeProjectId;
        const project = projects.find(p => p.id === activeProjectId);

        if (!project || !project.errorFilterSuggestions) {
            hideErrorFilterSuggestions();
            return;
        }

        const suggestions = project.errorFilterSuggestions
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        if (suggestions.length === 0) {
            hideErrorFilterSuggestions();
            return;
        }

        const currentValue = errorFilterInput.value.toLowerCase();
        const filteredSuggestions = suggestions.filter(s =>
            s.toLowerCase().includes(currentValue) || currentValue === ''
        );

        if (filteredSuggestions.length === 0) {
            hideErrorFilterSuggestions();
            return;
        }

        errorFilterSuggestions.innerHTML = filteredSuggestions.map(suggestion => `
            <div class="suggestion-item" data-suggestion="${escapeHtml(suggestion)}">${escapeHtml(suggestion)}</div>
        `).join('');

        // Add click handlers to suggestions
        errorFilterSuggestions.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const value = e.target.getAttribute('data-suggestion');
                errorFilterInput.value = value;
                filterRequests();
                saveErrorFilterToActiveProject();
                hideErrorFilterSuggestions();
            });
        });

        errorFilterSuggestions.classList.remove('hidden');
    });
}

// Hide error filter suggestions
function hideErrorFilterSuggestions() {
    if (errorFilterSuggestions) {
        errorFilterSuggestions.classList.add('hidden');
    }
}

// Save network filter value to project's networkFilterSuggestions on blur
function saveNetworkFilterToSuggestions() {
    const filterValue = searchInput ? searchInput.value.trim() : '';
    if (!filterValue) return;

    chrome.storage.local.get(['projects', 'activeProjectId'], (result) => {
        const projects = result.projects || [];
        const activeProjectId = result.activeProjectId;

        if (!activeProjectId) return;

        const projectIndex = projects.findIndex(p => p.id === activeProjectId);
        if (projectIndex === -1) return;

        const project = projects[projectIndex];
        const existingSuggestions = project.networkFilterSuggestions || '';

        // Parse existing suggestions into array
        const suggestionsArray = existingSuggestions
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        // Check if filter value already exists (case-insensitive)
        const filterLower = filterValue.toLowerCase();
        const alreadyExists = suggestionsArray.some(s => s.toLowerCase() === filterLower);

        if (!alreadyExists) {
            // Add to beginning of suggestions
            suggestionsArray.unshift(filterValue);

            // Limit to 20 suggestions
            if (suggestionsArray.length > 20) {
                suggestionsArray.pop();
            }

            // Save back to project
            projects[projectIndex] = {
                ...project,
                networkFilterSuggestions: suggestionsArray.join(', ')
            };

            chrome.storage.local.set({ projects: projects });
        }
    });
}

// Save error filter value to project's errorFilterSuggestions on blur
function saveErrorFilterToSuggestions() {
    const filterValue = errorFilterInput ? errorFilterInput.value.trim() : '';
    if (!filterValue) return;

    chrome.storage.local.get(['projects', 'activeProjectId'], (result) => {
        const projects = result.projects || [];
        const activeProjectId = result.activeProjectId;

        if (!activeProjectId) return;

        const projectIndex = projects.findIndex(p => p.id === activeProjectId);
        if (projectIndex === -1) return;

        const project = projects[projectIndex];
        const existingSuggestions = project.errorFilterSuggestions || '';

        // Parse existing suggestions into array
        const suggestionsArray = existingSuggestions
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        // Check if filter value already exists (case-insensitive)
        const filterLower = filterValue.toLowerCase();
        const alreadyExists = suggestionsArray.some(s => s.toLowerCase() === filterLower);

        if (!alreadyExists) {
            // Add to beginning of suggestions
            suggestionsArray.unshift(filterValue);

            // Limit to 20 suggestions
            if (suggestionsArray.length > 20) {
                suggestionsArray.pop();
            }

            // Save back to project
            projects[projectIndex] = {
                ...project,
                errorFilterSuggestions: suggestionsArray.join(', ')
            };

            chrome.storage.local.set({ projects: projects });
        }
    });
}

