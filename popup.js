document.addEventListener('DOMContentLoaded', function() {
    const modeSelect = document.getElementById('mode');
    const videoCountGroup = document.getElementById('video-count-group');
    const timeDurationGroup = document.getElementById('time-duration-group');
    const timeUnitSelect = document.getElementById('timeUnit');
    const durationInput = document.getElementById('duration');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const statusDiv = document.getElementById('status');
    const statsDiv = document.getElementById('stats');
    
    let statusInterval = null;
    
    modeSelect.addEventListener('change', function() {
        const mode = this.value;
        videoCountGroup.style.display = mode === 'video_count' ? 'block' : 'none';
        timeDurationGroup.style.display = mode === 'time_duration' ? 'block' : 'none';
    });
    
    timeUnitSelect.addEventListener('change', function() {
        const unit = this.value;
        if (unit === 'seconds') {
            durationInput.max = 3600;
            durationInput.placeholder = "Max: 3600";
        } else {
            durationInput.max = 60;
            durationInput.placeholder = "Max: 60";
        }
    });
    
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const tab = tabs[0];
        if (!tab.url.includes('youtube.com')) {
            startBtn.disabled = true;
            statusDiv.textContent = 'Please navigate to YouTube';
            return;
        }
        
        chrome.tabs.sendMessage(tab.id, {action: 'getStatus'}, function(response) {
            if (chrome.runtime.lastError) {
                console.log('Content script not ready:', chrome.runtime.lastError);
                return;
            }
            if (response) {
                updateUI(response);
                if (response.isRunning) {
                    startStatusUpdates();
                }
            }
        });
    });
    
    startBtn.addEventListener('click', function() {
        const mode = modeSelect.value;
        const videoCount = parseInt(document.getElementById('videoCount').value);
        const timeUnit = timeUnitSelect.value;
        const duration = parseInt(durationInput.value);
        const actionType = document.getElementById('actionType').value;
        const delay = parseInt(document.getElementById('delay').value);
        
        let durationMs = duration;
        if (timeUnit === 'minutes') {
            durationMs = duration * 60 * 1000;
        } else {
            durationMs = duration * 1000;
        }
        
        const config = {
            mode: mode,
            videoCount: videoCount,
            duration: durationMs,
            actionType: actionType,
            delay: delay
        };
        
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {
                action: 'start',
                config: config
            }, function(response) {
                if (chrome.runtime.lastError) {
                    console.error('Error starting:', chrome.runtime.lastError);
                    return;
                }
                startStatusUpdates();
            });
        });
    });
    
    stopBtn.addEventListener('click', function() {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.sendMessage(tabs[0].id, {action: 'stop'}, function(response) {
                if (chrome.runtime.lastError) {
                    console.error('Error stopping:', chrome.runtime.lastError);
                }
                stopStatusUpdates();
            });
        });
    });
    
    chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
        if (request.action === 'statusUpdate') {
            updateUI(request.status);
        }
    });
    
    function startStatusUpdates() {
        if (statusInterval) clearInterval(statusInterval);
        
        statusInterval = setInterval(function() {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (tabs[0]) {
                    chrome.tabs.sendMessage(tabs[0].id, {action: 'getStatus'}, function(response) {
                        if (chrome.runtime.lastError) {
                            stopStatusUpdates();
                            return;
                        }
                        if (response) {
                            updateUI(response);
                            if (!response.isRunning) {
                                stopStatusUpdates();
                            }
                        }
                    });
                }
            });
        }, 1000);
    }
    
    function stopStatusUpdates() {
        if (statusInterval) {
            clearInterval(statusInterval);
            statusInterval = null;
        }
    }
    
    function updateUI(status) {
        if (status.isRunning) {
            startBtn.disabled = true;
            stopBtn.disabled = false;
            statusDiv.className = 'status active';
            statusDiv.textContent = 'Status: Running';
        } else {
            startBtn.disabled = false;
            stopBtn.disabled = true;
            statusDiv.className = 'status inactive';
            statusDiv.textContent = 'Status: Inactive';
        }
        
        const elapsed = Math.floor((Date.now() - (status.startTime || Date.now())) / 1000);
        let timeRemainingText = 'N/A';
        
        if (status.isRunning && status.config) {
            if (status.config.mode === 'time_duration') {
                const totalDuration = Math.floor(status.config.duration / 1000);
                const remaining = Math.max(0, totalDuration - elapsed);
                timeRemainingText = `${remaining}s`;
            } else if (status.config.mode === 'video_count') {
                const remaining = Math.max(0, status.config.videoCount - status.videosProcessed);
                timeRemainingText = `${remaining} videos`;
            }
        }
        
        statsDiv.innerHTML = `
            Videos processed: ${status.videosProcessed || 0}<br>
            Time elapsed: ${elapsed}s<br>
            Time remaining: ${timeRemainingText}
        `;
    }
    
    window.addEventListener('unload', function() {
        stopStatusUpdates();
    });
});
