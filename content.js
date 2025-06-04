class YouTubeAlgorithmReset {
    constructor() {
        this.isRunning = false;
        this.config = null;
        this.startTime = null;
        this.videosProcessed = 0;
        this.intervalId = null;
        this.timeoutId = null;
        this.statusUpdateInterval = null;
        this.currentScrollPosition = 0;
        this.maxScrollAttempts = 5;
        this.scrollAttempts = 0;
        this.lastContentHeight = 0;
        this.noNewContentCount = 0;
        this.maxNoNewContentAttempts = 3;
        
        if (chrome.runtime && chrome.runtime.onMessage) {
            chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                this.handleMessage(request, sender, sendResponse);
                return true;
            });
        }
    }
    
    handleMessage(request, sender, sendResponse) {
        switch (request.action) {
            case 'start':
                this.start(request.config);
                sendResponse({ success: true });
                break;
            case 'stop':
                this.stop();
                sendResponse({ success: true });
                break;
            case 'getStatus':
                sendResponse(this.getStatus());
                break;
        }
    }
    
    start(config) {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.config = config;
        this.startTime = Date.now();
        this.videosProcessed = 0;
        this.currentScrollPosition = 0;
        this.scrollAttempts = 0;
        this.lastContentHeight = document.documentElement.scrollHeight;
        this.noNewContentCount = 0;
        
        console.log('Starting YouTube Algorithm Reset', config);
        
        if (config.mode === 'time_duration') {
            this.timeoutId = setTimeout(() => {
                console.log('Time duration reached, stopping...');
                this.stop();
            }, config.duration);
        }
        
        this.startStatusUpdates();
        
        this.processPage();
        
        this.updateStatus();
    }
    
    stop() {
        if (!this.isRunning) return;
        
        this.isRunning = false;
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
            this.statusUpdateInterval = null;
        }
        
        console.log(`YouTube Algorithm Reset stopped. Processed ${this.videosProcessed} videos.`);
        this.updateStatus();
    }
    
    startStatusUpdates() {
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
        }
        
        this.statusUpdateInterval = setInterval(() => {
            if (this.isRunning) {
                if (this.config.mode === 'time_duration') {
                    const elapsed = Date.now() - this.startTime;
                    if (elapsed >= this.config.duration) {
                        console.log('Time limit reached during status check, stopping...');
                        this.stop();
                        return;
                    }
                }
                this.updateStatus();
            }
        }, 500);
    }
    
    async processPage() {
        if (!this.isRunning) return;
        
        try {
            if (this.config.mode === 'video_count' && this.videosProcessed >= this.config.videoCount) {
                console.log(`Video count limit reached (${this.videosProcessed}/${this.config.videoCount}), stopping...`);
                this.stop();
                return;
            }
            
            if (this.config.mode === 'time_duration') {
                const elapsed = Date.now() - this.startTime;
                if (elapsed >= this.config.duration) {
                    console.log('Time limit reached during processing, stopping...');
                    this.stop();
                    return;
                }
            }
            
            const processedCount = await this.clickActionButtons();
            
            if (processedCount > 0) {
                this.videosProcessed += processedCount;
                console.log(`Processed ${processedCount} videos. Total: ${this.videosProcessed}`);
                
                this.updateStatus();
                
                if (this.config.mode === 'video_count' && this.videosProcessed >= this.config.videoCount) {
                    console.log(`Video count target reached (${this.videosProcessed}/${this.config.videoCount}), stopping...`);
                    this.stop();
                    return;
                }
            }
            
            const hasNewContent = await this.loadMoreContent();
            
            if (!hasNewContent) {
                console.log('No more content available, stopping...');
                this.stop();
                return;
            }
            
            setTimeout(() => {
                if (this.isRunning) {
                    this.processPage();
                }
            }, Math.max(500, this.config.delay));
            
        } catch (error) {
            console.error('Error in processPage:', error);
            this.stop();
        }
    }
    
    async clickActionButtons() {
        const videos = this.findVideoElements();
        let processedCount = 0;
        
        console.log(`Found ${videos.length} unprocessed videos on current view`);
        
        for (const video of videos) {
            if (!this.isRunning) break;
            
            if (this.config.mode === 'video_count') {
                const totalAfterThis = this.videosProcessed + processedCount + 1;
                if (totalAfterThis > this.config.videoCount) {
                    console.log(`Would exceed video limit (${totalAfterThis} > ${this.config.videoCount}), stopping processing`);
                    break;
                }
            }
            
            if (this.config.mode === 'time_duration') {
                const elapsed = Date.now() - this.startTime;
                if (elapsed >= this.config.duration) {
                    console.log('Time limit reached while processing videos');
                    break;
                }
            }
            
            try {
                const success = await this.clickActionForVideo(video);
                if (success) {
                    processedCount++;
                    const newTotal = this.videosProcessed + processedCount;
                    console.log(`Successfully processed video ${newTotal}`);
                    
                    if (this.config.mode === 'video_count' && newTotal >= this.config.videoCount) {
                        console.log(`Reached target of ${this.config.videoCount} videos, breaking loop`);
                        break;
                    }
                }
                
                await this.sleep(Math.max(200, this.config.delay / 4));
                
            } catch (error) {
                console.error('Error clicking action:', error);
            }
        }
        
        return processedCount;
    }
    
    findVideoElements() {
        const selectors = [
            'ytd-rich-item-renderer',
            'ytd-video-renderer',
            'ytd-compact-video-renderer',
            'ytd-grid-video-renderer',
            'ytd-playlist-renderer'
        ];
        
        const videos = [];
        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);
            videos.push(...Array.from(elements));
        }
        
        return videos.filter(video => {
            const isProcessed = video.hasAttribute('data-reset-processed');
            const isVisible = this.isElementVisible(video);
            return !isProcessed && isVisible;
        });
    }
    
    isElementVisible(element) {
        const rect = element.getBoundingClientRect();
        const viewHeight = window.innerHeight;
        const viewWidth = window.innerWidth;
        
        return (
            rect.top < viewHeight &&
            rect.bottom > 0 &&
            rect.left < viewWidth &&
            rect.right > 0 &&
            rect.width > 0 &&
            rect.height > 0
        );
    }
    
    async clickActionForVideo(videoElement) {
        try {
            videoElement.setAttribute('data-reset-processed', 'true');
            
            const menuSelectors = [
                '#button[aria-label*="Action menu"]',
                'button[aria-label*="More actions"]',
                '#menu-button',
                'button[aria-label*="More options"]',
                'yt-icon-button#button[aria-label*="More"]',
                'button[aria-label="Action menu"]'
            ];
            
            let menuButton = null;
            for (const selector of menuSelectors) {
                menuButton = videoElement.querySelector(selector);
                if (menuButton && this.isElementVisible(menuButton)) break;
            }
            
            if (!menuButton) {
                console.log('Menu button not found for video');
                return false;
            }
            
            menuButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await this.sleep(200);
            
            menuButton.click();
            await this.sleep(800);
            
            const actionButton = this.findActionButton();
            
            if (actionButton) {
                actionButton.click();
                await this.sleep(500);
                
                const confirmButton = document.querySelector(
                    'yt-button-renderer[dialog-confirm], ' +
                    '[role="button"][aria-label*="confirm"], ' +
                    'button[aria-label*="Yes"], ' +
                    'tp-yt-paper-button:contains("Yes")'
                );
                if (confirmButton) {
                    confirmButton.click();
                    await this.sleep(300);
                }
                
                return true;
            } else {
                console.log('Action button not found, closing menu');
                document.body.click();
                await this.sleep(300);
                return false;
            }
            
        } catch (error) {
            console.error('Error in clickActionForVideo:', error);
            return false;
        }
    }
    
    findActionButton() {
        const menuItems = document.querySelectorAll(
            'ytd-menu-service-item-renderer, ' +
            '[role="menuitem"], ' +
            'tp-yt-paper-item, ' +
            'ytd-menu-navigation-item-renderer, ' +
            'yt-formatted-string' +
            'yt-list-view-model'
        );
        
        const actionType = this.config.actionType;
        
        for (const item of menuItems) {
            const text = item.textContent.toLowerCase().trim();
            
            if (actionType === 'not_interested') {
                if (text.includes('not interested') || text.includes('don\'t recommend')) {
                    return item;
                }
            } else if (actionType === 'dont_recommend_channel') {
                if (text.includes('don\'t recommend channel') || text.includes('don\'t recommend this channel')) {
                    return item;
                }
            }
        }
        
        if (actionType === 'dont_recommend_channel') {
            for (const item of menuItems) {
                const text = item.textContent.toLowerCase().trim();
                if (text.includes('not interested') || text.includes('don\'t recommend')) {
                    console.log('Fallback: Using "Not interested" instead of "Don\'t recommend channel"');
                    return item;
                }
            }
        }
        
        return null;
    }
    
    async loadMoreContent() {
        const initialHeight = document.documentElement.scrollHeight;
        const initialVideoCount = document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer').length;
        
        window.scrollTo(0, document.documentElement.scrollHeight);
        
        await this.sleep(3000);
        
        const newHeight = document.documentElement.scrollHeight;
        const newVideoCount = document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer').length;
        
        if (newHeight > initialHeight || newVideoCount > initialVideoCount) {
            this.noNewContentCount = 0;
            console.log(`New content loaded: height ${initialHeight} -> ${newHeight}, videos ${initialVideoCount} -> ${newVideoCount}`);
            return true;
        } else {
            this.noNewContentCount++;
            console.log(`No new content loaded (attempt ${this.noNewContentCount}/${this.maxNoNewContentAttempts})`);
            
            if (this.noNewContentCount >= this.maxNoNewContentAttempts) {
                window.scrollTo(0, 0);
                await this.sleep(1000);
                window.scrollTo(0, document.documentElement.scrollHeight);
                await this.sleep(3000);
                
                const finalHeight = document.documentElement.scrollHeight;
                const finalVideoCount = document.querySelectorAll('ytd-rich-item-renderer, ytd-video-renderer').length;
                
                if (finalHeight > newHeight || finalVideoCount > newVideoCount) {
                    this.noNewContentCount = 0;
                    console.log('New content loaded after scroll reset');
                    return true;
                } else {
                    console.log('No more content available');
                    return false;
                }
            }
            
            return true;
        }
    }
    
    getStatus() {
        return {
            isRunning: this.isRunning,
            videosProcessed: this.videosProcessed,
            startTime: this.startTime || Date.now(),
            config: this.config
        };
    }
    
    updateStatus() {
        if (chrome.runtime && chrome.runtime.sendMessage) {
            const status = this.getStatus();
            console.log('Updating status:', status);
            chrome.runtime.sendMessage({
                action: 'statusUpdate',
                status: status
            }).catch((error) => {
                console.log('Status update failed:', error);
            });
        }
    }
    
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

let youtubeReset = null;

let lastUrl = location.href;
new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
        lastUrl = url;
        if (youtubeReset) {
            youtubeReset.currentScrollPosition = 0;
            youtubeReset.scrollAttempts = 0;
            youtubeReset.noNewContentCount = 0;
        }
    }
}).observe(document, {subtree: true, childList: true});

if (!youtubeReset) {
    youtubeReset = new YouTubeAlgorithmReset();
    console.log('YouTube Algorithm Reset content script loaded');
}
